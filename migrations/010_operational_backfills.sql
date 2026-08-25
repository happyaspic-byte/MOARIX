CREATE OR REPLACE FUNCTION public.moarix_company_today()
RETURNS date AS $$
  SELECT (pg_catalog.now() AT TIME ZONE company.timezone)::date
  FROM public.companies AS company
  WHERE company.id = public.moarix_current_company_id();
$$ LANGUAGE sql STABLE
SET search_path = pg_catalog, public, pg_temp;

WITH parsed_document_numbers AS (
  SELECT document.company_id,
         document.kind,
         substring(document.number FROM '^[^-]+-([0-9]{4})-[0-9]+$') AS number_year,
         substring(document.number FROM '([0-9]+)$')::bigint AS sequence_value
  FROM public.documents AS document
  WHERE (document.kind = 'quote' AND document.number ~ '^Q-[0-9]{4}-[0-9]+$')
     OR (document.kind = 'sales_order' AND document.number ~ '^SO-[0-9]{4}-[0-9]+$')
     OR (document.kind = 'purchase_order' AND document.number ~ '^PO-[0-9]{4}-[0-9]+$')
     OR (document.kind = 'invoice' AND document.number ~ '^INV-[0-9]{4}-[0-9]+$')
     OR (document.kind = 'bill' AND document.number ~ '^BILL-[0-9]{4}-[0-9]+$')
)
INSERT INTO public.document_counters (company_id, kind, next_value)
SELECT parsed.company_id,
       parsed.kind || ':' || parsed.number_year,
       MAX(parsed.sequence_value) + 1
FROM parsed_document_numbers AS parsed
GROUP BY parsed.company_id, parsed.kind, parsed.number_year
ON CONFLICT (company_id, kind) DO UPDATE
SET next_value = GREATEST(public.document_counters.next_value, EXCLUDED.next_value);

UPDATE public.assets AS asset
SET next_inspection_date = (
  SELECT MIN(candidate.candidate_date)
  FROM (
    SELECT inspection.scheduled_date AS candidate_date
    FROM public.maintenance_inspections AS inspection
    WHERE inspection.company_id = asset.company_id
      AND inspection.asset_id = asset.id
      AND inspection.status IN ('scheduled', 'in_progress', 'issue_found')
    UNION ALL
    SELECT inspection.next_inspection_date AS candidate_date
    FROM public.maintenance_inspections AS inspection
    JOIN public.companies AS company ON company.id = inspection.company_id
    WHERE inspection.company_id = asset.company_id
      AND inspection.asset_id = asset.id
      AND inspection.status IN ('completed', 'issue_found')
      AND inspection.next_inspection_date >= (pg_catalog.now() AT TIME ZONE company.timezone)::date
  ) AS candidate
)
WHERE EXISTS (
  SELECT 1
  FROM public.maintenance_inspections AS inspection
  WHERE inspection.company_id = asset.company_id
    AND inspection.asset_id = asset.id
);

DROP TRIGGER IF EXISTS service_cases_touch_updated_at ON public.service_cases;

WITH service_case_child_updates AS (
  SELECT child.company_id, child.case_id, MAX(child.created_at) AS latest_created_at
  FROM (
    SELECT activity.company_id, activity.case_id, activity.created_at
    FROM public.service_case_activities AS activity
    UNION ALL
    SELECT attachment.company_id, attachment.case_id, attachment.created_at
    FROM public.service_case_attachments AS attachment
    UNION ALL
    SELECT watcher.company_id, watcher.case_id, watcher.created_at
    FROM public.service_case_watchers AS watcher
  ) AS child
  GROUP BY child.company_id, child.case_id
)
UPDATE public.service_cases AS service_case
SET updated_at = GREATEST(service_case.updated_at, child.latest_created_at)
FROM service_case_child_updates AS child
WHERE child.company_id = service_case.company_id
  AND child.case_id = service_case.id
  AND service_case.updated_at < child.latest_created_at;

CREATE TRIGGER service_cases_touch_updated_at
BEFORE UPDATE ON public.service_cases
FOR EACH ROW EXECUTE FUNCTION public.moarix_touch_updated_at();

CREATE OR REPLACE FUNCTION public.moarix_touch_service_case_parent()
RETURNS trigger AS $$
BEGIN
  UPDATE public.service_cases
  SET updated_at = pg_catalog.now()
  WHERE company_id = NEW.company_id
    AND id = NEW.case_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.moarix_touch_service_case_parent() FROM PUBLIC;

DROP TRIGGER IF EXISTS service_case_activities_touch_parent ON public.service_case_activities;
CREATE TRIGGER service_case_activities_touch_parent
AFTER INSERT ON public.service_case_activities
FOR EACH ROW EXECUTE FUNCTION public.moarix_touch_service_case_parent();

DROP TRIGGER IF EXISTS service_case_attachments_touch_parent ON public.service_case_attachments;
CREATE TRIGGER service_case_attachments_touch_parent
AFTER INSERT ON public.service_case_attachments
FOR EACH ROW EXECUTE FUNCTION public.moarix_touch_service_case_parent();

DROP TRIGGER IF EXISTS service_case_watchers_touch_parent ON public.service_case_watchers;
CREATE TRIGGER service_case_watchers_touch_parent
AFTER INSERT ON public.service_case_watchers
FOR EACH ROW EXECUTE FUNCTION public.moarix_touch_service_case_parent();

CREATE INDEX IF NOT EXISTS service_cases_customer_active_idx
  ON public.service_cases (company_id, counterparty_id, status, updated_at DESC)
  WHERE status IN ('open', 'in_progress', 'waiting');
CREATE INDEX IF NOT EXISTS service_cases_asset_history_idx
  ON public.service_cases (company_id, asset_id, updated_at DESC)
  WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS maintenance_inspections_asset_history_idx
  ON public.maintenance_inspections (company_id, asset_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS customer_sites_customer_active_idx
  ON public.customer_sites (company_id, counterparty_id, is_active);
CREATE INDEX IF NOT EXISTS assets_customer_status_idx
  ON public.assets (company_id, counterparty_id, status);
