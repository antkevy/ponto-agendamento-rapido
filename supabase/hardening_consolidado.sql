-- =====================================================================
-- Hardening consolidado - Agendaí (ponto-agendamento-rapido)
-- Aplicar manualmente no Supabase SQL editor do projeto
-- (https://sjxlludhozmojihuqxby.supabase.co -> SQL Editor)
-- É seguro rodar mais de uma vez (idempotente).
-- =====================================================================

-- ************************************************************
-- 1) Hardening do INSERT público em agendamentos (página /p/:slug)
--    Policy mais rígida + trigger de rate limit
-- ************************************************************

DROP POLICY IF EXISTS "public create agendamentos" ON public.agendamentos;

CREATE POLICY "public create agendamentos" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND status = 'confirmed'
    -- Validação dos dados do cliente (bloqueia inserts em branco/fabricados)
    AND btrim(client_name) <> ''
    AND char_length(btrim(client_name)) BETWEEN 2 AND 200
    AND regexp_replace(btrim(client_phone), '\D', '', 'g') ~ '^[0-9]{10,11}$'
    AND (client_email IS NULL OR client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    AND EXISTS (
      SELECT 1 FROM public.servicos s
      WHERE s.id = agendamentos.service_id
        AND s.professional_id = agendamentos.professional_id
        AND s.is_active
    )
    AND (
      agendamentos.employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.funcionarios e
        WHERE e.id = agendamentos.employee_id
          AND e.professional_id = agendamentos.professional_id
          AND e.is_active
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_agendamentos_phone_confirmado
  ON public.agendamentos (client_phone, status, created_at);

CREATE OR REPLACE FUNCTION public.prevent_booking_abuse()
RETURNS TRIGGER AS $$
DECLARE
  recent INT;
BEGIN
  IF NEW.client_phone IS NULL OR btrim(NEW.client_phone) = '' THEN
    RAISE EXCEPTION 'Informe um telefone válido para confirmar o agendamento.';
  END IF;

  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE client_phone = NEW.client_phone
    AND status = 'confirmed'
    AND created_at > now() - interval '24 hours';
  IF recent >= 8 THEN
    RAISE EXCEPTION 'Muitos agendamentos criados por este telefone. Tente novamente mais tarde.';
  END IF;

  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE client_phone = NEW.client_phone
    AND professional_id = NEW.professional_id
    AND status = 'confirmed'
    AND created_at > now() - interval '60 minutes';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'Você já reservou um horário recentemente com este profissional. Escolha outro horário.';
  END IF;

  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE client_phone = NEW.client_phone
    AND professional_id = NEW.professional_id
    AND status = 'confirmed'
    AND starts_at > now();
  IF recent >= 5 THEN
    RAISE EXCEPTION 'Este telefone já possui agendamentos futuros com este profissional.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_booking_abuse ON public.agendamentos;
CREATE TRIGGER trg_prevent_booking_abuse
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_booking_abuse();

-- ************************************************************
-- 2) Restringe leitura anon de profissionais às colunas públicas
-- ************************************************************

REVOKE SELECT ON public.profissionais FROM anon;

GRANT SELECT (
  id, slug, business_name, logo_url, brand_color, description,
  address, phone, lat, lng, timezone
) ON public.profissionais TO anon;

DROP POLICY IF EXISTS "public read professionals" ON public.profissionais;

-- ************************************************************
-- 3) Hardening das RPCs públicas de contato (lookup/cancel)
--    Rate limit + validação de formato + normalização de telefone
-- ************************************************************

CREATE TABLE IF NOT EXISTS public.public_contact_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact TEXT NOT NULL,
  op TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_contact_attempts_window
  ON public.public_contact_attempts (contact, op, created_at);

REVOKE ALL ON public.public_contact_attempts FROM anon, authenticated;
ALTER TABLE public.public_contact_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_contact_rate_limit(
  _contact TEXT,
  _op TEXT,
  _max INT,
  _window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.public_contact_attempts WHERE created_at < now() - _window;
  IF (SELECT COUNT(*) FROM public.public_contact_attempts
      WHERE contact = _contact AND op = _op AND created_at > now() - _window) >= _max THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.public_contact_attempts (contact, op) VALUES (_contact, _op);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_contact_rate_limit(TEXT, TEXT, INT, INTERVAL) FROM PUBLIC, anon, authenticated;

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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
BEGIN
  IF contact_norm = '' THEN
    RETURN;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'lookup', 20, interval '15 minutes') THEN
    RETURN;
  END IF;

  IF position('@' IN contact_norm) > 0 THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT a.id, a.professional_id, p.business_name, p.slug, a.service_snapshot_name,
             a.starts_at, a.ends_at, a.status, a.client_name
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.professional_id
      WHERE lower(a.client_email) = lower(contact_norm)
      ORDER BY a.starts_at DESC
      LIMIT 100;
  ELSE
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT a.id, a.professional_id, p.business_name, p.slug, a.service_snapshot_name,
             a.starts_at, a.ends_at, a.status, a.client_name
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.professional_id
      WHERE regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm
      ORDER BY a.starts_at DESC
      LIMIT 100;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.client_cancel_appointment(_id UUID, _contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  rows_affected INT;
BEGIN
  IF contact_norm = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'cancel', 5, interval '15 minutes') THEN
    RETURN FALSE;
  END IF;

  IF position('@' IN contact_norm) > 0 THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN FALSE;
    END IF;
    UPDATE public.agendamentos
    SET status = 'cancelled', updated_at = now()
    WHERE id = _id
      AND status = 'confirmed'
      AND lower(client_email) = lower(contact_norm);
  ELSE
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN FALSE;
    END IF;
    UPDATE public.agendamentos
    SET status = 'cancelled', updated_at = now()
    WHERE id = _id
      AND status = 'confirmed'
      AND regexp_replace(client_phone, '\D', '', 'g') = contact_norm;
  END IF;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT) TO anon, authenticated;

-- =====================================================================
-- Fim. Após rodar, confira no painel "SQL Editor" que não houve erros.
-- =====================================================================
