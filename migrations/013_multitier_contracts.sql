-- Support Multi-tier Contract and Revision Chain
ALTER TABLE asset_support_contracts
  DROP CONSTRAINT IF EXISTS asset_support_contracts_scope_check;

ALTER TABLE asset_support_contracts
  ADD CONSTRAINT asset_support_contracts_scope_check
  CHECK (scope IN ('customer_support', 'partner_support', 'vendor_support'));

ALTER TABLE asset_support_contracts
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1;

-- Index to query chronological contract revisions
CREATE INDEX IF NOT EXISTS asset_support_contracts_history_idx
  ON asset_support_contracts (company_id, asset_id, scope, created_at DESC);

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
            NEW.renewal_owner_id, NEW.notes, NEW.created_by, NEW.created_at,
            NEW.revision_number)
        IS DISTINCT FROM
        ROW(OLD.id, OLD.company_id, OLD.asset_id, OLD.scope, OLD.status,
            OLD.contract_number, OLD.provider_name, OLD.recipient_name,
            OLD.intermediary_name, OLD.support_level, OLD.service_method,
            OLD.starts_on, OLD.ends_on, OLD.coverage_summary, OLD.exclusions,
            OLD.renewal_owner_id, OLD.notes, OLD.created_by, OLD.created_at,
            OLD.revision_number)
  THEN
    RAISE EXCEPTION 'Support contracts must be changed by creating a new revision';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
