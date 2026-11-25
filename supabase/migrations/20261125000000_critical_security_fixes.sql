-- =====================================================================
-- Agendaí — Correções críticas da auditoria de 25/11/2026
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- 1) session_is_compliant(): exige MFA (AAL2) e senha válida (<= 90 dias)
--    no servidor, não apenas na UI de login.
-- 2) Policies RESTRICTIVE nas tabelas de negócio para sessões autenticadas
--    (o acesso anon do booking público continua intacto).
-- 3) lookup_client_appointments: um código só abre agendamentos do mesmo
--    negócio em que foi emitido (anti-cascata cross-tenant).
-- 4) auto_link_client: não sobrescreve nome/e-mail de cliente existente e
--    compara telefones normalizados.
-- 5) brand-assets: valida MIME e tamanho no INSERT e no UPDATE.
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Helper de conformidade da sessão
-- ************************************************************
CREATE OR REPLACE FUNCTION public.session_is_compliant()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Se a tabela de segurança não existe (migração não aplicada), falha fechada.
  IF to_regclass('public.user_security') IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_security s
    WHERE s.user_id = auth.uid()
      AND s.password_changed_at >= now() - interval '90 days'
      AND (
        NOT s.mfa_enabled
        OR coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.session_is_compliant() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_is_compliant() TO authenticated;

-- ************************************************************
-- 2) Gate server-side nas tabelas de dados do painel
--    (RESTRICTIVE = soma AND com as policies existentes)
-- ************************************************************
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profissionais', 'servicos', 'planos', 'produtos', 'funcionarios',
    'horarios', 'bloqueios', 'servicos_funcionario',
    'disponibilidade_funcionario', 'bloqueios_funcionario',
    'agendamentos', 'clientes',
    'saas_plans', 'saas_subscriptions', 'saas_payments', 'stripe_accounts',
    'plano_servicos', 'customer_subscriptions', 'subscription_periods',
    'subscription_usage', 'payment_transactions'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'session_compliant_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.session_is_compliant()) WITH CHECK (public.session_is_compliant());',
      'session_compliant_' || t, t
    );
  END LOOP;
END;
$$;

-- RPC que devolve colunas privadas do profissional também precisa respeitar o gate.
CREATE OR REPLACE FUNCTION public.get_my_professional()
RETURNS SETOF public.profissionais
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.profissionais
  WHERE user_id = auth.uid()
    AND public.session_is_compliant()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_my_professional() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_professional() TO authenticated;

-- ************************************************************
-- 3) lookup_client_appointments: escopo por negócio do código
-- ************************************************************
-- Remove assinaturas legadas (sem código) que poderiam ser escolhidas pelo PostgREST.
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT);
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.lookup_client_appointments(
  _contact TEXT,
  _code TEXT
)
RETURNS TABLE(
  id UUID,
  professional_id UUID,
  employee_id UUID,
  professional_business_name TEXT,
  professional_slug TEXT,
  professional_timezone TEXT,
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
  code_norm TEXT := nullif(regexp_replace(coalesce(_code, ''), '\D', '', 'g'), '');
  is_email BOOLEAN;
  target_professional UUID;
BEGIN
  IF contact_norm = '' OR code_norm IS NULL OR length(code_norm) <> 6 THEN
    RETURN;
  END IF;
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

  -- O código precisa pertencer a UM agendamento deste contato. A partir dele,
  -- descobrimos o negócio e só devolvemos agendamentos desse mesmo negócio.
  SELECT a.professional_id INTO target_professional
  FROM public.agendamentos a
  WHERE a.access_code = code_norm
    AND (
      (is_email AND lower(a.client_email) = contact_norm)
      OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
    )
  LIMIT 1;

  IF target_professional IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.id, a.professional_id, a.employee_id, p.business_name, p.slug, p.timezone,
           a.service_snapshot_name, a.starts_at, a.ends_at,
           (EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 60)::int,
           a.status, a.client_name
    FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.professional_id
    WHERE a.professional_id = target_professional
      AND (
        (is_email AND lower(a.client_email) = contact_norm)
        OR (NOT is_email AND regexp_replace(a.client_phone, '\D', '', 'g') = contact_norm)
      )
    ORDER BY a.starts_at DESC
    LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.lookup_client_appointments(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT, TEXT) TO anon, authenticated;

-- ************************************************************
-- 4) auto_link_client: nunca sobrescreve dados de cliente existente
-- ************************************************************
CREATE OR REPLACE FUNCTION public.auto_link_client()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cid UUID;
  phone_norm TEXT := regexp_replace(coalesce(NEW.client_phone, ''), '\D', '', 'g');
BEGIN
  SELECT id INTO cid
  FROM public.clientes
  WHERE professional_id = NEW.professional_id
    AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = phone_norm
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.clientes (professional_id, name, phone, email)
    VALUES (NEW.professional_id, NEW.client_name, NEW.client_phone, NEW.client_email)
    RETURNING id INTO cid;
  ELSE
    -- Um agendamento anônimo não pode renomear/trocar o e-mail de um cliente.
    UPDATE public.clientes
    SET email = CASE
                  WHEN (email IS NULL OR btrim(email) = '') THEN NEW.client_email
                  ELSE email
                END,
        updated_at = now()
    WHERE id = cid;
  END IF;

  NEW.client_id := cid;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_link_client() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_auto_link_client ON public.agendamentos;
CREATE TRIGGER trg_auto_link_client
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_client();

-- ************************************************************
-- 5) Storage: validação obrigatória de tipo e tamanho (INSERT/UPDATE)
-- ************************************************************
DROP POLICY IF EXISTS "brand-assets owner insert" ON storage.objects;
CREATE POLICY "brand-assets owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND coalesce(metadata->>'contentType', metadata->>'mimetype') IN ('image/png', 'image/jpeg', 'image/webp')
    AND (metadata->>'size')::bigint BETWEEN 1 AND 3145728
  );

DROP POLICY IF EXISTS "brand-assets owner update" ON storage.objects;
CREATE POLICY "brand-assets owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND coalesce(metadata->>'contentType', metadata->>'mimetype') IN ('image/png', 'image/jpeg', 'image/webp')
    AND (metadata->>'size')::bigint BETWEEN 1 AND 3145728
  );

-- ************************************************************
-- 6) login_failed: log anônimo com contato hasherizado
--    log_auth_event() foi restringido a authenticated, então tentativas de
--    login com senha errada não eram registradas. Esta RPC aceita anon,
--    armazena apenas um hash do contato e tem limite próprio.
-- ************************************************************
CREATE OR REPLACE FUNCTION public.log_login_failed(p_contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT := lower(btrim(coalesce(p_contact, '')));
  fingerprint TEXT;
BEGIN
  IF contact_norm = '' OR length(contact_norm) > 254 THEN
    RETURN FALSE;
  END IF;
  IF contact_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN FALSE;
  END IF;

  -- md5 é built-in (sem depender da extensão pgcrypto); usado apenas como
  -- impressão digital para correlação/limite, nunca como senha.
  fingerprint := 'md5:' || md5(contact_norm);

  DELETE FROM public.auth_event_log WHERE created_at < now() - interval '90 days';

  IF (SELECT count(*) FROM public.auth_event_log
      WHERE kind = 'login_failed' AND contact = fingerprint
        AND created_at > now() - interval '5 minutes') >= 20 THEN
    RETURN FALSE;
  END IF;
  IF (SELECT count(*) FROM public.auth_event_log
      WHERE kind = 'login_failed' AND created_at > now() - interval '5 minutes') >= 500 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.auth_event_log (kind, contact) VALUES ('login_failed', fingerprint);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.log_login_failed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_login_failed(TEXT) TO anon, authenticated;

-- ************************************************************
-- 7) Rate limit no booking anônimo (por contato), no banco
-- ************************************************************
CREATE OR REPLACE FUNCTION public.rate_limit_public_booking()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  contact_norm TEXT;
BEGIN
  -- Só booking anônimo: sessões autenticadas (painel) não são limitadas.
  IF auth.uid() IS NOT NULL THEN
    RETURN NEW;
  END IF;

  contact_norm := lower(regexp_replace(coalesce(NEW.client_phone, ''), '\D', '', 'g'));
  IF contact_norm = '' THEN
    contact_norm := 'md5:' || md5(lower(btrim(coalesce(NEW.client_email, ''))));
  END IF;
  IF NOT public.check_contact_rate_limit(contact_norm, 'book', 10, interval '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas de agendamento. Tente novamente em alguns minutos.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_public_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rate_limit_public_booking ON public.agendamentos;
CREATE TRIGGER trg_rate_limit_public_booking
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_public_booking();

-- ************************************************************
-- 8) Vínculo usuário ↔ negócio (escopo de tenant para a gestão de equipe)
-- ************************************************************
CREATE TABLE IF NOT EXISTS public.team_members (
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Seed: donos existentes passam a ser membros do próprio negócio.
INSERT INTO public.team_members (professional_id, user_id)
SELECT id, user_id FROM public.profissionais WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "team_members read scoped" ON public.team_members;
CREATE POLICY "team_members read scoped" ON public.team_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members mine
    WHERE mine.user_id = auth.uid() AND mine.professional_id = team_members.professional_id
  )
);

-- Novos negócios também precisam do vínculo (o seed cobre só os existentes).
CREATE OR REPLACE FUNCTION public.sync_team_member_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.team_members (professional_id, user_id)
    VALUES (NEW.id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_team_member_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_team_member_owner ON public.profissionais;
CREATE TRIGGER trg_sync_team_member_owner
  AFTER INSERT OR UPDATE OF user_id ON public.profissionais
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_owner();

-- ************************************************************
-- 9) Código de acesso de 6 dígitos com entropy criptográfica
-- ************************************************************
-- gen_random_uuid() (built-in no PG13+) fornece 122 bits aleatórios;
-- derivar os dígitos dele evita o random() previsível da versão antiga.
CREATE OR REPLACE FUNCTION public.generate_access_code()
RETURNS TEXT
LANGUAGE sql VOLATILE SET search_path = public
AS $$
  SELECT lpad(
    (
      ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint
      % 1000000
    )::text,
    6,
    '0'
  );
$$;
REVOKE ALL ON FUNCTION public.generate_access_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_appointment_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.access_code IS NULL OR NEW.access_code !~ '^[0-9]{6}$' THEN
      NEW.access_code := public.generate_access_code();
    END IF;
  ELSIF OLD.access_code IS NULL OR OLD.access_code !~ '^[0-9]{6}$' THEN
    NEW.access_code := public.generate_access_code();
  ELSE
    NEW.access_code := OLD.access_code;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_appointment_access_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_client_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.access_code IS NULL OR NEW.access_code !~ '^[0-9]{6}$' THEN
    NEW.access_code := public.generate_access_code();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_client_access_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_access_code ON public.clientes;
CREATE TRIGGER trg_client_access_code
  BEFORE INSERT OR UPDATE OF access_code ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_access_code();

-- ************************************************************
-- 10) Listagem/alteração de papéis restrita à equipe do próprio negócio
-- ************************************************************
CREATE OR REPLACE FUNCTION public.list_team_members()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  role TEXT,
  mfa_enabled BOOLEAN,
  password_changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem listar usuários.';
  END IF;

  RETURN QUERY
  SELECT s.user_id, u.email, s.role, s.mfa_enabled, s.password_changed_at
  FROM public.user_security s
  JOIN auth.users u ON u.id = s.user_id
  WHERE EXISTS (
    SELECT 1 FROM public.team_members mine
    JOIN public.team_members other
      ON other.professional_id = mine.professional_id
    WHERE mine.user_id = auth.uid() AND other.user_id = s.user_id
  )
  ORDER BY u.email;
END;
$$;
REVOKE ALL ON FUNCTION public.list_team_members() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_members() TO authenticated;

-- Substitui a versão antiga de set_user_role (escopo 1:1 que impedia qualquer
-- alteração) por uma versão que cobre apenas membros do mesmo negócio.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' OR p_user_id = auth.uid() THEN
    RETURN FALSE;
  END IF;
  IF p_role NOT IN ('admin', 'editor', 'user') THEN
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members mine
    JOIN public.team_members target
      ON target.professional_id = mine.professional_id
    WHERE mine.user_id = auth.uid() AND target.user_id = p_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_security
  SET role = p_role, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

COMMIT;
