-- ============================================================
-- Código de confirmação por agendamento (anti-enumeração)
-- ============================================================

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS access_code TEXT;

CREATE INDEX IF NOT EXISTS idx_agendamentos_access_code
  ON public.agendamentos (access_code);

-- Trigger: garante formato e imutabilidade do código
CREATE OR REPLACE FUNCTION public.enforce_appointment_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.access_code IS NULL OR NEW.access_code !~ '^[0-9]{6}$' THEN
      NEW.access_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    END IF;
  ELSE
    NEW.access_code := OLD.access_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_access_code ON public.agendamentos;
CREATE TRIGGER trg_appointment_access_code
  BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_access_code();

-- ============================================================
-- lookup_client_appointments: exige o código de confirmação
-- ============================================================
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT);
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT, TEXT);

CREATE FUNCTION public.lookup_client_appointments(_contact TEXT, _code TEXT DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  professional_id UUID,
  employee_id UUID,
  professional_business_name TEXT,
  professional_slug TEXT,
  service_name TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  duration_minutes INT,
  status public.appointment_status,
  client_name TEXT,
  access_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  verified BOOLEAN := FALSE;
BEGIN
  IF contact_norm = '' THEN
    RETURN;
  END IF;

  -- Limite global (freia enumeração através de muitos contatos diferentes)
  IF NOT public.check_contact_rate_limit('__global__', 'lookup', 400, interval '15 minutes') THEN
    RETURN;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'lookup', 20, interval '15 minutes') THEN
    RETURN;
  END IF;

  is_email := position('@' IN contact_norm) > 0;

  IF is_email THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN;
    END IF;
    contact_norm := lower(contact_norm);
  ELSE
    IF contact_norm !~ '^[0-9]{10,13}$' THEN
      RETURN;
    END IF;
    IF contact_norm ~ '^55[0-9]{10,11}$' THEN
      contact_norm := substr(contact_norm, 3);
    END IF;
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN;
    END IF;
  END IF;

  -- O código prova a posse do contato: basta um código válido daquele contato.
  IF code_norm IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.access_code = code_norm
        AND (
          (is_email AND lower(a.client_email) = contact_norm)
          OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
        )
    ) INTO verified;
  END IF;

  RETURN QUERY
    SELECT a.id, a.professional_id, a.employee_id, p.business_name, p.slug,
           a.service_snapshot_name, a.starts_at, a.ends_at,
           (EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 60)::int,
           a.status, a.client_name, a.access_code
    FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.professional_id
    WHERE (
        (is_email AND lower(a.client_email) = contact_norm)
        OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
      )
      -- Agendamentos legados (sem código) seguem acessíveis; os novos exigem código.
      AND (a.access_code IS NULL OR verified)
    ORDER BY a.starts_at DESC
    LIMIT 100;
END;
$$;

-- ============================================================
-- client_cancel_appointment: exige o código do agendamento
-- ============================================================
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT, TEXT);

CREATE FUNCTION public.client_cancel_appointment(_id UUID, _contact TEXT, _code TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  target_id UUID;
  target_starts TIMESTAMPTZ;
BEGIN
  IF contact_norm = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT public.check_contact_rate_limit('__global__', 'cancel', 200, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'cancel', 5, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  is_email := position('@' IN contact_norm) > 0;

  IF is_email THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN FALSE;
    END IF;
    contact_norm := lower(contact_norm);
  ELSE
    IF contact_norm !~ '^[0-9]{10,13}$' THEN
      RETURN FALSE;
    END IF;
    IF contact_norm ~ '^55[0-9]{10,11}$' THEN
      contact_norm := substr(contact_norm, 3);
    END IF;
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT a.id, a.starts_at INTO target_id, target_starts
  FROM public.agendamentos a
  WHERE a.id = _id
    AND a.status = 'confirmed'
    AND (
      (is_email AND lower(a.client_email) = contact_norm)
      OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
    )
    AND (a.access_code IS NULL OR a.access_code = code_norm);

  IF target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF target_starts <= now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Só é possível cancelar até 24 horas antes do horário marcado.';
  END IF;

  UPDATE public.agendamentos
  SET status = 'cancelled', updated_at = now()
  WHERE id = target_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- client_reschedule_appointment: exige o código do agendamento
-- ============================================================
DROP FUNCTION IF EXISTS public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ, TEXT);

CREATE FUNCTION public.client_reschedule_appointment(
  _id UUID,
  _contact TEXT,
  _starts_at TIMESTAMPTZ,
  _code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  row public.agendamentos%ROWTYPE;
  new_ends TIMESTAMPTZ;
BEGIN
  IF contact_norm = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT public.check_contact_rate_limit('__global__', 'reschedule', 200, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'reschedule', 10, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  is_email := position('@' IN contact_norm) > 0;

  IF is_email THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN FALSE;
    END IF;
    contact_norm := lower(contact_norm);
  ELSE
    IF contact_norm !~ '^[0-9]{10,13}$' THEN
      RETURN FALSE;
    END IF;
    IF contact_norm ~ '^55[0-9]{10,11}$' THEN
      contact_norm := substr(contact_norm, 3);
    END IF;
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN FALSE;
    END IF;
  END IF;

  SELECT * INTO row
  FROM public.agendamentos a
  WHERE a.id = _id
    AND a.status = 'confirmed'
    AND (
      (is_email AND lower(a.client_email) = contact_norm)
      OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
    )
    AND (a.access_code IS NULL OR a.access_code = code_norm);

  IF row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _starts_at <= now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Só é possível reagendar até 24 horas antes do horário marcado.';
  END IF;

  new_ends := _starts_at + (row.ends_at - row.starts_at);

  BEGIN
    UPDATE public.agendamentos
    SET starts_at = _starts_at, ends_at = new_ends, updated_at = now()
    WHERE id = row.id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Esse horário acabou de ser reservado. Escolha outro.';
  END;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;