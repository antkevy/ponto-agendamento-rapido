-- Hardening das RPCs públicas (lint 0028 - anon_security_definer_function_executable).
--
-- Decisão: manter SECURITY DEFINER + EXECUTE para anon. Migrar para SECURITY
-- INVOKER quebraria o produto: anon não tem SELECT via RLS em agendamentos,
-- então as funções de booking/"meus agendamentos" deixariam de retornar dados.
--
-- Esta migração reduz a superfície de abuso das duas funções que aceitam
-- contato do cliente (vetor de enumeração de PII):
--   1) Rate limit por contato (janela deslizante, tabela de tentativas).
--   2) Validação de formato do contato (bloqueia strings arbitrárias).
--   3) Normalização de telefone (somente dígitos) na comparação.
-- get_busy_slots / get_employee_busy_slots retornam apenas janelas de tempo
-- (sem PII) e permanecem inalteradas.

-- ========== 1) Tabela de tentativas (acessível só via SECURITY DEFINER) ==========
CREATE TABLE IF NOT EXISTS public.public_contact_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact TEXT NOT NULL,
  op TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_contact_attempts_window
  ON public.public_contact_attempts (contact, op, created_at);

-- Dupla barreira: sem grants + RLS (o dono da função passa por RLS).
REVOKE ALL ON public.public_contact_attempts FROM anon, authenticated;
ALTER TABLE public.public_contact_attempts ENABLE ROW LEVEL SECURITY;

-- ========== 2) Guard genérico de rate limit por contato ==========
-- Não é executável por anon (REVOKE abaixo): é chamada internamente pelas
-- funções públicas. Evita que um atacante sature a contagem de outro contato.
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

-- ========== 3) Lookup de agendamentos por contato ==========
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

-- ========== 4) Cancelamento por contato ==========
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

-- ========== 5) Reafirma os grants EXECUTE das funções públicas ==========
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT) TO anon, authenticated;
