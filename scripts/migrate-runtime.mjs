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

    const grants = await database.query(
      `SELECT ARRAY[
         format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), $1::text),
         format('GRANT USAGE ON SCHEMA public TO %I', $1::text),
         format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', $1::text),
         format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', $1::text),
         format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', $1::text),
         format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', $1::text)
       ] AS statements`,
      [appUser],
    );
    for (const statement of grants.rows[0].statements) await database.exec(statement);
    console.info(`Provisioned restricted PostgreSQL application role ${appUser}`);
  }
} finally {
  await database.close();
}
