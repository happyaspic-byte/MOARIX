import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { authenticateApiToken, createApiTokenCredential, hashApiToken } from "../src/lib/auth/api-token";
import { authenticate, findSession, revokeSession } from "../src/lib/auth/repository";
import { getDatabase, withCompany } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/security/password";
import { hashSessionToken } from "../src/lib/security/session-token";
import { updateMember } from "../src/lib/services/admin";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function expectPermissionDenied(label: string, work: () => Promise<unknown>) {
  let denied = false;
  try {
    await work();
  } catch (error) {
    denied = error instanceof Error && /permission denied|not permitted/i.test(error.message);
  }
  invariant(denied, `${label} was accessible to the application role`);
}

if (process.env.DATABASE_DRIVER !== "postgres") throw new Error("PostgreSQL RLS smoke requires DATABASE_DRIVER=postgres");
const ownerConnectionString = process.env.DATABASE_OWNER_URL;
if (!ownerConnectionString) throw new Error("DATABASE_OWNER_URL is required for PostgreSQL RLS fixture setup");

const database = await getDatabase();
const owner = new Pool({ connectionString: ownerConnectionString, max: 1 });

try {
  const role = await database.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT current_user, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = current_user`,
  );
  invariant(role.rows[0] && !role.rows[0].rolsuper && !role.rows[0].rolbypassrls, "Application role can bypass row-level security");

  const ownerRole = await owner.query<{ owns_companies: boolean }>(
    `SELECT pg_get_userbyid(relowner) = current_user AS owns_companies
     FROM pg_class WHERE oid = 'companies'::regclass`,
  );
  invariant(ownerRole.rows[0]?.owns_companies, "DATABASE_OWNER_URL must use the migration table owner");

  const companyA = randomUUID();
  const companyB = randomUUID();
  const userId = randomUUID();
  const memberUserId = randomUUID();
  const counterpartyA = randomUUID();
  const counterpartyB = randomUUID();
  const siteA = randomUUID();
  const siteB = randomUUID();
  const assetA = randomUUID();
  const assetB = randomUUID();
  const serviceCaseA = randomUUID();
  const serviceCaseB = randomUUID();
  const activityA = randomUUID();
  const activityB = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const loginEmail = `rls-${suffix}@example.invalid`;
  const memberEmail = `rls-member-${suffix}@example.invalid`;
  const loginPassword = "Rls-Smoke-Owner-Password-42!";
  const memberPassword = "Rls-Smoke-Member-Password-42!";
  const [loginPasswordHash, memberPasswordHash] = await Promise.all([
    hashPassword(loginPassword),
    hashPassword(memberPassword),
  ]);

  await owner.query(
    `INSERT INTO companies (id, slug, name) VALUES ($1, $2, 'RLS Company A'), ($3, $4, 'RLS Company B')`,
    [companyA, `rls-a-${suffix}`, companyB, `rls-b-${suffix}`],
  );
  await owner.query(
    `INSERT INTO users (id, email, name, password_hash)
     VALUES ($1, $2, 'RLS Owner', $3), ($4, $5, 'RLS Member', $6)`,
    [userId, loginEmail, loginPasswordHash, memberUserId, memberEmail, memberPasswordHash],
  );
  await owner.query(
    `INSERT INTO company_members (company_id, user_id, role, created_at)
     VALUES
       ($1, $3, 'owner', now() - interval '1 minute'),
       ($2, $3, 'owner', now()),
       ($1, $4, 'member', now())`,
    [companyA, companyB, userId, memberUserId],
  );

  type TenantFixture = {
    nodeId: string;
    networkId: string;
    vmId: string;
    contractId: string;
    licenseId: string;
    inspectionId: string;
    checkItemId: string;
    watcherId: string;
    drivingLogId: string;
    invoiceId: string;
    settlementId: string;
    allocationId: string;
    outboundMessageId: string;
  };

  const createTenantAsset = (
    companyId: string,
    counterpartyId: string,
    siteId: string,
    assetId: string,
    serviceCaseId: string,
    activityId: string,
    label: string,
  ) => withCompany(companyId, async (tx): Promise<TenantFixture> => {
    const fixture = {
      nodeId: randomUUID(),
      networkId: randomUUID(),
      vmId: randomUUID(),
      contractId: randomUUID(),
      licenseId: randomUUID(),
      inspectionId: randomUUID(),
      checkItemId: randomUUID(),
      watcherId: randomUUID(),
      drivingLogId: randomUUID(),
      invoiceId: randomUUID(),
      settlementId: randomUUID(),
      allocationId: randomUUID(),
      outboundMessageId: randomUUID(),
    };

    await tx.query(
      `INSERT INTO counterparties (id, company_id, kind, code, name)
       VALUES ($1, $2, 'customer', $3, $4)`,
      [counterpartyId, companyId, `C-${label}-${suffix}`, `Customer ${label}`],
    );
    await tx.query(
      `INSERT INTO customer_sites (id, company_id, counterparty_id, code, name)
       VALUES ($1, $2, $3, $4, $5)`,
      [siteId, companyId, counterpartyId, `S-${label}-${suffix}`, `Site ${label}`],
    );
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, product_name, contract_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'not_contracted')`,
      [assetId, companyId, counterpartyId, siteId, `RLS-ASSET-${label}-${suffix}`, `Asset ${label}`],
    );
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, title, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [serviceCaseId, companyId, `RLS-CASE-${label}-${suffix}`, counterpartyId, assetId, `Case ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, body, author_name, created_by)
       VALUES ($1, $2, $3, 'internal_note', $4, 'RLS User', $5)`,
      [activityId, companyId, serviceCaseId, `Private activity ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO service_case_attachments
         (id, company_id, case_id, file_name, source_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), companyId, serviceCaseId, `tenant-${label}.txt`, `https://storage.example.invalid/${label}.txt`, userId],
    );
    await tx.query(
      `INSERT INTO asset_nodes
         (id, company_id, asset_id, role, name, status, created_by)
       VALUES ($1, $2, $3, 'node0', $4, 'active', $5)`,
      [fixture.nodeId, companyId, assetId, `Node ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO asset_network_interfaces
         (id, company_id, asset_id, node_id, label, purpose, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'management', 'up', $6)`,
      [fixture.networkId, companyId, assetId, fixture.nodeId, `mgmt-${label}`, userId],
    );
    await tx.query(
      `INSERT INTO asset_virtual_machines
         (id, company_id, asset_id, name, protection_mode, status, vcpu, created_by)
       VALUES ($1, $2, $3, $4, 'ft', 'running', 2, $5)`,
      [fixture.vmId, companyId, assetId, `Synthetic VM ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO asset_support_contracts
         (id, company_id, asset_id, scope, status, contract_number, provider_name, created_by)
       VALUES ($1, $2, $3, 'customer_support', 'active', $4, $5, $6)`,
      [fixture.contractId, companyId, assetId, `SYN-CONTRACT-${label}-${suffix}`, `Provider ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO asset_licenses
         (id, company_id, asset_id, product_name, license_type, status, support_contract_id, created_by)
       VALUES ($1, $2, $3, $4, 'subscription', 'active', $5, $6)`,
      [fixture.licenseId, companyId, assetId, `Synthetic License ${label}`, fixture.contractId, userId],
    );
    await tx.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, status, scheduled_date, engineer_id, created_by)
       VALUES ($1, $2, $3, $4, $5, 'preventive', 'scheduled', CURRENT_DATE, $6, $6)`,
      [fixture.inspectionId, companyId, `RLS-INSPECTION-${label}-${suffix}`, assetId, siteId, userId],
    );
    await tx.query(
      `INSERT INTO inspection_check_items
         (id, company_id, inspection_id, item_key, category, label, position)
       VALUES ($1, $2, $3, $4, 'system', $5, 1)`,
      [fixture.checkItemId, companyId, fixture.inspectionId, `health-${label}`, `Health ${label}`],
    );
    await tx.query(
      `INSERT INTO service_case_watchers
         (id, company_id, case_id, email, display_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fixture.watcherId, companyId, serviceCaseId, `watcher-${label}-${suffix}@example.invalid`, `Watcher ${label}`, userId],
    );
    await tx.query(
      `INSERT INTO driving_logs
         (id, company_id, number, start_date, end_date, departure, destination,
          purpose, vehicle_name, distance_km, rate_per_km, total_amount,
          counterparty_id, site_id, case_id, created_by)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, $4, $5, $6, $7,
               10, 200, 2000, $8, $9, $10, $11)`,
      [
        fixture.drivingLogId,
        companyId,
        `RLS-TRIP-${label}-${suffix}`,
        `Departure ${label}`,
        `Destination ${label}`,
        `Purpose ${label}`,
        `Vehicle ${label}`,
        counterpartyId,
        siteId,
        serviceCaseId,
        userId,
      ],
    );
    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date,
          grand_total, created_by)
       VALUES ($1, $2, 'invoice', $3, $4, 'posted', CURRENT_DATE, CURRENT_DATE,
               100, $5)`,
      [fixture.invoiceId, companyId, `RLS-INVOICE-${label}-${suffix}`, counterpartyId, userId],
    );
    await tx.query(
      `INSERT INTO settlements
         (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
       VALUES ($1, $2, $3, 'receipt', 25, CURRENT_DATE, 'bank', $4)`,
      [fixture.settlementId, companyId, counterpartyId, userId],
    );
    await tx.query(
      `INSERT INTO settlement_allocations
         (id, company_id, settlement_id, document_id, amount)
       VALUES ($1, $2, $3, $4, 25)`,
      [fixture.allocationId, companyId, fixture.settlementId, fixture.invoiceId],
    );
    await tx.query(
      `INSERT INTO outbound_messages
         (id, company_id, to_address, subject, body, created_by)
       VALUES ($1, $2, $3, 'Synthetic outbound message', 'Synthetic queued body', $4)`,
      [fixture.outboundMessageId, companyId, `notify-${label}-${suffix}@example.invalid`, userId],
    );
    return fixture;
  });

  const fixtureA = await createTenantAsset(companyA, counterpartyA, siteA, assetA, serviceCaseA, activityA, "A");
  const fixtureB = await createTenantAsset(companyB, counterpartyB, siteB, assetB, serviceCaseB, activityB, "B");

  const visibleA = await withCompany(companyA, (tx) => tx.query<{ id: string }>("SELECT id FROM assets WHERE id IN ($1, $2)", [assetA, assetB]));
  invariant(visibleA.rows.length === 1 && visibleA.rows[0]?.id === assetA, "Company A can see another tenant's asset");
  const hiddenB = await withCompany(companyA, (tx) => tx.query("SELECT id FROM assets WHERE id = $1", [assetB]));
  invariant(hiddenB.rows.length === 0, "Company B asset was visible in Company A context");
  const updatedB = await withCompany(companyA, (tx) => tx.query("UPDATE assets SET product_name = 'leaked' WHERE id = $1 RETURNING id", [assetB]));
  invariant(updatedB.rows.length === 0, "Company A updated Company B asset");
  const visibleActivityA = await withCompany(companyA, (tx) => tx.query<{ id: string }>("SELECT id FROM service_case_activities WHERE id IN ($1, $2)", [activityA, activityB]));
  invariant(visibleActivityA.rows.length === 1 && visibleActivityA.rows[0]?.id === activityA, "Company A can see another tenant's service activity");
  const hiddenActivityB = await withCompany(companyA, (tx) => tx.query("SELECT id FROM service_case_activities WHERE id = $1", [activityB]));
  invariant(hiddenActivityB.rows.length === 0, "Company B service activity was visible in Company A context");
  const visibleAttachmentsA = await withCompany(companyA, (tx) => tx.query("SELECT id FROM service_case_attachments WHERE case_id IN ($1, $2)", [serviceCaseA, serviceCaseB]));
  invariant(visibleAttachmentsA.rows.length === 1, "Service attachment tenant isolation returned an unexpected count");

  const newTenantTables = [
    ["asset_nodes", fixtureA.nodeId, fixtureB.nodeId],
    ["asset_network_interfaces", fixtureA.networkId, fixtureB.networkId],
    ["asset_virtual_machines", fixtureA.vmId, fixtureB.vmId],
    ["asset_support_contracts", fixtureA.contractId, fixtureB.contractId],
    ["asset_licenses", fixtureA.licenseId, fixtureB.licenseId],
    ["inspection_check_items", fixtureA.checkItemId, fixtureB.checkItemId],
    ["service_case_watchers", fixtureA.watcherId, fixtureB.watcherId],
    ["driving_logs", fixtureA.drivingLogId, fixtureB.drivingLogId],
    ["settlements", fixtureA.settlementId, fixtureB.settlementId],
    ["settlement_allocations", fixtureA.allocationId, fixtureB.allocationId],
    ["outbound_messages", fixtureA.outboundMessageId, fixtureB.outboundMessageId],
  ] as const;
  for (const [tableName, expectedId, hiddenId] of newTenantTables) {
    const visible = await withCompany(companyA, (tx) => tx.query<{ id: string }>(
      `SELECT id FROM ${tableName} WHERE id IN ($1, $2)`,
      [expectedId, hiddenId],
    ));
    invariant(
      visible.rows.length === 1 && visible.rows[0]?.id === expectedId,
      `${tableName} did not enforce tenant read isolation`,
    );
  }

  let overAllocationRejected = false;
  try {
    await withCompany(companyA, async (tx) => {
      const settlementId = randomUUID();
      await tx.query(
        `INSERT INTO settlements
           (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
         VALUES ($1, $2, $3, 'receipt', 80, CURRENT_DATE, 'bank', $4)`,
        [settlementId, companyA, counterpartyA, userId],
      );
      await tx.query(
        `INSERT INTO settlement_allocations
           (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, 80)`,
        [randomUUID(), companyA, settlementId, fixtureA.invoiceId],
      );
    });
  } catch (error) {
    overAllocationRejected = error instanceof Error && /exceeds the document total/i.test(error.message);
  }
  invariant(overAllocationRejected, "Settlement allocation trigger allowed an over-allocation");

  let settlementOverAllocationRejected = false;
  try {
    await withCompany(companyA, async (tx) => {
      const settlementId = randomUUID();
      await tx.query(
        `INSERT INTO settlements
           (id, company_id, counterparty_id, direction, amount, settled_on, method, created_by)
         VALUES ($1, $2, $3, 'receipt', 10, CURRENT_DATE, 'bank', $4)`,
        [settlementId, companyA, counterpartyA, userId],
      );
      await tx.query(
        `INSERT INTO settlement_allocations
           (id, company_id, settlement_id, document_id, amount)
         VALUES ($1, $2, $3, $4, 11)`,
        [randomUUID(), companyA, settlementId, fixtureA.invoiceId],
      );
    });
  } catch (error) {
    settlementOverAllocationRejected = error instanceof Error && /settlement amount/i.test(error.message);
  }
  invariant(settlementOverAllocationRejected, "Settlement allocation exceeded the settlement amount");

  await owner.query(
    "UPDATE maintenance_inspections SET status = 'completed', completed_at = now() WHERE id = $1",
    [fixtureA.inspectionId],
  );
  let finalChecklistShadowRejected = false;
  try {
    await withCompany(companyA, async (tx) => {
      await tx.query("CREATE TEMP TABLE maintenance_inspections (id uuid, company_id uuid, status text) ON COMMIT DROP");
      await tx.query("UPDATE inspection_check_items SET notes = 'shadowed mutation' WHERE id = $1", [fixtureA.checkItemId]);
    });
  } catch (error) {
    finalChecklistShadowRejected = error instanceof Error && /Final inspection checklist cannot be changed/i.test(error.message);
  }
  invariant(finalChecklistShadowRejected, "A temporary-table shadow bypassed final inspection checklist immutability");

  let crossTenantInsertRejected = false;
  try {
    await withCompany(companyA, (tx) => tx.query(
      `INSERT INTO asset_nodes (id, company_id, asset_id, role, name, created_by)
       VALUES ($1, $2, $3, 'host', 'Cross Tenant Node', $4)`,
      [randomUUID(), companyB, assetB, userId],
    ));
  } catch (error) {
    crossTenantInsertRejected = error instanceof Error && /row-level security|policy/i.test(error.message);
  }
  invariant(crossTenantInsertRejected, "RLS accepted a cross-tenant insert into asset_nodes");

  const currentCompany = await withCompany(companyA, (tx) => tx.query<{ id: string }>("SELECT id FROM companies"));
  invariant(currentCompany.rows.length === 1 && currentCompany.rows[0]?.id === companyA, "Global company RLS leaked another tenant");
  const currentUser = await withCompany(companyA, (tx) => tx.query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]));
  invariant(currentUser.rows.length === 1, "Tenant member was not visible through global user RLS");
  await expectPermissionDenied("shared users UPDATE", () => withCompany(companyA, (tx) => tx.query(
    "UPDATE users SET name = 'Cross Tenant Profile Mutation' WHERE id = $1",
    [userId],
  )));

  await expectPermissionDenied("users.password_hash", () => database.query("SELECT password_hash FROM users LIMIT 1"));
  await expectPermissionDenied("sessions SELECT", () => database.query("SELECT id FROM sessions LIMIT 1"));
  await expectPermissionDenied("sessions.token_hash", () => database.query("SELECT token_hash FROM sessions LIMIT 1"));
  await expectPermissionDenied("sessions INSERT", () => database.query(
    `INSERT INTO sessions (id, user_id, company_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
    [randomUUID(), userId, companyA, hashSessionToken(`direct-insert-${suffix}`)],
  ));
  await expectPermissionDenied("sessions UPDATE", () => database.query(
    "UPDATE sessions SET revoked_at = now() WHERE id = $1",
    [randomUUID()],
  ));
  await expectPermissionDenied("sessions DELETE", () => database.query(
    "DELETE FROM sessions WHERE id = $1",
    [randomUUID()],
  ));
  const restrictedApiCredential = createApiTokenCredential();
  await expectPermissionDenied("api_tokens SELECT", () => database.query("SELECT id FROM api_tokens LIMIT 1"));
  await expectPermissionDenied("api_tokens.token_hash", () => database.query("SELECT token_hash FROM api_tokens LIMIT 1"));
  await expectPermissionDenied("api_tokens INSERT", () => database.query(
    `INSERT INTO api_tokens
       (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at)
     VALUES ($1, $2, $3, 'Denied API token', $4, $5, $6, now() + interval '1 day')`,
    [
      randomUUID(),
      companyA,
      userId,
      restrictedApiCredential.tokenHash,
      restrictedApiCredential.tokenPrefix,
      ["context:read"],
    ],
  ));
  await expectPermissionDenied("schema_migrations", () => database.query("SELECT name FROM schema_migrations LIMIT 1"));
  await expectPermissionDenied("company creation", () => database.query(
    "INSERT INTO companies (id, slug, name) VALUES ($1, $2, 'Denied Company')",
    [randomUUID(), `denied-${suffix}`],
  ));

  const loginLookup = await database.query<{ user_id: string; password_hash: string }>(
    "SELECT user_id, password_hash FROM public.moarix_login_lookup($1)",
    [loginEmail],
  );
  invariant(
    loginLookup.rows.length === 1
      && loginLookup.rows[0]?.user_id === userId
      && loginLookup.rows[0]?.password_hash === loginPasswordHash,
    "Controlled login lookup did not return the expected account",
  );

  const activeApiCredential = createApiTokenCredential();
  const expiredApiCredential = createApiTokenCredential();
  const activeApiTokenId = randomUUID();
  await owner.query(
    `INSERT INTO api_tokens
       (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at, created_at)
     VALUES
       ($1, $3, $4, 'PostgreSQL API smoke', $5, $6, $7, now() + interval '1 day', now()),
       ($2, $3, $4, 'Expired PostgreSQL API smoke', $8, $9, $10,
        now() - interval '1 day', now() - interval '2 days')`,
    [
      activeApiTokenId,
      randomUUID(),
      companyA,
      userId,
      activeApiCredential.tokenHash,
      activeApiCredential.tokenPrefix,
      ["context:read", "assets:*"],
      expiredApiCredential.tokenHash,
      expiredApiCredential.tokenPrefix,
      ["context:read"],
    ],
  );

  const apiActor = await authenticateApiToken(activeApiCredential.token);
  invariant(
    apiActor?.apiTokenId === activeApiTokenId
      && apiActor.userId === userId
      && apiActor.companyId === companyA
      && apiActor.scopes.includes("assets:*"),
    "Controlled API token lookup did not restore the expected tenant principal",
  );
  invariant(
    await authenticateApiToken(expiredApiCredential.token) === null,
    "Expired API token remained usable through the controlled lookup",
  );
  const apiTouch = await owner.query<{ was_touched: boolean }>(
    `SELECT last_used_at > now() - interval '1 minute' AS was_touched
     FROM api_tokens WHERE id = $1`,
    [activeApiTokenId],
  );
  invariant(apiTouch.rows[0]?.was_touched, "API token lookup did not update last_used_at");

  await database.transaction(async (tx) => {
    await tx.exec(`
      CREATE TEMP TABLE api_tokens (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE users (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE company_members (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE companies (shadow text) ON COMMIT DROP;
    `);
    const shadowApiToken = await tx.query<{ api_token_id: string }>(
      "SELECT api_token_id FROM public.moarix_find_api_token($1)",
      [hashApiToken(activeApiCredential.token)],
    );
    invariant(
      shadowApiToken.rows[0]?.api_token_id === activeApiTokenId,
      "Temporary relation shadowed the API token lookup",
    );
  });

  await owner.query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1", [activeApiTokenId]);
  invariant(
    await authenticateApiToken(activeApiCredential.token) === null,
    "Revoked API token remained usable through the controlled lookup",
  );

  const expiredSessionId = randomUUID();
  const oldRevokedSessionId = randomUUID();
  const loginIdentifierHash = hashSessionToken(`login:${loginEmail}`);
  await owner.query(
    `INSERT INTO sessions
       (id, user_id, company_id, token_hash, expires_at, revoked_at)
     VALUES
       ($1, $3, $4, $5, now() - interval '1 day', NULL),
       ($2, $3, $4, $6, now() + interval '1 day', now() - interval '8 days')`,
    [
      expiredSessionId,
      oldRevokedSessionId,
      userId,
      companyA,
      hashSessionToken(`expired-${suffix}`),
      hashSessionToken(`revoked-${suffix}`),
    ],
  );
  await owner.query(
    `INSERT INTO login_attempts (identifier_hash, attempt_count)
     VALUES ($1, 1)`,
    [loginIdentifierHash],
  );

  const authenticated = await authenticate(loginEmail, loginPassword, {
    userAgent: "MOARIX PostgreSQL security smoke",
    ipHash: hashSessionToken(`ip-${suffix}`),
  });
  invariant(authenticated, "Real authenticate flow failed through the restricted application role");

  const cleanup = await owner.query<{ remaining: string; attempts: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM sessions WHERE id IN ($1, $2)) AS remaining,
       (SELECT COUNT(*)::text FROM login_attempts WHERE identifier_hash = $3) AS attempts`,
    [expiredSessionId, oldRevokedSessionId, loginIdentifierHash],
  );
  invariant(cleanup.rows[0]?.remaining === "0", "Session creation did not clean stale sessions");
  invariant(cleanup.rows[0]?.attempts === "0", "Successful authentication did not clear login attempts");

  const firstSession = await findSession(authenticated.token);
  invariant(
    firstSession?.userId === userId && firstSession.companyId === companyA,
    "Real session lookup did not restore the authenticated tenant context",
  );
  const listedSessions = await withCompany(companyA, (tx) => tx.query<{ session_id: string }>(
    "SELECT session_id FROM public.moarix_list_company_sessions($1)",
    [companyA],
  ));
  invariant(
    listedSessions.rows.some((row) => row.session_id === firstSession.sessionId),
    "Restricted application role could not execute the company session administration function",
  );

  await database.transaction(async (tx) => {
    await tx.exec(`
      CREATE TEMP TABLE users (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE company_members (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE companies (shadow text) ON COMMIT DROP;
      CREATE TEMP TABLE sessions (shadow text) ON COMMIT DROP;
    `);
    const shadowLogin = await tx.query<{ user_id: string }>(
      "SELECT user_id FROM public.moarix_login_lookup($1)",
      [loginEmail],
    );
    const shadowSession = await tx.query<{ session_id: string }>(
      "SELECT session_id FROM public.moarix_find_session($1)",
      [hashSessionToken(authenticated.token)],
    );
    invariant(shadowLogin.rows[0]?.user_id === userId, "Temporary relation shadowed the login lookup");
    invariant(shadowSession.rows[0]?.session_id === firstSession.sessionId, "Temporary relation shadowed the session lookup");
  });

  await owner.query(
    "UPDATE sessions SET last_seen_at = now() - interval '10 minutes' WHERE id = $1",
    [firstSession.sessionId],
  );
  const touchedSession = await findSession(authenticated.token);
  invariant(touchedSession?.sessionId === firstSession.sessionId, "Session disappeared before touch verification");
  const touched = await owner.query<{ was_touched: boolean }>(
    `SELECT last_seen_at > now() - interval '1 minute' AS was_touched
     FROM sessions WHERE id = $1`,
    [firstSession.sessionId],
  );
  invariant(touched.rows[0]?.was_touched, "Session lookup did not touch stale last_seen_at through the controlled function");

  await revokeSession(authenticated.token);
  invariant(await findSession(authenticated.token) === null, "Token revoke did not invalidate the session lookup");
  const revoked = await owner.query<{ revoked: boolean }>(
    "SELECT revoked_at IS NOT NULL AS revoked FROM sessions WHERE id = $1",
    [firstSession.sessionId],
  );
  invariant(revoked.rows[0]?.revoked, "Controlled token revoke did not update the stored session");

  const [ownerAuthentication, memberAuthentication] = await Promise.all([
    authenticate(loginEmail, loginPassword),
    authenticate(memberEmail, memberPassword),
  ]);
  invariant(ownerAuthentication && memberAuthentication, "Admin revoke setup could not authenticate both users");
  const [ownerSession, memberSession] = await Promise.all([
    findSession(ownerAuthentication.token),
    findSession(memberAuthentication.token),
  ]);
  invariant(ownerSession?.role === "owner", "Admin revoke setup did not restore the owner session");
  invariant(memberSession?.userId === memberUserId, "Admin revoke setup did not restore the member session");

  await updateMember(ownerSession, { userId: memberUserId, role: "member", isActive: false });
  invariant(await findSession(memberAuthentication.token) === null, "Member deactivation left its session usable");
  const adminRevoked = await owner.query<{ revoked: boolean }>(
    "SELECT revoked_at IS NOT NULL AS revoked FROM sessions WHERE id = $1",
    [memberSession.sessionId],
  );
  invariant(adminRevoked.rows[0]?.revoked, "Admin member update did not call the controlled session revoke");

  const withoutContext = await database.query("SELECT id FROM assets");
  invariant(withoutContext.rows.length === 0, "Tenant context leaked outside its transaction");
  console.info(`PostgreSQL RLS smoke passed for restricted role ${role.rows[0].current_user}`);
} finally {
  await Promise.allSettled([database.close(), owner.end()]);
}
