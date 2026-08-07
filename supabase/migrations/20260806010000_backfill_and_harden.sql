-- =====================================================================
-- Agendaí — Backfill de user_security + endurecimento de booking/log
-- Aplicar no Supabase SQL Editor (idempotente).
-- 1) Backfill: usuários criados ANTES da security_core ficaram sem row em
--    user_security; sem ela current_user_role() cai em 'user' e os triggers
--    RBAC bloqueiam todas as escritas do dono (servicos, planos, produtos,
--    funcionarios, horarios, bloqueios, ...).
-- 2) Booking público: teto de duração (24h) e horizonte (120 dias) no policy
--    e no trigger — sem isso, um único agendamento com ends_at anos à frente
--    congela a agenda do profissional via exclusion constraint.
-- 3) log_auth_event endurecido: contato precisa ser e-mail ou telefone BR,
--    tamanho capado e rate limit mais apertado (mantém anon, pois login_failed
--    roda sem sessão).
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Backfill de user_security para usuários pré-existentes
-- ************************************************************
INSERT INTO public.user_security (user_id, role)
SELECT u.id, 'admin'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_security s WHERE s.user_id = u.id
);

-- ************************************************************
-- 2) Teto de duração/horizonte no booking público
-- ************************************************************
DROP POLICY IF EXISTS "public create agendamentos" ON public.agendamentos;
CREATE POLICY "public create agendamentos" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND ends_at - starts_at <= interval '24 hours'
    AND starts_at <= now() + interval '120 days'
    AND status = 'confirmed'
    AND btrim(client_name) <> ''
    AND char_length(btrim(client_name)) BETWEEN 2 AND 200
    AND regexp_replace(btrim(client_phone), '\D', '', 'g') ~ '^[0-9]{10,11}$'
    AND (client_email IS NULL OR client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    AND char_length(btrim(service_snapshot_name)) <= 200
    AND (agendamentos.notes IS NULL OR char_length(btrim(agendamentos.notes)) <= 500)
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

-- Reforço no trigger (mensagens de erro claras + defesa em profundidade).
CREATE OR REPLACE FUNCTION public.prevent_booking_abuse()
RETURNS TRIGGER AS $$
DECLARE
  recent INT;
BEGIN
  IF NEW.client_phone IS NULL OR btrim(NEW.client_phone) = '' THEN
    RAISE EXCEPTION 'Informe um telefone válido para confirmar o agendamento.';
  END IF;

  IF NEW.starts_at > now() + interval '120 days' THEN
    RAISE EXCEPTION 'Não é possível agendar com tanta antecedência.';
  END IF;

  IF NEW.ends_at - NEW.starts_at > interval '24 hours' THEN
    RAISE EXCEPTION 'A duração do agendamento excede o limite permitido.';
  END IF;

  IF char_length(btrim(NEW.service_snapshot_name)) > 200 THEN
    RAISE EXCEPTION 'Descrição do serviço muito longa.';
  END IF;

  IF NEW.notes IS NOT NULL AND char_length(btrim(NEW.notes)) > 500 THEN
    RAISE EXCEPTION 'Observações muito longas (máx 500 caracteres).';
  END IF;

  -- Máximo de 8 agendamentos confirmados por telefone em 24h (janela deslizante).
  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE client_phone = NEW.client_phone
    AND status = 'confirmed'
    AND created_at > now() - interval '24 hours';
  IF recent >= 8 THEN
    RAISE EXCEPTION 'Muitos agendamentos criados por este telefone. Tente novamente mais tarde.';
  END IF;

  -- Máximo de 3 agendamentos confirmados por telefone no mesmo profissional em 60 min.
  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE client_phone = NEW.client_phone
    AND professional_id = NEW.professional_id
    AND status = 'confirmed'
    AND created_at > now() - interval '60 minutes';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'Você já reservou um horário recentemente com este profissional. Escolha outro horário.';
  END IF;

  -- Máximo de 5 agendamentos futuros confirmados por telefone e profissional.
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

-- Reagendamento também respeita o horizonte (o atacante não estende a duração
-- aqui, mas pode mover o horário para muito à frente).
CREATE OR REPLACE FUNCTION public.client_reschedule_appointment(
  _id UUID,
  _contact TEXT,
  _starts_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  row public.agendamentos%ROWTYPE;
  new_ends TIMESTAMPTZ;
BEGIN
  IF contact_norm = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'reschedule', 10, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  IF position('@' IN contact_norm) > 0 THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN FALSE;
    END IF;
    SELECT * INTO row
    FROM public.agendamentos a
    WHERE a.id = _id
      AND a.status = 'confirmed'
      AND lower(a.client_email) = lower(contact_norm);
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
    SELECT * INTO row
    FROM public.agendamentos a
    WHERE a.id = _id
      AND a.status = 'confirmed'
      AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm;
  END IF;

  IF row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _starts_at <= now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Só é possível reagendar até 24 horas antes do horário marcado.';
  END IF;

  IF _starts_at > now() + interval '120 days' THEN
    RAISE EXCEPTION 'Não é possível reagendar com tanta antecedência.';
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

-- ************************************************************
-- 3) log_auth_event endurecido (mantém anon: login_failed roda sem sessão)
-- ************************************************************
CREATE OR REPLACE FUNCTION public.log_auth_event(p_kind TEXT, p_contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed TEXT[] := ARRAY[
    'login_failed', 'signup_failed', 'login_success', 'signup_success',
    'mfa_failed', 'mfa_success', 'password_changed', 'password_expired',
    'logout', 'booking_cancelled', 'admin_action'
  ];
  contact_norm TEXT;
BEGIN
  IF NOT (p_kind = ANY (allowed)) THEN
    RETURN FALSE;
  END IF;

  contact_norm := btrim(p_contact);
  IF contact_norm = '' OR char_length(contact_norm) > 254 THEN
    RETURN FALSE;
  END IF;

  -- Contato precisa ter formato de e-mail ou telefone BR — bloqueia strings
  -- arbitrárias que poluiriam a auditoria.
  IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     AND contact_norm !~ '^[0-9]{10,13}$' THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.auth_event_log WHERE created_at < now() - interval '90 days';

  -- Rate limit mais apertado: 8 por kind+contato em 5 minutos.
  IF (SELECT COUNT(*) FROM public.auth_event_log
      WHERE kind = p_kind AND contact = contact_norm
        AND created_at > now() - interval '5 minutes') >= 8 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.auth_event_log (kind, contact) VALUES (p_kind, contact_norm);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ) TO anon, authenticated;

COMMIT;
