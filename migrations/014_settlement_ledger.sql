CREATE TABLE settlements (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  counterparty_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('receipt', 'payment')),
  reference text,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  settled_on date NOT NULL,
  method text NOT NULL DEFAULT 'bank' CHECK (method IN ('bank', 'card', 'cash', 'offset', 'other')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, counterparty_id) REFERENCES counterparties(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by) REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE settlement_allocations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  settlement_id uuid NOT NULL,
  document_id uuid NOT NULL,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, settlement_id, document_id),
  FOREIGN KEY (company_id, settlement_id) REFERENCES settlements(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, document_id) REFERENCES documents(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX settlements_date_idx ON settlements (company_id, settled_on DESC);
CREATE INDEX settlement_allocations_document_idx ON settlement_allocations (company_id, document_id);

CREATE TRIGGER settlements_prevent_delete BEFORE DELETE ON settlements
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();
CREATE TRIGGER settlement_allocations_prevent_delete BEFORE DELETE ON settlement_allocations
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_delete();

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY settlements_company_isolation ON settlements
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY settlement_allocations_company_isolation ON settlement_allocations
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
