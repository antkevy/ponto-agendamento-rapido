-- Hardening do agendamento público (página /p/:slug)
--
-- O endpoint aberto de INSERT em public.agendamentos aceita dados de cliente
-- sem validação e sem limite de uso, permitindo que qualquer pessoa crie
-- registros com dados fabricados na agenda de qualquer profissional.
--
-- Este migration aplica duas camadas de proteção no banco (a única camada
-- confiável, já que a lógica no cliente pode ser contornada):
--   1) Policy de INSERT mais rígida — valida nome/telefone/email.
--   2) Trigger de rate limit — limita inserções por telefone em janelas
--      deslizantes e limita o tamanho do backlog futuro.

-- ========== 1) Policy de INSERT mais rígida ==========
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

-- Índice para as consultas de contagem do rate limit
CREATE INDEX IF NOT EXISTS idx_agendamentos_phone_confirmado
  ON public.agendamentos (client_phone, status, created_at);

-- ========== 2) Rate limit no banco ==========
-- SECURITY DEFINER para poder consultar a tabela sem sofrer a restrição de
-- leitura da RLS (anon não enxerga linhas de terceiros, o que anularia a
-- contagem). O owner da função é o mesmo do schema (supabase_admin/postgres).
CREATE OR REPLACE FUNCTION public.prevent_booking_abuse()
RETURNS TRIGGER AS $$
DECLARE
  recent INT;
BEGIN
  -- Requisito mínimo para poder aplicar o rate limit por telefone.
  IF NEW.client_phone IS NULL OR btrim(NEW.client_phone) = '' THEN
    RAISE EXCEPTION 'Informe um telefone válido para confirmar o agendamento.';
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

  -- Máximo de 5 agendamentos futuros confirmados por telefone e profissional
  -- (limita o backlog que um mesmo número consegue acumular na agenda).
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

-- Nota: a recomendaçao de hardening adicional é mover o INSERT para um Edge
-- Function (supabase/functions) que:
--   * aplique rate limit por IP + CAPTCHA;
--   * idealmente valide o telefone com código via SMS/WhatsApp antes de criar
--     o registro, provando posse do número (identidade do solicitante).
-- Isso não é viável apenas com RLS, pois o anon não expõe IP para o Postgres.
