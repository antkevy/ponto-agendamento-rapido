-- =====================================================================
-- Agendaí — Núcleo de segurança (RBAC + MFA + rotação de senha)
-- Aplicar no Supabase SQL Editor (idempotente).
-- 1) user_security: role (admin/editor/user), password_changed_at, mfa_enabled
-- 2) Triggers em auth.users sincronizam cadastro e mudança de senha
-- 3) RPCs de self-service (mfa/rotação) sem permitir escalada de privilégio
-- 4) Role-gate por trigger nos CRUDs do catálogo (admin/editor)
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Tabela user_security
-- ************************************************************
CREATE TABLE IF NOT EXISTS public.user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'editor', 'user')),
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_security select own" ON public.user_security;
CREATE POLICY "user_security select own" ON public.user_security
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Nenhum UPDATE/DELETE direto: só via RPC (impede escalada de role).
-- SELECT é permitido para authenticated (o próprio registro via policy acima).
REVOKE ALL ON public.user_security FROM anon, authenticated;
GRANT SELECT ON public.user_security TO authenticated;

-- ************************************************************
-- 2) Triggers em auth.users (novo usuário / troca de senha)
-- ************************************************************
CREATE OR REPLACE FUNCTION public.handle_new_user_security()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_security (user_id, role, password_changed_at)
  VALUES (NEW.id, 'admin', now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_security_created ON auth.users;
CREATE TRIGGER on_auth_user_security_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_security();

CREATE OR REPLACE FUNCTION public.handle_auth_user_password_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.user_security
    SET password_changed_at = now(), updated_at = now()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_password_updated ON auth.users;
CREATE TRIGGER on_auth_user_password_updated
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_password_change();

-- ************************************************************
-- 3) Helpers de role + RPCs de self-service
-- ************************************************************
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_security WHERE user_id = auth.uid()),
    'user'
  );
$$;
REVOKE ALL ON FUNCTION public.current_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_user_role() = p_role;
$$;
REVOKE ALL ON FUNCTION public.has_role(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated;

-- Só o próprio usuário atualiza o próprio mfa_enabled (nunca a role).
CREATE OR REPLACE FUNCTION public.set_mfa_enabled(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_security
  SET mfa_enabled = COALESCE(p_enabled, false), updated_at = now()
  WHERE user_id = auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_mfa_enabled(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_mfa_enabled(BOOLEAN) TO authenticated;

-- Marca a troca de senha feita pelo app (a senha em si é definida via
-- supabase.auth.updateUser; este RPC só registra o instante para expiração).
CREATE OR REPLACE FUNCTION public.touch_password_change()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_security
  SET password_changed_at = now(), updated_at = now()
  WHERE user_id = auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_password_change() FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_password_change() TO authenticated;

-- Admin define/ajusta a role de OUTRO usuário (não pode mexer na própria).
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
  UPDATE public.user_security
  SET role = p_role, updated_at = now()
  WHERE user_id = p_user_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- ************************************************************
-- 4) Role-gate dos CRUDs do catálogo (só admin/editor escrevem;
--    somente admin exclui). agendamentos fica fora (booking público).
-- ************************************************************
CREATE OR REPLACE FUNCTION public.require_editor_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'Permissão negada: esta ação exige perfil de editor ou administrador.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem executar esta ação.';
  END IF;
  RETURN NEW;
END;
$$;

-- Catálogo: escrever (insert/update) exige admin|editor
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'servicos', 'planos', 'produtos', 'funcionarios',
    'horarios', 'bloqueios', 'servicos_funcionario',
    'disponibilidade_funcionario', 'bloqueios_funcionario'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_rbac_write_%I ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_rbac_write_%I BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.require_editor_role();', t, t
    );
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_rbac_delete_%I ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_rbac_delete_%I BEFORE DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.require_admin_role();', t, t
    );
  END LOOP;
END;
$$;

-- ************************************************************
-- 5) Log de auditoria de auth: mais eventos (login/mfa/senha)
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
BEGIN
  IF NOT (p_kind = ANY (allowed)) THEN
    RETURN FALSE;
  END IF;
  IF p_contact IS NULL OR btrim(p_contact) = '' THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.auth_event_log WHERE created_at < now() - interval '90 days';

  IF (SELECT COUNT(*) FROM public.auth_event_log
      WHERE kind = p_kind AND contact = btrim(p_contact)
        AND created_at > now() - interval '5 minutes') >= 20 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.auth_event_log (kind, contact) VALUES (p_kind, btrim(p_contact));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_event(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, TEXT) TO anon, authenticated;

COMMIT;
