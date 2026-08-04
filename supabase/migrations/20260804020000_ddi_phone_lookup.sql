-- Busca por telefone tolerante a DDI (+55) + correção de cast da duração.
--
-- O agendamento é salvo com o número brasileiro SEM DDI (ex.: 88921653120).
-- Quando o cliente busca com o DDI (ex.: 5588921653120) a comparação exata
-- de dígitos falhava. Esta migração normaliza o contato: remove um "55"
-- inicial quando o número tem 12-13 dígitos. Também corrige o retorno da
-- duração (numeric -> int) que impedia a função de executar.

-- ========== lookup_client_appointments ==========
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    IF contact_norm !~ '^[0-9]{10,13}$' THEN
      RETURN;
    END IF;
    IF contact_norm ~ '^55[0-9]{10,11}$' THEN
      contact_norm := substr(contact_norm, 3);
    END IF;
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

-- ========== client_cancel_appointment ==========
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
    IF contact_norm !~ '^[0-9]{10,13}$' THEN
      RETURN FALSE;
    END IF;
    IF contact_norm ~ '^55[0-9]{10,11}$' THEN
      contact_norm := substr(contact_norm, 3);
    END IF;
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

-- ========== client_reschedule_appointment ==========
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
