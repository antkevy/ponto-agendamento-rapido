-- =====================================================================
-- Agendaí — Índices para escala (25/11/2026)
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- Não há BEGIN/COMMIT para permitir CREATE INDEX CONCURRENTLY em produção:
-- quando a tabela estiver grande, rode cada statement com CONCURRENTLY
-- separadamente (fora de transação) para não bloquear escritas.
-- =====================================================================

-- WeekCalendar / tela de Agendamentos: filtro por funcionário e período.
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario_inicio
  ON public.agendamentos (employee_id, starts_at);

-- Relatórios: filtro por negócio + status + período (consulta mais pesada).
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_status_inicio
  ON public.agendamentos (professional_id, status, starts_at);

-- Relação N:N de serviços por funcionário (painel do estabelecimento).
CREATE INDEX IF NOT EXISTS idx_servicos_funcionario_funcionario
  ON public.servicos_funcionario (employee_id);

-- log_login_failed() apaga registros com mais de 90 dias a cada chamada.
CREATE INDEX IF NOT EXISTS idx_auth_event_log_created_at
  ON public.auth_event_log (created_at);
