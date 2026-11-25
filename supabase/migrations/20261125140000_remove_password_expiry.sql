-- =====================================================================
-- Agendaí — Remove a expiração de senha por prazo (25/11/2026)
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- Motivo: NIST SP 800-63B-4 determina que senhas NÃO devem ser trocadas
-- periodicamente, apenas quando há suspeita de comprometimento.
-- `password_changed_at` continua sendo registrado para auditoria.
-- O gate de MFA (AAL2) da sessão permanece intacto.
-- =====================================================================

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
      AND (
        NOT s.mfa_enabled
        OR coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.session_is_compliant() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_is_compliant() TO authenticated;

-- Conferência (opcional): o resultado deve conter "aal" e NÃO conter
-- "password_changed_at" no corpo da função.
-- SELECT prosrc FROM pg_proc WHERE oid = 'public.session_is_compliant()'::regprocedure;
