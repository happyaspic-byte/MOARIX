ALTER TABLE maintenance_inspections
  ADD COLUMN customer_confirmed_by text,
  ADD COLUMN customer_confirmed_at timestamptz,
  ADD CONSTRAINT maintenance_inspections_engineer_member_fk
    FOREIGN KEY (company_id, engineer_id)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT maintenance_inspections_creator_member_fk
    FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT;

CREATE TABLE inspection_check_items (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  inspection_id uuid NOT NULL,
  item_key text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  result text NOT NULL DEFAULT 'na'
    CHECK (result IN ('pass', 'warning', 'fail', 'na')),
  observed_value text,
  notes text,
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, inspection_id, item_key),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, inspection_id)
    REFERENCES maintenance_inspections(company_id, id) ON DELETE RESTRICT
);

CREATE INDEX inspection_check_items_inspection_idx
  ON inspection_check_items (company_id, inspection_id, position);

INSERT INTO inspection_check_items
  (id, company_id, inspection_id, item_key, category, label, result,
   observed_value, position)
SELECT
  md5(inspection.id::text || ':' || item.item_key)::uuid,
  inspection.company_id,
  inspection.id,
  item.item_key,
  item.category,
  item.label,
  CASE item.item_key
    WHEN 'protection' THEN inspection.protection_status
    WHEN 'sync' THEN inspection.sync_status
    WHEN 'service' THEN inspection.service_status
    WHEN 'cpu' THEN CASE WHEN inspection.cpu_percent IS NULL THEN 'na' WHEN inspection.cpu_percent >= 95 THEN 'fail' WHEN inspection.cpu_percent >= 80 THEN 'warning' ELSE 'pass' END
    WHEN 'memory' THEN CASE WHEN inspection.memory_percent IS NULL THEN 'na' WHEN inspection.memory_percent >= 95 THEN 'fail' WHEN inspection.memory_percent >= 80 THEN 'warning' ELSE 'pass' END
    WHEN 'disk' THEN CASE WHEN inspection.disk_percent IS NULL THEN 'na' WHEN inspection.disk_percent >= 95 THEN 'fail' WHEN inspection.disk_percent >= 80 THEN 'warning' ELSE 'pass' END
  END,
  CASE item.item_key
    WHEN 'cpu' THEN CASE WHEN inspection.cpu_percent IS NULL THEN NULL ELSE inspection.cpu_percent::text || '%' END
    WHEN 'memory' THEN CASE WHEN inspection.memory_percent IS NULL THEN NULL ELSE inspection.memory_percent::text || '%' END
    WHEN 'disk' THEN CASE WHEN inspection.disk_percent IS NULL THEN NULL ELSE inspection.disk_percent::text || '%' END
    ELSE NULL
  END,
  item.position
FROM maintenance_inspections inspection
CROSS JOIN (VALUES
  ('protection', 'availability', 'Protection 상태', 1),
  ('sync', 'availability', '동기화 상태', 2),
  ('service', 'availability', '서비스 상태', 3),
  ('cpu', 'resources', 'CPU 사용률', 4),
  ('memory', 'resources', '메모리 사용률', 5),
  ('disk', 'resources', '디스크 사용률', 6)
) AS item(item_key, category, label, position)
ON CONFLICT (company_id, inspection_id, item_key) DO NOTHING;

CREATE TABLE service_case_watchers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'customer', 'vendor', 'distribution_list')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, case_id)
    REFERENCES service_cases(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX service_case_watchers_email_unique
  ON service_case_watchers (company_id, case_id, lower(email));
CREATE INDEX service_case_watchers_case_idx
  ON service_case_watchers (company_id, case_id, created_at);

CREATE OR REPLACE FUNCTION moarix_guard_final_inspection_check()
RETURNS trigger AS $$
DECLARE
  target_company_id uuid;
  target_inspection_id uuid;
  target_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND ROW(NEW.company_id, NEW.inspection_id, NEW.item_key)
         IS DISTINCT FROM ROW(OLD.company_id, OLD.inspection_id, OLD.item_key)
  THEN
    RAISE EXCEPTION 'Inspection checklist identity cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    target_company_id := OLD.company_id;
    target_inspection_id := OLD.inspection_id;
  ELSE
    target_company_id := NEW.company_id;
    target_inspection_id := NEW.inspection_id;
  END IF;
  SELECT inspection.status
    INTO target_status
    FROM public.maintenance_inspections AS inspection
   WHERE inspection.company_id = target_company_id
     AND inspection.id = target_inspection_id
   FOR SHARE;
  IF target_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Final inspection checklist cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS inspection_check_items_guard_final ON inspection_check_items;
CREATE TRIGGER inspection_check_items_guard_final
BEFORE INSERT OR UPDATE OR DELETE ON inspection_check_items
FOR EACH ROW EXECUTE FUNCTION moarix_guard_final_inspection_check();

DROP TRIGGER IF EXISTS inspection_check_items_touch_updated_at ON inspection_check_items;
CREATE TRIGGER inspection_check_items_touch_updated_at BEFORE UPDATE ON inspection_check_items
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

ALTER TABLE inspection_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_check_items FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_check_items_company_isolation ON inspection_check_items
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE service_case_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_watchers FORCE ROW LEVEL SECURITY;
CREATE POLICY service_case_watchers_company_isolation ON service_case_watchers
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());
