CREATE OR REPLACE FUNCTION public.auto_link_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cid UUID;
  phone_norm TEXT := regexp_replace(coalesce(NEW.client_phone, ''), '\D', '', 'g');
BEGIN
  SELECT id INTO cid FROM public.clientes
  WHERE professional_id = NEW.professional_id
    AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = phone_norm
  LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.clientes (professional_id, name, phone, email)
    VALUES (NEW.professional_id, NEW.client_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO cid;
  END IF;
  -- Agendamentos nunca alteram dados de um cliente já cadastrado.
  NEW.client_id := cid;
  RETURN NEW;
END; $$;

-- Busy slots: only public businesses / active staff, future window up to 62 days,
-- and overlapping appointments merged so individual bookings can't be told apart.
CREATE OR REPLACE FUNCTION public.get_busy_slots(_professional_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (
    SELECT greatest(_from, now() - interval '1 day') AS f,
           least(_to, greatest(_from, now() - interval '1 day') + interval '62 days') AS t
  ), r AS (
    SELECT range_agg(tstzrange(a.starts_at, a.ends_at)) AS m
    FROM public.agendamentos a, w
    WHERE a.professional_id = _professional_id
      AND a.status = 'confirmed'
      AND a.starts_at < w.t AND a.ends_at > w.f
      AND EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = _professional_id AND p.slug IS NOT NULL)
  )
  SELECT lower(x), upper(x) FROM r, unnest(r.m) x;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_busy_slots(_employee_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (
    SELECT greatest(_from, now() - interval '1 day') AS f,
           least(_to, greatest(_from, now() - interval '1 day') + interval '62 days') AS t
  ), r AS (
    SELECT range_agg(tstzrange(a.starts_at, a.ends_at)) AS m
    FROM public.agendamentos a, w
    WHERE a.employee_id = _employee_id
      AND a.status = 'confirmed'
      AND a.starts_at < w.t AND a.ends_at > w.f
      AND EXISTS (SELECT 1 FROM public.funcionarios e WHERE e.id = _employee_id AND e.is_active)
  )
  SELECT lower(x), upper(x) FROM r, unnest(r.m) x;
$$;