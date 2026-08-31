-- Settlement ledgers are append-only and must never allocate more than the
-- posted document total, even when a caller bypasses the application service.
CREATE OR REPLACE FUNCTION moarix_guard_settlement_allocation()
RETURNS trigger AS $$
DECLARE
  settlement_amount numeric;
  settlement_allocated_total numeric;
  settlement_counterparty_id uuid;
  document_total numeric;
  allocated_total numeric;
  document_counterparty_id uuid;
  document_kind text;
  document_status text;
  settlement_direction text;
BEGIN
  -- Serialize allocations for the same settlement first. This makes the
  -- settlement-level total check safe when two requests allocate concurrently.
  SELECT s.amount, s.counterparty_id, s.direction
    INTO settlement_amount, settlement_counterparty_id, settlement_direction
    FROM public.settlements s
   WHERE s.company_id = NEW.company_id
     AND s.id = NEW.settlement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement does not exist';
  END IF;

  SELECT COALESCE(SUM(a.amount), 0)
    INTO settlement_allocated_total
    FROM public.settlement_allocations a
   WHERE a.company_id = NEW.company_id
     AND a.settlement_id = NEW.settlement_id
     AND (TG_OP <> 'UPDATE' OR a.id <> NEW.id);

  IF settlement_allocated_total + NEW.amount > settlement_amount THEN
    RAISE EXCEPTION 'Settlement allocations exceed the settlement amount';
  END IF;

  SELECT d.grand_total, d.counterparty_id, d.kind, d.status
    INTO document_total, document_counterparty_id, document_kind, document_status
    FROM public.documents d
   WHERE d.company_id = NEW.company_id
     AND d.id = NEW.document_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement document does not exist';
  END IF;

  IF document_status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted documents can receive settlements';
  END IF;

  IF document_kind NOT IN ('invoice', 'bill') THEN
    RAISE EXCEPTION 'Only invoice or bill documents can receive settlements';
  END IF;

  IF document_counterparty_id IS DISTINCT FROM settlement_counterparty_id THEN
    RAISE EXCEPTION 'Settlement counterparty does not match the document';
  END IF;

  IF (settlement_direction = 'receipt' AND document_kind <> 'invoice')
     OR (settlement_direction = 'payment' AND document_kind <> 'bill') THEN
    RAISE EXCEPTION 'Settlement direction does not match document kind';
  END IF;

  SELECT COALESCE(SUM(a.amount), 0)
    INTO allocated_total
    FROM public.settlement_allocations a
   WHERE a.company_id = NEW.company_id
     AND a.document_id = NEW.document_id
     AND (TG_OP <> 'UPDATE' OR a.id <> NEW.id);

  IF allocated_total + NEW.amount > document_total THEN
    RAISE EXCEPTION 'Settlement allocation exceeds the document total';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION moarix_prevent_settlement_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% history is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION moarix_guard_settlement_document_update()
RETURNS trigger AS $$
BEGIN
  -- A posted document is the accounting source for any settlement. Allowing
  -- its amount, kind, or counterparty to change would silently rewrite the
  -- meaning of an already recorded receipt/payment. The updated_at timestamp
  -- is intentionally omitted so the normal touch trigger can still run.
  IF OLD.status = 'posted'
     AND ROW(
       NEW.id, NEW.company_id, NEW.kind, NEW.number, NEW.counterparty_id,
       NEW.warehouse_id, NEW.status, NEW.issue_date, NEW.due_date, NEW.currency,
       NEW.subtotal, NEW.discount_total, NEW.tax_total, NEW.grand_total,
       NEW.notes, NEW.source_document_id, NEW.created_by, NEW.approved_by,
       NEW.approved_at, NEW.posted_at, NEW.version, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.company_id, OLD.kind, OLD.number, OLD.counterparty_id,
       OLD.warehouse_id, OLD.status, OLD.issue_date, OLD.due_date, OLD.currency,
       OLD.subtotal, OLD.discount_total, OLD.tax_total, OLD.grand_total,
       OLD.notes, OLD.source_document_id, OLD.created_by, OLD.approved_by,
       OLD.approved_at, OLD.posted_at, OLD.version, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'Posted documents are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settlement_allocations_guard_total ON settlement_allocations;
CREATE TRIGGER settlement_allocations_guard_total
BEFORE INSERT OR UPDATE ON settlement_allocations
FOR EACH ROW EXECUTE FUNCTION moarix_guard_settlement_allocation();

DROP TRIGGER IF EXISTS settlements_append_only ON settlements;
CREATE TRIGGER settlements_append_only
BEFORE UPDATE ON settlements
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_settlement_update();

DROP TRIGGER IF EXISTS settlement_documents_immutable ON public.documents;
CREATE TRIGGER settlement_documents_immutable
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION moarix_guard_settlement_document_update();

DROP TRIGGER IF EXISTS settlement_allocations_append_only ON settlement_allocations;
CREATE TRIGGER settlement_allocations_append_only
BEFORE UPDATE ON settlement_allocations
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_settlement_update();
