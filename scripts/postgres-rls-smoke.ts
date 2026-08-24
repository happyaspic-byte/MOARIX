import { randomUUID } from "node:crypto";
import { getDatabase, withCompany } from "../src/lib/db/client";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

if (process.env.DATABASE_DRIVER !== "postgres") throw new Error("PostgreSQL RLS smoke requires DATABASE_DRIVER=postgres");

const database = await getDatabase();
try {
  const role = await database.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT current_user, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = current_user`,
  );
  invariant(role.rows[0] && !role.rows[0].rolsuper && !role.rows[0].rolbypassrls, "Application role can bypass row-level security");

  const companyA = randomUUID();
  const companyB = randomUUID();
  const userId = randomUUID();
  const counterpartyA = randomUUID();
  const counterpartyB = randomUUID();
  const siteA = randomUUID();
  const siteB = randomUUID();
  const assetA = randomUUID();
  const assetB = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  await database.query(
    `INSERT INTO companies (id, slug, name) VALUES ($1, $2, 'RLS Company A'), ($3, $4, 'RLS Company B')`,
    [companyA, `rls-a-${suffix}`, companyB, `rls-b-${suffix}`],
  );
  await database.query(
    `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, 'RLS User', 'not-used')`,
    [userId, `rls-${suffix}@example.invalid`],
  );
  await database.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $3, 'owner'), ($2, $3, 'owner')`,
    [companyA, companyB, userId],
  );

  const createTenantAsset = (companyId: string, counterpartyId: string, siteId: string, assetId: string, label: string) => withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', $3, $4)`,
      [counterpartyId, companyId, `C-${label}`, `Customer ${label}`],
    );
    await tx.query(
      `INSERT INTO customer_sites (id, company_id, counterparty_id, code, name)
       VALUES ($1, $2, $3, $4, $5)`,
      [siteId, companyId, counterpartyId, `S-${label}`, `Site ${label}`],
    );
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, product_name, contract_status)
       VALUES ($1, $2, $3, $4, 'SHARED-ASSET-ID', $5, 'not_contracted')`,
      [assetId, companyId, counterpartyId, siteId, `Asset ${label}`],
    );
  });
  await createTenantAsset(companyA, counterpartyA, siteA, assetA, "A");
  await createTenantAsset(companyB, counterpartyB, siteB, assetB, "B");

  const visibleA = await withCompany(companyA, (tx) => tx.query<{ id: string }>("SELECT id FROM assets ORDER BY id"));
  invariant(visibleA.rows.length === 1 && visibleA.rows[0]?.id === assetA, "Company A can see another tenant's asset");
  const hiddenB = await withCompany(companyA, (tx) => tx.query("SELECT id FROM assets WHERE id = $1", [assetB]));
  invariant(hiddenB.rows.length === 0, "Company B asset was visible in Company A context");
  const updatedB = await withCompany(companyA, (tx) => tx.query("UPDATE assets SET product_name = 'leaked' WHERE id = $1 RETURNING id", [assetB]));
  invariant(updatedB.rows.length === 0, "Company A updated Company B asset");

  let crossTenantInsertRejected = false;
  try {
    await withCompany(companyA, (tx) => tx.query(
      `INSERT INTO customer_sites (id, company_id, counterparty_id, code, name)
       VALUES ($1, $2, $3, 'CROSS', 'Cross Tenant')`,
      [randomUUID(), companyB, counterpartyB],
    ));
  } catch (error) {
    crossTenantInsertRejected = error instanceof Error && /row-level security|policy/i.test(error.message);
  }
  invariant(crossTenantInsertRejected, "RLS accepted a cross-tenant insert");

  const withoutContext = await database.query("SELECT id FROM assets");
  invariant(withoutContext.rows.length === 0, "Tenant context leaked outside its transaction");
  console.info(`PostgreSQL RLS smoke passed for restricted role ${role.rows[0].current_user}`);
} finally {
  await database.close();
}
