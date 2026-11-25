-- =====================================================================
-- Agendaí — Comissão configurável por funcionário (26/11/2026)
-- Aplicar no Supabase → SQL Editor → New query → Run. Idempotente.
--
-- A porcentagem é informada pelo próprio estabelecimento (admin/editor)
-- na aba Faturamento. O app calcula o valor devido sobre a receita
-- atribuída a cada funcionário no período escolhido.
-- As policies/grants existentes de `funcionarios` já cobrem UPDATE do dono,
-- com RBAC de escrita (admin|editor) da security_core.
-- =====================================================================

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.funcionarios'::regclass
      AND conname = 'funcionarios_commission_percent_range'
  ) THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_commission_percent_range
      CHECK (commission_percent >= 0 AND commission_percent <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.funcionarios.commission_percent IS
  'Percentual de comissão do funcionário sobre a receita dos atendimentos atribuídos a ele.';

-- Conferência opcional:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'funcionarios'
--   AND column_name = 'commission_percent';
