CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  business_number text,
  representative_name text,
  phone text,
  email text,
  base_currency varchar(3) NOT NULL DEFAULT 'KRW',
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_members (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
  approval_limit numeric(19,4),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent text,
  ip_hash char(64)
);

CREATE INDEX IF NOT EXISTS sessions_lookup_idx
  ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS counterparties (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('customer', 'supplier', 'both')),
  code text NOT NULL,
  name text NOT NULL,
  business_number text,
  representative_name text,
  email text,
  phone text,
  address text,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  credit_limit numeric(19,4) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('product', 'material', 'service')),
  unit text NOT NULL DEFAULT 'EA',
  tax_rate numeric(7,4) NOT NULL DEFAULT 10 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  sale_price numeric(19,4) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  purchase_price numeric(19,4) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  track_inventory boolean NOT NULL DEFAULT true,
  reorder_point numeric(19,4) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sku),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, id)
);

CREATE TABLE IF NOT EXISTS document_counters (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('quote', 'sales_order', 'purchase_order', 'invoice', 'bill')),
  number text NOT NULL,
  counterparty_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'cancelled')),
  issue_date date NOT NULL,
  due_date date,
  currency varchar(3) NOT NULL DEFAULT 'KRW',
  subtotal numeric(19,4) NOT NULL DEFAULT 0,
  discount_total numeric(19,4) NOT NULL DEFAULT 0,
  tax_total numeric(19,4) NOT NULL DEFAULT 0,
  grand_total numeric(19,4) NOT NULL DEFAULT 0,
  notes text,
  source_document_id uuid,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  posted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (company_id, kind, number),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, counterparty_id)
    REFERENCES counterparties(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, source_document_id)
    REFERENCES documents(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS documents_company_kind_date_idx
  ON documents (company_id, kind, issue_date DESC);

CREATE TABLE IF NOT EXISTS document_lines (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL,
  item_id uuid,
  position integer NOT NULL CHECK (position > 0),
  sku_snapshot text,
  name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(19,4) NOT NULL CHECK (unit_price >= 0),
  discount_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (discount_rate >= 0 AND discount_rate <= 100),
  tax_rate numeric(7,4) NOT NULL DEFAULT 10 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  net_amount numeric(19,4) NOT NULL,
  tax_amount numeric(19,4) NOT NULL,
  gross_amount numeric(19,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_id, position),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, document_id)
    REFERENCES documents(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, item_id)
    REFERENCES items(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  item_id uuid NOT NULL,
  on_hand numeric(19,4) NOT NULL DEFAULT 0,
  reserved numeric(19,4) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, warehouse_id, item_id),
  CHECK (on_hand >= 0),
  CHECK (reserved <= on_hand),
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES warehouses(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, item_id)
    REFERENCES items(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  item_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt', 'issue', 'adjustment', 'transfer_in', 'transfer_out', 'reservation', 'release', 'reversal')),
  quantity numeric(19,4) NOT NULL CHECK (quantity <> 0),
  unit_cost numeric(19,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  reference_number text,
  reason text,
  idempotency_key text NOT NULL,
  reversal_of uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, warehouse_id)
    REFERENCES warehouses(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, item_id)
    REFERENCES items(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, reversal_of)
    REFERENCES inventory_movements(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS inventory_movements_lookup_idx
  ON inventory_movements (company_id, item_id, warehouse_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL,
  asset_tag text NOT NULL,
  product_name text NOT NULL,
  serial_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  site text,
  installed_at date,
  warranty_until date,
  support_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, asset_tag),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, counterparty_id)
    REFERENCES counterparties(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS service_cases (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  number text NOT NULL,
  counterparty_id uuid NOT NULL,
  asset_id uuid,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, counterparty_id)
    REFERENCES counterparties(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id)
);

CREATE INDEX IF NOT EXISTS audit_logs_company_created_idx
  ON audit_logs (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_records (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  operation text NOT NULL,
  request_hash char(64) NOT NULL,
  response_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, key)
);

CREATE OR REPLACE FUNCTION moarix_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_touch_updated_at ON companies;
CREATE TRIGGER companies_touch_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS users_touch_updated_at ON users;
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS counterparties_touch_updated_at ON counterparties;
CREATE TRIGGER counterparties_touch_updated_at BEFORE UPDATE ON counterparties
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS items_touch_updated_at ON items;
CREATE TRIGGER items_touch_updated_at BEFORE UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS warehouses_touch_updated_at ON warehouses;
CREATE TRIGGER warehouses_touch_updated_at BEFORE UPDATE ON warehouses
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS documents_touch_updated_at ON documents;
CREATE TRIGGER documents_touch_updated_at BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS assets_touch_updated_at ON assets;
CREATE TRIGGER assets_touch_updated_at BEFORE UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();
DROP TRIGGER IF EXISTS service_cases_touch_updated_at ON service_cases;
CREATE TRIGGER service_cases_touch_updated_at BEFORE UPDATE ON service_cases
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

CREATE OR REPLACE FUNCTION moarix_prevent_immutable_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movements_immutable ON inventory_movements;
CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_immutable_change();

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_immutable_change();

CREATE OR REPLACE FUNCTION moarix_current_company_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparties FORCE ROW LEVEL SECURITY;
CREATE POLICY counterparties_company_isolation ON counterparties
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE items FORCE ROW LEVEL SECURITY;
CREATE POLICY items_company_isolation ON items
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouses_company_isolation ON warehouses
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY document_counters_company_isolation ON document_counters
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_company_isolation ON documents
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY document_lines_company_isolation ON document_lines
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_balances_company_isolation ON inventory_balances
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_movements_company_isolation ON inventory_movements
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_company_isolation ON assets
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE service_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY service_cases_company_isolation ON service_cases
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_company_isolation ON audit_logs
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_records_company_isolation ON idempotency_records
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
