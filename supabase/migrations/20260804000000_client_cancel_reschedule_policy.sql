-- Política de cancelamento/reagendamento do cliente (até 24h antes).
--
-- O site diz "Você poderá cancelar ou reagendar até 24 horas antes do horário
-- marcado". Até agora isso não era aplicado no banco. Esta migração:
--   1) client_cancel_appointment: só cancela se faltar > 24h (mensagem clara caso contrário).
--   2) client_reschedule_appointment (novo): valida contato, política de 24h e
--      conflito de horário (a exclusion constraint no_conflito_agendamentos
--      impede sobreposição entre agendamentos confirmados do mesmo profissional).
--   3) lookup_client_appointments: passa a expor employee_id e duration_minutes
--      para o fluxo de reagendamento saber quais horários oferecer.

-- ========== 1) Cancelamento com política de 24h ==========
CREATE OR REPLACE FUNCTION public.client_cancel_appointment(_id UUID, _contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  target_id UUID;
  target_starts TIMESTAMPTZ;
BEGIN
  IF contact_norm = '' THEN
    RETURN FALSE;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'cancel', 5, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  END IF;

  IF position('@' IN contact_norm) > 0 THEN
    IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RETURN FALSE;
    END IF;
    SELECT a.id, a.starts_at INTO target_id, target_starts
    FROM public.agendamentos a
    WHERE a.id = _id
      AND a.status = 'confirmed'
      AND lower(a.client_email) = lower(contact_norm);
  ELSE
    IF contact_norm !~ '^[0-9]{10,11}$' THEN
      RETURN FALSE;
    END IF;
    SELECT a.id, a.starts_at INTO target_id, target_starts
    FROM public.agendamentos a
    WHERE a.id = _id
      AND a.status = 'confirmed'
      AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm;
  END IF;

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

-- ========== 2) Reagendamento do cliente ==========
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

-- ========== 3) Lookup expõe employee_id e duração (para reagendamento) ==========
-- O tipo de retorno mudou (novas colunas), então o PostgreSQL exige DROP antes.
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT);
CREATE OR REPLACE FUNCTION public.lookup_client_appointments(_contact TEXT)
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
      SELECT a.id, a.professional_id, a.employee_id, p.business_name, p.slug,
             a.service_snapshot_name, a.starts_at, a.ends_at,
             (EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 60)::int, a.status, a.client_name
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
      SELECT a.id, a.professional_id, a.employee_id, p.business_name, p.slug,
             a.service_snapshot_name, a.starts_at, a.ends_at,
             (EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 60)::int, a.status, a.client_name
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.professional_id
      WHERE regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm
      ORDER BY a.starts_at DESC
      LIMIT 100;
  END IF;
END;
$$;

-- ========== 4) Grants ==========
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ) TO anon, authenticated;
