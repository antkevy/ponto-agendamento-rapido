-- =====================================================================
-- Agendaí — Hardening de segurança (post-audit 2026-09-15)
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- Fixes:
--  1) access_code obrigatório nos RPCs (remove bypass via DEFAULT NULL)
-- 20) Backfill de access_code para agendamentos legado
-- 10) Normalização de telefone no prevent_booking_abuse
-- 13) auto_link_client: análise confirma SECURITY DEFINER NECESSÁRIO
--     (booking público roda como anon; clientes não tem grant p/ anon)
--  2) Profissionais: restringe SELECT autenticado (anti cross-tenant PII)
--  3) set_user_role: escopo por negócio (anti cross-tenant demotion)
--  4) Role padrão 'user' no signup + promoção automática ao criar negócio
--  5) touch_password_change: revoga grant público (redundante, trigger cobre)
--  6) log_auth_event: restringe a authenticated (evita poluição anon)
--  7) storage: validação MIME/tamanho no insert de brand-assets
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Backfill + trigger: access_code com geração segura
-- ************************************************************
-- Modifica o trigger para gerar código em UPDATE quando NULL (backfill)
-- e usar pgcrypto gen_random_bytes quando disponível (melhor aleatoriedade).
CREATE OR REPLACE FUNCTION public.enforce_appointment_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.access_code IS NULL OR NEW.access_code !~ '^[0-9]{6}$' THEN
      -- Usa gen_random_bytes do pgcrypto quando disponível (mais seguro que random())
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        NEW.access_code := lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
      ELSE
        NEW.access_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
      END IF;
    END IF;
  ELSE -- UPDATE
    -- Gera código para linhas legado (NULL); preserva para as demais
    IF OLD.access_code IS NULL OR OLD.access_code !~ '^[0-9]{6}$' THEN
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        NEW.access_code := lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
      ELSE
        NEW.access_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
      END IF;
    ELSE
      NEW.access_code := OLD.access_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Garante que pgcrypto existe (gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill: gera access_code para agendamentos legado (NULL)
-- O trigger (BEFORE UPDATE) vai gerar o código automaticamente para linhas NULL.
UPDATE public.agendamentos
SET client_name = client_name
WHERE access_code IS NULL OR access_code !~ '^[0-9]{6}$';

-- ************************************************************
-- 1) lookup_client_appointments: torna _code obrigatório + restrição
-- ************************************************************
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT);
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.lookup_client_appointments(
  _contact TEXT,
  _code TEXT -- OBRIGATÓRIO — remove bypass via DEFAULT NULL
)
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
  -- access_code REMOVIDO do SELECT: evita cascade (1 código → todos)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  verified BOOLEAN := FALSE;
BEGIN
  IF contact_norm = '' OR code_norm IS NULL OR length(code_norm) <> 6 THEN
    RETURN;
  END IF;

  -- Valida formato do código (só dígitos, 6 caracteres)
  IF code_norm !~ '^[0-9]{6}$' THEN
    RETURN;
  END IF;

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

  -- Verifica se o código pertence ao contato (qualquer um dos agendamentos)
  SELECT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.access_code = code_norm
      AND (
        (is_email AND lower(a.client_email) = contact_norm)
        OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
      )
  ) INTO verified;

  IF NOT verified THEN
    RETURN;
  END IF;

  -- Retorna agendamentos do contato; NÃO retorna access_code (evita cascade)
  RETURN QUERY
    SELECT a.id, a.professional_id, a.employee_id, p.business_name, p.slug,
           a.service_snapshot_name, a.starts_at, a.ends_at,
           (EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 60)::int,
           a.status, a.client_name
    FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.professional_id
    WHERE (
        (is_email AND lower(a.client_email) = contact_norm)
        OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
      )
    ORDER BY a.starts_at DESC
    LIMIT 100;
END;
$$;

-- ************************************************************
-- 1) client_cancel_appointment: torna _code obrigatório +strict match
-- ************************************************************
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.client_cancel_appointment(
  _id UUID,
  _contact TEXT,
  _code TEXT -- OBRIGATÓRIO
)
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
  IF contact_norm = '' OR code_norm IS NULL OR length(code_norm) <> 6 THEN
    RETURN FALSE;
  END IF;
  IF code_norm !~ '^[0-9]{6}$' THEN
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
    AND a.access_code = code_norm; -- STRICT: código específico do agendamento

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

-- ************************************************************
-- 1) client_reschedule_appointment: torna _code obrigatório + strict match
-- ************************************************************
DROP FUNCTION IF EXISTS public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.client_reschedule_appointment(
  _id UUID,
  _contact TEXT,
  _starts_at TIMESTAMPTZ,
  _code TEXT -- OBRIGATÓRIO
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := btrim(_contact);
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  row public.agendamentos%ROWTYPE;
  pro_tz TEXT;
  new_ends TIMESTAMPTZ;
  local_starts TIMESTAMP;
  local_ends TIMESTAMP;
BEGIN
  IF contact_norm = '' OR code_norm IS NULL OR length(code_norm) <> 6 THEN
    RETURN FALSE;
  END IF;
  IF code_norm !~ '^[0-9]{6}$' THEN
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

  SELECT a.* INTO row
  FROM public.agendamentos a
  WHERE a.id = _id
    AND a.status = 'confirmed'
    AND (
      (is_email AND lower(a.client_email) = contact_norm)
      OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
    )
    AND a.access_code = code_norm; -- STRICT

  SELECT p.timezone INTO pro_tz
  FROM public.profissionais p
  WHERE p.id = row.professional_id;

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

  -- ************************************************************
  -- Validação de disponibilidade server-side (FIX #8):
  -- espelha a grade da página de booking para impedir reagendar
  -- para horários fechados/bloqueados/fora do expediente.
  -- ************************************************************
  pro_tz := COALESCE(NULLIF(btrim(pro_tz), ''), 'America/Sao_Paulo');
  local_starts := _starts_at AT TIME ZONE pro_tz;
  local_ends := new_ends AT TIME ZONE pro_tz;

  -- 1) Dia da semana + janela de horário do negócio
  IF NOT EXISTS (
    SELECT 1 FROM public.horarios h
    WHERE h.professional_id = row.professional_id
      AND h.weekday = EXTRACT(DOW FROM local_starts)::int
      AND h.start_time <= local_starts::time
      AND h.end_time >= local_ends::time
  ) THEN
    RAISE EXCEPTION 'Fora do horário de funcionamento. Escolha outro horário.';
  END IF;

  -- 2) Bloqueios do negócio (férias/folgas)
  IF EXISTS (
    SELECT 1 FROM public.bloqueios b
    WHERE b.professional_id = row.professional_id
      AND _starts_at < b.ends_at AND new_ends > b.starts_at
  ) THEN
    RAISE EXCEPTION 'Horário indisponível (bloqueio de agenda). Escolha outro.';
  END IF;

  -- 3) Se houver funcionário com disponibilidade própria, valida a dele
  IF row.employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.disponibilidade_funcionario d WHERE d.employee_id = row.employee_id
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.disponibilidade_funcionario d
      WHERE d.employee_id = row.employee_id
        AND d.weekday = EXTRACT(DOW FROM local_starts)::int
        AND d.start_time <= local_starts::time
        AND d.end_time >= local_ends::time
    ) THEN
      RAISE EXCEPTION 'Fora do horário deste profissional. Escolha outro horário.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.bloqueios_funcionario bf
      WHERE bf.employee_id = row.employee_id
        AND _starts_at < bf.ends_at AND new_ends > bf.starts_at
    ) THEN
      RAISE EXCEPTION 'Este profissional está bloqueado nesse período. Escolha outro horário.';
    END IF;
  END IF;

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

-- Atualiza grants (mantém anon e authenticated para fluxo de contato)
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_reschedule_appointment(UUID, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;

-- ************************************************************
-- 10) Normalização de telefone no prevent_booking_abuse
-- ************************************************************
CREATE OR REPLACE FUNCTION public.prevent_booking_abuse()
RETURNS TRIGGER AS $$
DECLARE
  recent INT;
  norm_phone TEXT;
BEGIN
  IF NEW.client_phone IS NULL OR btrim(NEW.client_phone) = '' THEN
    RAISE EXCEPTION 'Informe um telefone válido para confirmar o agendamento.';
  END IF;

  -- Normaliza: remove tudo que não é dígito
  norm_phone := regexp_replace(NEW.client_phone, '\D', '', 'g');

  IF norm_phone ~ '^55[0-9]{10,11}$' THEN
    norm_phone := substr(norm_phone, 3);
  END IF;

  IF norm_phone !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Formato de telefone inválido.';
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

  -- Usa telefone normalizado para contagens (evita bypass via formatação)
  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE regexp_replace(client_phone, '\D', '', 'g') = norm_phone
    AND status = 'confirmed'
    AND created_at > now() - interval '24 hours';
  IF recent >= 8 THEN
    RAISE EXCEPTION 'Muitos agendamentos criados por este telefone. Tente novamente mais tarde.';
  END IF;

  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE regexp_replace(client_phone, '\D', '', 'g') = norm_phone
    AND professional_id = NEW.professional_id
    AND status = 'confirmed'
    AND created_at > now() - interval '60 minutes';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'Você já reservou um horário recentemente com este profissional. Escolha outro horário.';
  END IF;

  SELECT COUNT(*) INTO recent
  FROM public.agendamentos
  WHERE regexp_replace(client_phone, '\D', '', 'g') = norm_phone
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
-- 13) auto_link_client — MANTIDO como SECURITY DEFINER (intencional)
--    REMOVIDA qualquer permissão EXTRA: função é apenas de trigger
--    (RETURNS TRIGGER), não executável diretamente por nenhum papel.
--
--    Por que NÃO usar SECURITY INVOKER aqui: o booking público
--    (p/$slug.tsx) insere em agendamentos como anon; clientes só tem
--    GRANT para authenticated/service_role. Como INVOKER, o trigger
--    rodaria como anon e o INSERT em clientes falharia → quebraria o
--    agendamento público. SECURITY DEFINER é necessário e seguro: a
--    função não pode ser invocada por usuários (apenas disparada pelo
--    próprio INSERT na tabela agendamentos) e só escreve 1 linha em
--    clientes derivada do próprio agendamento.
-- ************************************************************
CREATE OR REPLACE FUNCTION public.auto_link_client()
RETURNS TRIGGER AS $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM public.clientes
  WHERE professional_id = NEW.professional_id AND phone = NEW.client_phone
  LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.clientes (professional_id, name, phone, email)
    VALUES (NEW.professional_id, NEW.client_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO cid;
  ELSE
    UPDATE public.clientes SET name = NEW.client_name, email = COALESCE(NEW.client_email, email), updated_at = now()
    WHERE id = cid;
  END IF;
  NEW.client_id = cid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_link_client ON public.agendamentos;
CREATE TRIGGER trg_auto_link_client
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_client();

-- ************************************************************
-- 2) Profissionais: restrição de colunas para authenticated
--    (corrige cross-tenant PII disclosure)
-- ************************************************************
-- Revoga SELECT global de authenticated e reaplica com allowlist
REVOKE SELECT ON public.profissionais FROM authenticated;

-- Colunas públicas (mesmas que anon já lê + theme_colors)
GRANT SELECT (
  id, slug, business_name, logo_url, brand_color, description,
  address, phone, lat, lng, timezone, theme_colors
) ON public.profissionais TO authenticated;

-- Owner pode escrever (já existente via INSERT/UPDATE/DELETE grants)
-- mas para ler colunas privadas (owner_name, msg_confirmed, etc.)
-- usa a nova RPC get_my_professional() (SECURITY DEFINER).

-- Cria RPC para owner ler seu próprio profissional (inclui colunas privadas)
CREATE OR REPLACE FUNCTION public.get_my_professional()
RETURNS SETOF public.profissionais
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.profissionais WHERE user_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_professional() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_professional() TO authenticated;

-- ************************************************************
-- 3) set_user_role: escopo por negócio (anti cross-tenant demotion)
-- ************************************************************
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RETURN FALSE;
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN FALSE;
  END IF;
  IF p_role NOT IN ('admin', 'editor', 'user') THEN
    RETURN FALSE;
  END IF;

  -- Escopo de negócio: só pode alterar usuários do mesmo profissional.
  -- Na prática, profissionais.user_id é UNIQUE (1:1), então isto bloqueia
  -- qualquer alteração cross-tenant. Se um modelo de equipe for criado,
  -- expandir esta query para o mapeamento de usuários ↔ profissionais.
  IF NOT EXISTS (
    SELECT 1 FROM public.profissionais caller
    JOIN public.profissionais target ON target.id = caller.id
    WHERE caller.user_id = auth.uid() AND target.user_id = p_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_security
  SET role = p_role, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- ************************************************************
-- 4) Role padrão: 'user' no signup (não admin)
--    + promoção automática a 'admin' ao criar próprio profissional
-- ************************************************************
-- Altera DEFAULT da tabela (afeta inserts futuros)
ALTER TABLE public.user_security ALTER COLUMN role SET DEFAULT 'user';

-- Atualiza trigger: novo usuário começa como 'user' (não 'admin')
CREATE OR REPLACE FUNCTION public.handle_new_user_security()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_security (user_id, role, password_changed_at)
  VALUES (NEW.id, 'user', now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger: promove a 'admin' quando o usuário cria seu próprio profissional
CREATE OR REPLACE FUNCTION public.promote_professional_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_security
  SET role = 'admin', updated_at = now()
  WHERE user_id = NEW.user_id AND role = 'user';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.promote_professional_owner() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_promote_professional_owner ON public.profissionais;
CREATE TRIGGER trg_promote_professional_owner
  AFTER INSERT ON public.profissionais
  FOR EACH ROW EXECUTE FUNCTION public.promote_professional_owner();

-- ************************************************************
-- 5) touch_password_change: revoga grant público (redundante)
--    O trigger handle_auth_user_password_change já atualiza
--    password_changed_at em qualquer mudança de senha via Auth.
-- ************************************************************
REVOKE ALL ON FUNCTION public.touch_password_change() FROM anon, authenticated, PUBLIC;

-- ************************************************************
-- 6) log_auth_event: restringe a authenticated
--    login_failed roda pós-auth (com sessão). login/signup usam
--    log_auth_event diretamente do cliente com sessão ativa.
--    anon não precisa mais (a autenticação é via Supabase Auth).
--    IMPORTANTE: remover também o grant implícito via PUBLIC (default de
--    CREATE FUNCTION), senão anon continua executando por herança de PUBLIC.
-- ************************************************************
REVOKE ALL ON FUNCTION public.log_auth_event(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, TEXT) TO authenticated;

-- ************************************************************
-- 7) Storage: validação MIME/tamanho no insert
-- ************************************************************
DROP POLICY IF EXISTS "brand-assets owner insert" ON storage.objects;
CREATE POLICY "brand-assets owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    -- Validação server-side: só imagens, máximo 3MB
    AND (
      metadata->>'contentType' IS NULL
      OR metadata->>'contentType' IN ('image/png', 'image/jpeg', 'image/webp')
    )
    AND (
      metadata->>'size' IS NULL
      OR (metadata->>'size')::bigint <= 3145728
    )
  );

-- Cleanup: remove indexes duplicados do prevent_booking_abuse legado
-- (mantém o mais recente)
DROP INDEX IF EXISTS idx_agendamentos_phone_confirmado;

COMMIT;
