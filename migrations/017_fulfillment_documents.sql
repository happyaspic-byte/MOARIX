ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('quote', 'sales_order', 'shipment', 'purchase_order', 'receipt', 'invoice', 'bill'));
CREATE INDEX IF NOT EXISTS documents_source_document_idx
  ON documents (company_id, source_document_id)
  WHERE source_document_id IS NOT NULL;
