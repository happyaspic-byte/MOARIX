import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { openRuntimeDatabase } from "./runtime-db.mjs";

const database = await openRuntimeDatabase();
try {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const names = (await readdir(path.join(process.cwd(), "migrations")))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const existing = await database.query("SELECT name FROM schema_migrations WHERE name = $1", [name]);
    if (existing.rows.length > 0) continue;
    const sql = await readFile(path.join(process.cwd(), "migrations", name), "utf8");
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.info(`Applied migration ${name}`);
  }

  const appUser = process.env.DATABASE_APP_USER;
  const appPassword = process.env.DATABASE_APP_PASSWORD;
  if ((appUser || appPassword) && process.env.DATABASE_DRIVER !== "postgres") {
    throw new Error("DATABASE_APP_USER provisioning is only supported for PostgreSQL");
  }
  if (process.env.DATABASE_DRIVER === "postgres" && (appUser || appPassword)) {
    if (!appUser || !/^[a-z_][a-z0-9_]{0,62}$/.test(appUser)) {
      throw new Error("DATABASE_APP_USER must be a valid lowercase PostgreSQL role name");
    }
    if (!appPassword || appPassword.length < 16) {
      throw new Error("DATABASE_APP_PASSWORD must be at least 16 characters");
    }

    const existing = await database.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appUser]);
    const roleStatement = await database.query(
      `SELECT format(
         CASE WHEN $3::boolean THEN
           'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS'
         ELSE
           'CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS'
         END,
         $1::text, $2::text
       ) AS sql`,
      [appUser, appPassword, existing.rows.length > 0],
    );
    await database.exec(roleStatement.rows[0].sql);

    const baseGrants = await database.query(
      `SELECT ARRAY[
         format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text),
         format('GRANT USAGE ON SCHEMA public TO %I', $1::text),
         format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', $1::text),
         format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', $1::text),
         format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', $1::text),
         format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', $1::text)
       ] AS statements`,
      [appUser],
    );
    for (const statement of baseGrants.rows[0].statements) await database.exec(statement);

    const sessionColumnRevokes = await database.query(
      `SELECT format(
         'REVOKE %s (%I) ON TABLE public.sessions FROM %I',
         privilege_type,
         column_name,
         $1::text
       ) AS sql
       FROM information_schema.column_privileges
       WHERE table_schema = 'public'
         AND table_name = 'sessions'
         AND grantee = $1::text`,
      [appUser],
    );
    for (const row of sessionColumnRevokes.rows) await database.exec(row.sql);

    const apiTokenColumnRevokes = await database.query(
      `SELECT format(
         'REVOKE %s (%I) ON TABLE public.api_tokens FROM %I',
         privilege_type,
         column_name,
         $1::text
       ) AS sql
       FROM information_schema.column_privileges
       WHERE table_schema = 'public'
         AND table_name = 'api_tokens'
         AND grantee = $1::text`,
      [appUser],
    );
    for (const row of apiTokenColumnRevokes.rows) await database.exec(row.sql);

    const tenantTables = [
      "counterparties", "items", "warehouses", "document_counters", "documents",
      "document_lines", "inventory_balances", "inventory_movements", "assets",
      "service_cases", "audit_logs", "idempotency_records", "customer_sites",
      "maintenance_inspections", "service_case_activities", "service_case_attachments",
      "asset_nodes", "asset_network_interfaces", "asset_virtual_machines",
      "asset_support_contracts", "asset_licenses", "inspection_check_items",
      "service_case_watchers", "driving_logs", "settlements",
      "settlement_allocations", "outbound_messages",
    ];
    const tenantGrants = await database.query(
      `SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I', table_name, $1::text) AS sql
       FROM unnest($2::text[]) AS granted(table_name)`,
      [appUser, tenantTables],
    );
    for (const row of tenantGrants.rows) await database.exec(row.sql);

    const authGrants = await database.query(
      `SELECT ARRAY[
         format('REVOKE UPDATE (email, name, password_hash, is_active, last_login_at, updated_at) ON public.users FROM %I', $1::text),
         format('GRANT SELECT (id, name, timezone, is_active) ON public.companies TO %I', $1::text),
         format('GRANT SELECT (id, email, name, is_active, last_login_at, created_at, updated_at) ON public.users TO %I', $1::text),
         format('GRANT INSERT (id, email, name, password_hash) ON public.users TO %I', $1::text),
         format('GRANT SELECT, INSERT, UPDATE ON public.company_members TO %I', $1::text),
         format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_attempts TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_login_lookup(text) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_find_session(text) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_create_session(uuid, uuid, uuid, text, timestamptz, text, text, text) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_touch_session(uuid) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_revoke_session(text) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_revoke_user_sessions(uuid, uuid) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_list_company_sessions(uuid) TO %I', $1::text),
         format('GRANT EXECUTE ON FUNCTION public.moarix_find_api_token(text) TO %I', $1::text)
       ] AS statements`,
      [appUser],
    );
    for (const statement of authGrants.rows[0].statements) await database.exec(statement);
    console.info(`Provisioned restricted PostgreSQL application role ${appUser}`);
  }
} finally {
  await database.close();
}
