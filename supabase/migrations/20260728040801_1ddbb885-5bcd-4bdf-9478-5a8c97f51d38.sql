
-- === Professionals ===
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  owner_name TEXT,
  logo_url TEXT,
  brand_color TEXT NOT NULL DEFAULT '#0284C7',
  description TEXT,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.professionals(slug);
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read professionals" ON public.professionals FOR SELECT USING (true);
CREATE POLICY "owner insert professional" ON public.professionals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update professional" ON public.professionals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner delete professional" ON public.professionals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- === Services ===
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.services(professional_id);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read services" ON public.services FOR SELECT USING (true);
CREATE POLICY "owner manage services" ON public.services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

-- === Availability (weekly schedule) ===
CREATE TABLE public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun..6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX ON public.availability(professional_id);
GRANT SELECT ON public.availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read availability" ON public.availability FOR SELECT USING (true);
CREATE POLICY "owner manage availability" ON public.availability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

-- === Blocks (vacations, single-time blocks) ===
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON public.blocks(professional_id, starts_at);
GRANT SELECT ON public.blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read blocks" ON public.blocks FOR SELECT USING (true);
CREATE POLICY "owner manage blocks" ON public.blocks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

-- === Appointments ===
CREATE TYPE public.appointment_status AS ENUM ('confirmed', 'cancelled', 'completed');

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT NOT NULL,
  notes TEXT,
  status public.appointment_status NOT NULL DEFAULT 'confirmed',
  service_snapshot_name TEXT NOT NULL,
  service_snapshot_price_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON public.appointments(professional_id, starts_at);
CREATE INDEX ON public.appointments(client_phone);
CREATE INDEX ON public.appointments(client_email);
-- Prevent overlapping confirmed appointments for the same professional
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.appointments
  ADD CONSTRAINT no_overlap_confirmed
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

GRANT SELECT, INSERT ON public.appointments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- Anyone can read appointment start/end times (needed to compute availability). Client PII is filtered client-side by selecting only needed columns for public.
-- To keep it simple and safe, only owner can read full rows; public reads go via a view with limited columns.
CREATE POLICY "owner read appointments" ON public.appointments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "public create appointments" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "owner update appointments" ON public.appointments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));
CREATE POLICY "owner delete appointments" ON public.appointments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid()));

-- Public view exposing only busy time ranges (no PII) for availability calculations
CREATE VIEW public.appointment_busy_slots
WITH (security_invoker = true)
AS
SELECT id, professional_id, starts_at, ends_at, status
FROM public.appointments
WHERE status = 'confirmed';
GRANT SELECT ON public.appointment_busy_slots TO anon, authenticated;

-- Allow public SELECT on the underlying rows only through the view: we need a permissive select policy limited to non-PII columns. Simpler: add a policy allowing anon to SELECT confirmed appointments (the view respects RLS via security_invoker), but PII columns would leak.
-- Instead: add a specific anon select policy that returns confirmed rows; the view is queried directly and we advise clients to only select non-PII columns. To truly prevent PII leak, we use security definer function instead:

DROP VIEW public.appointment_busy_slots;

CREATE OR REPLACE FUNCTION public.get_busy_slots(_professional_id UUID, _from TIMESTAMPTZ, _to TIMESTAMPTZ)
RETURNS TABLE(starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT starts_at, ends_at FROM public.appointments
  WHERE professional_id = _professional_id
    AND status = 'confirmed'
    AND starts_at < _to
    AND ends_at > _from;
$$;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- Function for clients to lookup their own appointments by phone or email
CREATE OR REPLACE FUNCTION public.lookup_client_appointments(_contact TEXT)
RETURNS TABLE(
  id UUID,
  professional_id UUID,
  professional_business_name TEXT,
  professional_slug TEXT,
  service_name TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status public.appointment_status,
  client_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.professional_id, p.business_name, p.slug, a.service_snapshot_name,
         a.starts_at, a.ends_at, a.status, a.client_name
  FROM public.appointments a
  JOIN public.professionals p ON p.id = a.professional_id
  WHERE (lower(a.client_email) = lower(_contact) OR a.client_phone = _contact)
  ORDER BY a.starts_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT) TO anon, authenticated;

-- Function for client cancellation using contact
CREATE OR REPLACE FUNCTION public.client_cancel_appointment(_id UUID, _contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INT;
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled', updated_at = now()
  WHERE id = _id
    AND status = 'confirmed'
    AND (lower(client_email) = lower(_contact) OR client_phone = _contact);
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT) TO anon, authenticated;

-- === updated_at trigger ===
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_pros_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_appts_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
