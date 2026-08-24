ALTER TABLE service_cases
  ADD COLUMN case_type text NOT NULL DEFAULT 'incident',
  ADD COLUMN contact_name text,
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD COLUMN entitlement text,
  ADD COLUMN external_state text,
  ADD COLUMN source_url text,
  ADD COLUMN max_severity text NOT NULL DEFAULT 'normal';

UPDATE service_cases SET max_severity = severity;

ALTER TABLE service_cases
  ADD CONSTRAINT service_cases_case_type_check
    CHECK (case_type IN ('incident', 'request', 'question', 'maintenance')),
  ADD CONSTRAINT service_cases_external_reference_check
    CHECK (external_case_number IS NULL OR (external_provider IS NOT NULL AND length(btrim(external_provider)) > 0)),
  ADD CONSTRAINT service_cases_source_url_check
    CHECK (source_url IS NULL OR source_url LIKE 'https://%'),
  ADD CONSTRAINT service_cases_max_severity_check
    CHECK (max_severity IN ('low', 'normal', 'high', 'critical')),
  ADD CONSTRAINT service_cases_max_severity_rank_check
    CHECK (
      CASE max_severity
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'normal' THEN 2
        ELSE 1
      END >=
      CASE severity
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'normal' THEN 2
        ELSE 1
      END
    );

CREATE UNIQUE INDEX service_cases_external_reference_ci_unique
  ON service_cases (company_id, lower(external_provider), lower(external_case_number))
  WHERE external_case_number IS NOT NULL;

CREATE INDEX service_cases_active_queue_idx
  ON service_cases (company_id, due_at, next_action_at, severity, updated_at DESC)
  WHERE status IN ('open', 'in_progress', 'waiting');

CREATE OR REPLACE FUNCTION moarix_preserve_service_case_max_severity()
RETURNS trigger AS $$
DECLARE
  current_rank integer;
  max_rank integer;
  previous_rank integer;
BEGIN
  current_rank := CASE NEW.severity
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END;
  max_rank := CASE NEW.max_severity
    WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END;

  IF TG_OP = 'UPDATE' THEN
    previous_rank := CASE OLD.max_severity
      WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END;
    IF max_rank < previous_rank THEN
      NEW.max_severity := OLD.max_severity;
      max_rank := previous_rank;
    END IF;
  END IF;

  IF current_rank > max_rank THEN
    NEW.max_severity := NEW.severity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_cases_preserve_max_severity ON service_cases;
CREATE TRIGGER service_cases_preserve_max_severity
BEFORE INSERT OR UPDATE OF severity, max_severity ON service_cases
FOR EACH ROW EXECUTE FUNCTION moarix_preserve_service_case_max_severity();

CREATE TABLE service_case_activities (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('comment', 'internal_note', 'vendor_reply', 'customer_reply', 'status_change', 'system')),
  visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('shared', 'internal')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  author_name text NOT NULL CHECK (length(btrim(author_name)) BETWEEN 1 AND 120),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, case_id)
    REFERENCES service_cases(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX service_case_activities_timeline_idx
  ON service_case_activities (company_id, case_id, occurred_at DESC, created_at DESC);

CREATE TABLE service_case_attachments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  source_url text NOT NULL,
  content_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  description text,
  uploaded_by uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, case_id)
    REFERENCES service_cases(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, uploaded_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX service_case_attachments_case_idx
  ON service_case_attachments (company_id, case_id, occurred_at DESC);

DROP TRIGGER IF EXISTS service_case_activities_immutable ON service_case_activities;
CREATE TRIGGER service_case_activities_immutable
BEFORE UPDATE OR DELETE ON service_case_activities
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_immutable_change();

DROP TRIGGER IF EXISTS service_case_attachments_immutable ON service_case_attachments;
CREATE TRIGGER service_case_attachments_immutable
BEFORE UPDATE OR DELETE ON service_case_attachments
FOR EACH ROW EXECUTE FUNCTION moarix_prevent_immutable_change();

ALTER TABLE service_case_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY service_case_activities_company_isolation ON service_case_activities
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE service_case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY service_case_attachments_company_isolation ON service_case_attachments
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
