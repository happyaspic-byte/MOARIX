CREATE TABLE customer_sites (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  contact_name text,
  contact_phone text,
  contact_email text,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, counterparty_id, code),
  UNIQUE (company_id, id),
  UNIQUE (company_id, counterparty_id, id),
  FOREIGN KEY (company_id, counterparty_id)
    REFERENCES counterparties(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX customer_sites_customer_idx
  ON customer_sites (company_id, counterparty_id, name);

ALTER TABLE assets
  ADD COLUMN site_id uuid,
  ADD COLUMN vendor_asset_id text,
  ADD COLUMN product_family text NOT NULL DEFAULT 'other'
    CHECK (product_family IN ('everrun', 'ztc_endurance', 'ztc_edge', 'ftserver', 'other')),
  ADD COLUMN product_model text,
  ADD COLUMN software_version text,
  ADD COLUMN protection_mode text NOT NULL DEFAULT 'other'
    CHECK (protection_mode IN ('ha', 'ft', 'mixed', 'none', 'other')),
  ADD COLUMN operating_system text,
  ADD COLUMN management_ip text,
  ADD COLUMN service_method text NOT NULL DEFAULT 'hybrid'
    CHECK (service_method IN ('remote', 'visit', 'hybrid')),
  ADD COLUMN contract_status text NOT NULL DEFAULT 'active'
    CHECK (contract_status IN ('active', 'pending_renewal', 'not_contracted', 'expired')),
  ADD COLUMN contract_number text,
  ADD COLUMN channel_partner text,
  ADD COLUMN support_provider text,
  ADD COLUMN support_level text,
  ADD COLUMN support_started_at date,
  ADD COLUMN next_inspection_date date,
  ADD CONSTRAINT assets_site_fk
    FOREIGN KEY (company_id, counterparty_id, site_id)
    REFERENCES customer_sites(company_id, counterparty_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT assets_company_customer_id_unique UNIQUE (company_id, counterparty_id, id),
  ADD CONSTRAINT assets_company_id_site_unique UNIQUE (company_id, id, site_id);

CREATE UNIQUE INDEX assets_vendor_asset_id_unique
  ON assets (company_id, lower(vendor_asset_id))
  WHERE vendor_asset_id IS NOT NULL;

CREATE INDEX assets_support_queue_idx
  ON assets (company_id, contract_status, support_until, next_inspection_date)
  WHERE status <> 'retired';

ALTER TABLE service_cases
  ADD COLUMN external_provider text,
  ADD COLUMN external_case_number text,
  ADD COLUMN waiting_reason text,
  ADD COLUMN next_action_at timestamptz,
  ADD COLUMN resolution_summary text,
  ADD CONSTRAINT service_case_asset_customer_fk
    FOREIGN KEY (company_id, counterparty_id, asset_id)
    REFERENCES assets(company_id, counterparty_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT service_case_assignee_member_fk
    FOREIGN KEY (company_id, assigned_to)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT service_case_creator_member_fk
    FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT service_case_external_number_unique
    UNIQUE (company_id, external_provider, external_case_number);

CREATE TABLE maintenance_inspections (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  number text NOT NULL,
  asset_id uuid NOT NULL,
  site_id uuid NOT NULL,
  inspection_type text NOT NULL
    CHECK (inspection_type IN ('installation', 'preventive', 'quarterly', 'incident', 'upgrade')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'issue_found', 'cancelled')),
  scheduled_date date NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  engineer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  system_health text NOT NULL DEFAULT 'unknown'
    CHECK (system_health IN ('healthy', 'warning', 'critical', 'unknown')),
  protection_status text NOT NULL DEFAULT 'na'
    CHECK (protection_status IN ('pass', 'warning', 'fail', 'na')),
  sync_status text NOT NULL DEFAULT 'na'
    CHECK (sync_status IN ('pass', 'warning', 'fail', 'na')),
  service_status text NOT NULL DEFAULT 'na'
    CHECK (service_status IN ('pass', 'warning', 'fail', 'na')),
  cpu_percent numeric(5,2) CHECK (cpu_percent BETWEEN 0 AND 100),
  memory_percent numeric(5,2) CHECK (memory_percent BETWEEN 0 AND 100),
  disk_percent numeric(5,2) CHECK (disk_percent BETWEEN 0 AND 100),
  findings text,
  action_items text,
  report_reference text,
  next_inspection_date date,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, site_id)
    REFERENCES customer_sites(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, asset_id, site_id)
    REFERENCES assets(company_id, id, site_id) ON DELETE RESTRICT
);

CREATE INDEX maintenance_inspections_queue_idx
  ON maintenance_inspections (company_id, status, scheduled_date);

CREATE OR REPLACE FUNCTION moarix_company_today()
RETURNS date AS $$
  SELECT (now() AT TIME ZONE c.timezone)::date
  FROM companies c
  WHERE c.id = moarix_current_company_id();
$$ LANGUAGE sql STABLE;

DROP TRIGGER IF EXISTS customer_sites_touch_updated_at ON customer_sites;
CREATE TRIGGER customer_sites_touch_updated_at BEFORE UPDATE ON customer_sites
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

DROP TRIGGER IF EXISTS maintenance_inspections_touch_updated_at ON maintenance_inspections;
CREATE TRIGGER maintenance_inspections_touch_updated_at BEFORE UPDATE ON maintenance_inspections
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

ALTER TABLE customer_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sites FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_sites_company_isolation ON customer_sites
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE maintenance_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_inspections FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_inspections_company_isolation ON maintenance_inspections
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
