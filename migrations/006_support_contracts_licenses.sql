CREATE TABLE asset_support_contracts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  scope text NOT NULL
    CHECK (scope IN ('customer_support', 'vendor_support')),
  status text NOT NULL
    CHECK (status IN ('active', 'pending_renewal', 'not_contracted', 'expired')),
  contract_number text,
  provider_name text NOT NULL,
  recipient_name text,
  intermediary_name text,
  support_level text,
  service_method text NOT NULL DEFAULT 'hybrid'
    CHECK (service_method IN ('remote', 'visit', 'hybrid')),
  starts_on date,
  ends_on date,
  coverage_summary text,
  exclusions text,
  renewal_owner_id uuid,
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, asset_id, id),
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, renewal_owner_id)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
  CHECK (status = 'not_contracted' OR contract_number IS NOT NULL OR coverage_summary IS NOT NULL)
);

CREATE UNIQUE INDEX asset_support_contracts_current_unique
  ON asset_support_contracts (company_id, asset_id, scope)
  WHERE is_current = true;
CREATE INDEX asset_support_contracts_renewal_idx
  ON asset_support_contracts (company_id, status, ends_on)
  WHERE is_current = true;

CREATE TABLE asset_licenses (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  product_name text NOT NULL,
  license_type text NOT NULL
    CHECK (license_type IN ('perpetual', 'subscription', 'oem', 'trial', 'other')),
  entitlement_reference text,
  license_key_hint text,
  version text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 1000000),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'retired')),
  issued_on date,
  expires_on date,
  support_contract_id uuid,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, asset_id, support_contract_id)
    REFERENCES asset_support_contracts(company_id, asset_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on),
  CHECK (license_key_hint IS NULL OR char_length(license_key_hint) <= 12)
);

CREATE INDEX asset_licenses_expiry_idx
  ON asset_licenses (company_id, status, expires_on)
  WHERE status = 'active';
CREATE INDEX asset_licenses_asset_idx
  ON asset_licenses (company_id, asset_id, product_name);

CREATE OR REPLACE FUNCTION moarix_prevent_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% history cannot be deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_nodes_prevent_delete ON asset_nodes;
CREATE TRIGGER asset_nodes_prevent_delete
BEFORE DELETE ON asset_nodes
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

DROP TRIGGER IF EXISTS asset_network_interfaces_prevent_delete ON asset_network_interfaces;
CREATE TRIGGER asset_network_interfaces_prevent_delete
BEFORE DELETE ON asset_network_interfaces
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

DROP TRIGGER IF EXISTS asset_virtual_machines_prevent_delete ON asset_virtual_machines;
CREATE TRIGGER asset_virtual_machines_prevent_delete
BEFORE DELETE ON asset_virtual_machines
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

DROP TRIGGER IF EXISTS asset_support_contracts_prevent_delete ON asset_support_contracts;
CREATE TRIGGER asset_support_contracts_prevent_delete
BEFORE DELETE ON asset_support_contracts
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

CREATE OR REPLACE FUNCTION moarix_guard_contract_revision()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_current = false THEN
    RAISE EXCEPTION 'Historical support contract revisions are immutable';
  END IF;
  IF NEW.is_current <> false
     OR ROW(NEW.id, NEW.company_id, NEW.asset_id, NEW.scope, NEW.status,
            NEW.contract_number, NEW.provider_name, NEW.recipient_name,
            NEW.intermediary_name, NEW.support_level, NEW.service_method,
            NEW.starts_on, NEW.ends_on, NEW.coverage_summary, NEW.exclusions,
            NEW.renewal_owner_id, NEW.notes, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM
        ROW(OLD.id, OLD.company_id, OLD.asset_id, OLD.scope, OLD.status,
            OLD.contract_number, OLD.provider_name, OLD.recipient_name,
            OLD.intermediary_name, OLD.support_level, OLD.service_method,
            OLD.starts_on, OLD.ends_on, OLD.coverage_summary, OLD.exclusions,
            OLD.renewal_owner_id, OLD.notes, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Support contracts must be changed by creating a new revision';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_support_contracts_guard_revision ON asset_support_contracts;
CREATE TRIGGER asset_support_contracts_guard_revision
BEFORE UPDATE ON asset_support_contracts
FOR EACH ROW EXECUTE FUNCTION moarix_guard_contract_revision();

DROP TRIGGER IF EXISTS asset_licenses_prevent_delete ON asset_licenses;
CREATE TRIGGER asset_licenses_prevent_delete
BEFORE DELETE ON asset_licenses
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

DROP TRIGGER IF EXISTS asset_support_contracts_touch_updated_at ON asset_support_contracts;
CREATE TRIGGER asset_support_contracts_touch_updated_at BEFORE UPDATE ON asset_support_contracts
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

DROP TRIGGER IF EXISTS asset_licenses_touch_updated_at ON asset_licenses;
CREATE TRIGGER asset_licenses_touch_updated_at BEFORE UPDATE ON asset_licenses
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

ALTER TABLE asset_support_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_support_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_support_contracts_company_isolation ON asset_support_contracts
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE asset_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_licenses FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_licenses_company_isolation ON asset_licenses
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
