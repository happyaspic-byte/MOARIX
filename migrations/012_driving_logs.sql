CREATE UNIQUE INDEX service_cases_company_customer_id_unique
  ON public.service_cases (company_id, counterparty_id, id);

CREATE TABLE public.driving_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  number text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  departure text NOT NULL,
  destination text NOT NULL,
  purpose text NOT NULL,
  vehicle_name text NOT NULL,
  distance_km numeric(12,4) NOT NULL CHECK (distance_km > 0),
  rate_per_km numeric(19,4) NOT NULL DEFAULT 0 CHECK (rate_per_km >= 0),
  toll_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (toll_amount >= 0),
  parking_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (parking_amount >= 0),
  fuel_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (fuel_amount >= 0),
  daily_allowance_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (daily_allowance_amount >= 0),
  total_amount numeric(19,4) NOT NULL CHECK (total_amount >= 0),
  counterparty_id uuid,
  site_id uuid,
  case_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'void')),
  reason text,
  notes text,
  void_reason text,
  created_by uuid NOT NULL,
  approved_by uuid,
  voided_by uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (company_id, number),
  UNIQUE (company_id, id),
  CHECK (end_date >= start_date),
  CHECK ((site_id IS NULL AND case_id IS NULL) OR counterparty_id IS NOT NULL),
  CHECK (
    total_amount = pg_catalog.round(
      distance_km * rate_per_km
      + toll_amount
      + parking_amount
      + fuel_amount
      + daily_allowance_amount,
      0
    )
  ),
  CHECK (
    (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR status <> 'approved'
  ),
  CHECK (
    (status = 'void' AND voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(void_reason)) > 0)
    OR status <> 'void'
  ),
  FOREIGN KEY (company_id, counterparty_id)
    REFERENCES public.counterparties(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, counterparty_id, site_id)
    REFERENCES public.customer_sites(company_id, counterparty_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, counterparty_id, case_id)
    REFERENCES public.service_cases(company_id, counterparty_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES public.company_members(company_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, approved_by)
    REFERENCES public.company_members(company_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, voided_by)
    REFERENCES public.company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX driving_logs_month_idx
  ON public.driving_logs (company_id, start_date DESC, created_at DESC);
CREATE INDEX driving_logs_status_month_idx
  ON public.driving_logs (company_id, status, start_date DESC);
CREATE INDEX driving_logs_customer_idx
  ON public.driving_logs (company_id, counterparty_id, start_date DESC)
  WHERE counterparty_id IS NOT NULL;
CREATE INDEX driving_logs_site_idx
  ON public.driving_logs (company_id, site_id, start_date DESC)
  WHERE site_id IS NOT NULL;
CREATE INDEX driving_logs_case_idx
  ON public.driving_logs (company_id, case_id)
  WHERE case_id IS NOT NULL;
CREATE INDEX driving_logs_creator_idx
  ON public.driving_logs (company_id, created_by);
CREATE INDEX driving_logs_approver_idx
  ON public.driving_logs (company_id, approved_by)
  WHERE approved_by IS NOT NULL;
CREATE INDEX driving_logs_voider_idx
  ON public.driving_logs (company_id, voided_by)
  WHERE voided_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.moarix_guard_driving_log()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Driving logs cannot be deleted; void the entry instead';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1
       OR NEW.submitted_at IS NOT NULL OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.voided_by IS NOT NULL
       OR NEW.voided_at IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Driving logs must be created as draft';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Driving log version must increase by exactly one';
  END IF;

  IF OLD.status <> 'draft' AND ROW(
    NEW.start_date, NEW.end_date, NEW.departure, NEW.destination, NEW.purpose,
    NEW.vehicle_name, NEW.distance_km, NEW.rate_per_km, NEW.toll_amount,
    NEW.parking_amount, NEW.fuel_amount, NEW.daily_allowance_amount,
    NEW.total_amount, NEW.counterparty_id, NEW.site_id, NEW.case_id,
    NEW.reason, NEW.notes, NEW.created_by
  ) IS DISTINCT FROM ROW(
    OLD.start_date, OLD.end_date, OLD.departure, OLD.destination, OLD.purpose,
    OLD.vehicle_name, OLD.distance_km, OLD.rate_per_km, OLD.toll_amount,
    OLD.parking_amount, OLD.fuel_amount, OLD.daily_allowance_amount,
    OLD.total_amount, OLD.counterparty_id, OLD.site_id, OLD.case_id,
    OLD.reason, OLD.notes, OLD.created_by
  ) THEN
    RAISE EXCEPTION 'Only draft driving logs can be edited';
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('draft', 'submitted', 'void'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('draft', 'approved', 'void'))
    OR (OLD.status = 'approved' AND NEW.status = 'void')
  ) THEN
    RAISE EXCEPTION 'Invalid driving log transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'approved' THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Driving log approval metadata is required';
    END IF;
    IF NEW.created_by = NEW.approved_by THEN
      RAISE EXCEPTION 'Driving log creator cannot approve their own entry';
    END IF;
  END IF;

  IF NEW.status = 'void' AND (
    NEW.voided_by IS NULL OR NEW.voided_at IS NULL
    OR NEW.void_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(NEW.void_reason)) = 0
  ) THEN
    RAISE EXCEPTION 'Void reason and actor are required';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.moarix_guard_driving_log() FROM PUBLIC;

CREATE TRIGGER driving_logs_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.driving_logs
FOR EACH ROW EXECUTE FUNCTION public.moarix_guard_driving_log();

CREATE TRIGGER driving_logs_touch_updated_at
BEFORE UPDATE ON public.driving_logs
FOR EACH ROW EXECUTE FUNCTION public.moarix_touch_updated_at();

ALTER TABLE public.driving_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driving_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY driving_logs_company_isolation ON public.driving_logs
  USING (company_id = (SELECT public.moarix_current_company_id()))
  WITH CHECK (company_id = (SELECT public.moarix_current_company_id()));
