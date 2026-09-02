ALTER TABLE customer_sites
  ADD COLUMN IF NOT EXISTS si_contact_name text,
  ADD COLUMN IF NOT EXISTS si_contact_phone text,
  ADD COLUMN IF NOT EXISTS si_contact_email text;
