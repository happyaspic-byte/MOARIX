ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_warehouse_fk'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_warehouse_fk
      FOREIGN KEY (company_id, warehouse_id)
      REFERENCES warehouses(company_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documents_warehouse_idx
  ON documents (company_id, warehouse_id)
  WHERE warehouse_id IS NOT NULL;
