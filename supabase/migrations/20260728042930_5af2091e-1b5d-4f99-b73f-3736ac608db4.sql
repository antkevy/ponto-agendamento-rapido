-- 1) Employees
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT ON public.employees TO anon;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read employees" ON public.employees FOR SELECT TO public USING (true);
CREATE POLICY "owner manage employees" ON public.employees FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = employees.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = employees.professional_id AND p.user_id = auth.uid()));
CREATE INDEX employees_professional_id_idx ON public.employees(professional_id);
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Employee <-> Services (many-to-many)
CREATE TABLE public.employee_services (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_services TO authenticated;
GRANT SELECT ON public.employee_services TO anon;
GRANT ALL ON public.employee_services TO service_role;
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read employee_services" ON public.employee_services FOR SELECT TO public USING (true);
CREATE POLICY "owner manage employee_services" ON public.employee_services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_services.employee_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_services.employee_id AND p.user_id = auth.uid()));
CREATE INDEX employee_services_service_id_idx ON public.employee_services(service_id);

-- 3) Employee availability
CREATE TABLE public.employee_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_availability TO authenticated;
GRANT SELECT ON public.employee_availability TO anon;
GRANT ALL ON public.employee_availability TO service_role;
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read employee_availability" ON public.employee_availability FOR SELECT TO public USING (true);
CREATE POLICY "owner manage employee_availability" ON public.employee_availability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_availability.employee_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_availability.employee_id AND p.user_id = auth.uid()));
CREATE INDEX employee_availability_employee_id_idx ON public.employee_availability(employee_id);

-- 4) Employee blocks
CREATE TABLE public.employee_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_blocks TO authenticated;
GRANT SELECT ON public.employee_blocks TO anon;
GRANT ALL ON public.employee_blocks TO service_role;
ALTER TABLE public.employee_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read employee_blocks" ON public.employee_blocks FOR SELECT TO public USING (true);
CREATE POLICY "owner manage employee_blocks" ON public.employee_blocks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_blocks.employee_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.professionals p ON p.id = e.professional_id WHERE e.id = employee_blocks.employee_id AND p.user_id = auth.uid()));
CREATE INDEX employee_blocks_employee_id_idx ON public.employee_blocks(employee_id);

-- 5) Appointments: add employee_id + make client_email optional + rebuild exclusion
ALTER TABLE public.appointments
  ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ALTER COLUMN client_email DROP NOT NULL;
CREATE INDEX appointments_employee_id_idx ON public.appointments(employee_id);

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS no_overlap_confirmed;
ALTER TABLE public.appointments
  ADD CONSTRAINT no_overlap_confirmed
  EXCLUDE USING gist (
    (COALESCE(employee_id, professional_id)) WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- 6) RPC for employee busy slots
CREATE OR REPLACE FUNCTION public.get_employee_busy_slots(_employee_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT starts_at, ends_at FROM public.appointments
  WHERE employee_id = _employee_id
    AND status = 'confirmed'
    AND starts_at < _to
    AND ends_at > _from;
$$;