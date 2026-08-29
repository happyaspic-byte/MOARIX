CREATE TABLE outbound_messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  to_address text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  related_type text,
  related_id uuid,
  error_message text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, created_by) REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX outbound_messages_status_idx ON outbound_messages (company_id, status, created_at DESC);

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY outbound_messages_company_isolation ON outbound_messages
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
