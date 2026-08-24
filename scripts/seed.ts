import { randomUUID } from "node:crypto";
import { getDatabase, withCompany } from "../src/lib/db/client";
import { calculateLine } from "../src/lib/domain/money";
import { hashPassword } from "../src/lib/security/password";

async function seed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Production seed is disabled. Set ALLOW_PRODUCTION_SEED=true only for an approved empty database.");
  }

  const database = await getDatabase();
  const existing = await database.query<{ id: string }>("SELECT id FROM companies WHERE slug = $1", ["moarix-demo"]);
  if (existing.rows.length > 0) {
    console.info("Demo company already exists; seed skipped.");
    await database.close();
    return;
  }

  const companyId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const supplierId = randomUUID();
  const warehouseId = randomUUID();
  const siteId = randomUUID();
  const edgeItemId = randomUUID();
  const serviceItemId = randomUUID();
  const cableItemId = randomUUID();
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("SEED_DEMO_PASSWORD is required for an empty demo database");
  const email = (process.env.SEED_DEMO_EMAIL ?? "admin@moarix.local").trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  await database.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO companies (id, slug, name, business_number, representative_name, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, "moarix-demo", "MOARIX 데모 주식회사", "123-45-67890", "김모아", "02-1234-5678", "hello@moarix.local"],
    );
    await tx.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, "관리자", passwordHash],
    );
    await tx.query(
      `INSERT INTO company_members (company_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [companyId, userId],
    );
  });

  await withCompany(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO counterparties
         (id, company_id, kind, code, name, business_number, representative_name, email, phone, address, payment_terms_days, credit_limit)
       VALUES
         ($1, $3, 'customer', 'CUST-001', '한빛 제조', '111-22-33333', '이한빛', 'ops@hanbit.example', '055-111-2222', '경상남도 창원시', 30, 50000000),
         ($2, $3, 'supplier', 'SUP-001', '세움 유통', '444-55-66666', '박세움', 'sales@seum.example', '02-777-8888', '서울특별시', 30, 0)`,
      [customerId, supplierId, companyId],
    );
    await tx.query(
      `INSERT INTO customer_sites
         (id, company_id, counterparty_id, code, name, address, contact_name, contact_phone, contact_email, timezone)
       VALUES ($1, $2, $3, 'PLANT-01', '창원 1공장', '경상남도 창원시 데모산단 1길', '이현장', '055-111-2233', 'plant.ops@example.com', 'Asia/Seoul')`,
      [siteId, companyId, customerId],
    );
    await tx.query(
      `INSERT INTO warehouses (id, company_id, code, name, location)
       VALUES ($1, $2, 'MAIN', '본사 창고', '창원')`,
      [warehouseId, companyId],
    );
    await tx.query(
      `INSERT INTO items
         (id, company_id, sku, name, kind, unit, tax_rate, sale_price, purchase_price, track_inventory, reorder_point)
       VALUES
         ($1, $4, 'ZTC-EDGE', '산업용 이중화 어플라이언스', 'product', 'EA', 10, 18500000, 14500000, true, 2),
         ($2, $4, 'MAINT-1Y', '연간 기술지원 서비스', 'service', 'YEAR', 10, 3600000, 0, false, 0),
         ($3, $4, 'CABLE-CAT6', 'CAT6 패치 케이블 3m', 'material', 'EA', 10, 12000, 6500, true, 20)`,
      [edgeItemId, serviceItemId, cableItemId, companyId],
    );

    const stock = [
      { itemId: edgeItemId, quantity: "8.0000", unitCost: "14500000.0000" },
      { itemId: cableItemId, quantity: "120.0000", unitCost: "6500.0000" },
    ];
    for (const row of stock) {
      await tx.query(
        `INSERT INTO inventory_balances (company_id, warehouse_id, item_id, on_hand, reserved)
         VALUES ($1, $2, $3, $4, 0)`,
        [companyId, warehouseId, row.itemId, row.quantity],
      );
      await tx.query(
        `INSERT INTO inventory_movements
           (id, company_id, warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, reference_number, reason, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, 'receipt', $5, $6, 'opening_balance', 'OPEN-2026', '초기 재고', $7, $8)`,
        [randomUUID(), companyId, warehouseId, row.itemId, row.quantity, row.unitCost, `seed-${row.itemId}`, userId],
      );
    }

    const line = calculateLine({ quantity: "1", unitPrice: "18500000", taxRate: "10", currency: "KRW" });
    const quoteId = randomUUID();
    await tx.query(
      `INSERT INTO documents
         (id, company_id, kind, number, counterparty_id, status, issue_date, due_date, currency, subtotal, discount_total, tax_total, grand_total, notes, created_by)
       VALUES ($1, $2, 'quote', 'Q-2026-0001', $3, 'submitted', CURRENT_DATE, CURRENT_DATE + 30, 'KRW', $4, $5, $6, $7, '현장 설치 및 기본 교육 포함', $8)`,
      [quoteId, companyId, customerId, line.net, line.discount, line.tax, line.gross, userId],
    );
    await tx.query(
      `INSERT INTO document_lines
         (id, company_id, document_id, item_id, position, sku_snapshot, name_snapshot, unit_snapshot, quantity, unit_price, discount_rate, tax_rate, net_amount, tax_amount, gross_amount)
       VALUES ($1, $2, $3, $4, 1, 'ZTC-EDGE', '산업용 이중화 어플라이언스', 'EA', 1, 18500000, 0, 10, $5, $6, $7)`,
      [randomUUID(), companyId, quoteId, edgeItemId, line.net, line.tax, line.gross],
    );

    const assetId = randomUUID();
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, product_model, software_version, protection_mode,
          operating_system, management_ip, serial_number, status, service_method,
          contract_status, contract_number, channel_partner, support_provider, support_level,
          support_started_at, installed_at, warranty_until, support_until, next_inspection_date, notes)
       VALUES ($1, $2, $3, $4, 'AST-0001', 'ee-demo-001',
               'everRun Enterprise 이중화 시스템', 'everrun', 'Demo Platform', '8.0 demo', 'ft',
               'Windows Server Demo', '10.0.0.10', 'DEMO-SN-001', 'active', 'hybrid',
               'pending_renewal', 'SUP-DEMO-2026-001', '데모 파트너', 'Stratus', '24x7',
               CURRENT_DATE - 275, CURRENT_DATE - 275, CURRENT_DATE + 90, CURRENT_DATE + 45, CURRENT_DATE + 14, '분기 점검 대상')`,
      [assetId, companyId, customerId, siteId],
    );
    const uncoveredAssetId = randomUUID();
    await tx.query(
      `INSERT INTO assets
         (id, company_id, counterparty_id, site_id, asset_tag, vendor_asset_id,
          product_name, product_family, software_version, protection_mode, serial_number,
          status, service_method, contract_status, installed_at, notes)
       VALUES ($1, $2, $3, $4, 'AST-0002', 'zen-demo-002',
               'ztC Edge 데모 시스템', 'ztc_edge', '3.0 demo', 'ha', 'DEMO-SN-002',
               'active', 'remote', 'not_contracted', CURRENT_DATE - 60, '미계약 경보 검증용 데모 자산')`,
      [uncoveredAssetId, companyId, customerId, siteId],
    );
    await tx.query(
      `INSERT INTO maintenance_inspections
         (id, company_id, number, asset_id, site_id, inspection_type, status,
          scheduled_date, engineer_id, created_by, report_reference)
       VALUES ($1, $2, 'INSP-DEMO-00001', $3, $4, 'quarterly', 'scheduled',
               CURRENT_DATE + 14, $5, $5, '고객 정기점검 양식')`,
      [randomUUID(), companyId, assetId, siteId, userId],
    );
    const serviceCaseId = randomUUID();
    await tx.query(
      `INSERT INTO service_cases
         (id, company_id, number, counterparty_id, asset_id, case_type, title, description,
          severity, max_severity, status, assigned_to, due_at, next_action_at, created_by,
          contact_name, contact_email, contact_phone, entitlement, external_provider,
          external_case_number, external_state, source_url)
       VALUES ($1, $2, 'CS-DEMO-0001', $3, $4, 'incident', 'FT VM 메모리 동기화 지연',
               'FT 가상 머신의 메모리 동기화가 반복적으로 지연됩니다.\n가용성 링크 상태와 노드 자원 사용률을 함께 확인해 주세요.',
               'normal', 'high', 'in_progress', $5, now() + interval '14 days',
               now() + interval '2 days', $5, '데모 고객 담당자', 'operator@example.com',
               '055-000-0000', 'everRun Demo Support 24x7', 'Demo Support',
               'CS-DEMO-EXT-0001', 'Investigating', 'https://support.example.invalid/case/CS-DEMO-EXT-0001')`,
      [serviceCaseId, companyId, customerId, assetId, userId],
    );
    await tx.query(
      `INSERT INTO service_case_activities
         (id, company_id, case_id, kind, visibility, body, author_name, occurred_at, created_by)
       VALUES
         ($1, $3, $4, 'system', 'shared', '케이스가 접수되었습니다.', '관리자', now() - interval '2 days', $5),
         ($2, $3, $4, 'vendor_reply', 'shared',
          '진단 결과 가용성 링크에서 패킷 손실이 관찰되었습니다.\n케이블을 한 개씩 교체한 뒤 오류 카운터와 동기화 상태를 다시 확인해 주세요.',
          'Demo Support Engineer', now() - interval '1 day', $5)`,
      [randomUUID(), randomUUID(), companyId, serviceCaseId, userId],
    );
    await tx.query(
      `INSERT INTO service_case_attachments
         (id, company_id, case_id, file_name, source_url, content_type, size_bytes,
          description, uploaded_by, occurred_at)
       VALUES ($1, $2, $3, 'diagnostic-bundle-demo.zip',
               'https://storage.example.invalid/demo/diagnostic-bundle-demo.zip',
               'application/zip', 414187520, '합성 데모 진단 번들 링크', $4, now() - interval '2 days')`,
      [randomUUID(), companyId, serviceCaseId, userId],
    );
    await tx.query(
      `INSERT INTO audit_logs
         (id, company_id, actor_user_id, action, entity_type, summary, after_data)
       VALUES ($1, $2, $3, 'seed.created', 'company', '데모 데이터 초기화', jsonb_build_object('company', 'MOARIX 데모 주식회사'))`,
      [randomUUID(), companyId, userId],
    );
  });

  console.info(`Seeded demo company. Local login email: ${email}`);
  console.info("The password is read from SEED_DEMO_PASSWORD and is never printed.");
  await database.close();
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
