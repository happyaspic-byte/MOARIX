import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const runtimeReadTables = [
  "counterparties", "items", "warehouses", "document_counters", "documents",
  "document_lines", "inventory_balances", "inventory_movements", "assets",
  "service_cases", "audit_logs", "idempotency_records", "customer_sites",
  "maintenance_inspections", "service_case_activities", "service_case_attachments",
  "asset_nodes", "asset_network_interfaces", "asset_virtual_machines",
  "asset_support_contracts", "asset_licenses", "inspection_check_items",
  "service_case_watchers", "driving_logs", "settlements", "settlement_allocations",
  "outbound_messages",
] as const;

export async function GET() {
  try {
    const database = await getDatabase();
    if (process.env.DATABASE_DRIVER === "postgres") {
      const role = await database.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolsuper, rolbypassrls
         FROM pg_catalog.pg_roles
         WHERE rolname = current_user`,
      );
      if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
        throw new Error("The runtime database role must not bypass row-level security");
      }
      const missingGrant = await database.query<{ table_name: string }>(
        `SELECT table_name
         FROM unnest($1::text[]) AS required(table_name)
         WHERE NOT has_table_privilege(current_user, format('public.%I', table_name), 'SELECT')
         LIMIT 1`,
        [runtimeReadTables],
      );
      if (missingGrant.rows[0]) throw new Error(`Missing runtime read grant for ${missingGrant.rows[0].table_name}`);
    }
    // Exercise the restricted application's critical read grants as well as
    // connectivity. A bare SELECT 1 would report healthy while a fresh
    // database was missing grants for newly added modules.
    await database.query(`
      SELECT
        (SELECT 1 FROM public.assets LIMIT 1) AS assets_ready,
        (SELECT 1 FROM public.settlements LIMIT 1) AS settlements_ready,
        (SELECT 1 FROM public.settlement_allocations LIMIT 1) AS allocations_ready,
        (SELECT 1 FROM public.outbound_messages LIMIT 1) AS outbound_mail_ready
    `);
    return Response.json(
      { status: "ok", service: "moarix", timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "error", service: "moarix" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
