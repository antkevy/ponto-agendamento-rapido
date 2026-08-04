-- Log de tentativas de autenticação (item 10 da auditoria).
-- Registra tentativas de login/cadastro que falharam para consulta manual no
-- dashboard do Supabase (Table Editor -> auth_event_log). Sem alerta automático.

CREATE TABLE IF NOT EXISTS public.auth_event_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL,
  contact TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_event_log_window
  ON public.auth_event_log (kind, created_at);

CREATE INDEX IF NOT EXISTS idx_auth_event_log_contact
  ON public.auth_event_log (contact);

REVOKE ALL ON public.auth_event_log FROM anon, authenticated;
ALTER TABLE public.auth_event_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_auth_event(p_kind TEXT, p_contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_kind NOT IN ('login_failed', 'signup_failed') THEN
    RETURN FALSE;
  END IF;
  IF p_contact IS NULL OR btrim(p_contact) = '' THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.auth_event_log WHERE created_at < now() - interval '90 days';

  IF (SELECT COUNT(*) FROM public.auth_event_log
      WHERE kind = p_kind AND contact = btrim(p_contact)
        AND created_at > now() - interval '5 minutes') >= 10 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.auth_event_log (kind, contact) VALUES (p_kind, btrim(p_contact));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_event(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, TEXT) TO anon, authenticated;
