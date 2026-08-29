ALTER TABLE document_lines
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE document_lines
  DROP CONSTRAINT IF EXISTS document_lines_company_id_document_id_position_key;

CREATE UNIQUE INDEX IF NOT EXISTS document_lines_current_position_idx
  ON document_lines (company_id, document_id, position)
  WHERE superseded_at IS NULL;

CREATE OR REPLACE FUNCTION moarix_guard_document_line_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document_lines is append-only';
  END IF;

  IF OLD.superseded_at IS NOT NULL
     OR NEW.superseded_at IS NULL
     OR (to_jsonb(NEW) - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'document_lines is append-only';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_lines_immutable ON document_lines;
CREATE TRIGGER document_lines_immutable
BEFORE UPDATE OR DELETE ON document_lines
FOR EACH ROW EXECUTE FUNCTION moarix_guard_document_line_change();
