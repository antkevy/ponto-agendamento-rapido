-- Adiciona itens_snapshot em agendamentos para registrar produtos selecionados
-- e o plano escolhido ("assinar plano" = intenção, sem gateway de pagamento).
--
-- Formato: JSONB array com entradas { tipo: 'produto' | 'plano', id, nome, preco_cents }.
-- Padrão é um array vazio, então registros existentes não quebram.
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS itens_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.agendamentos.itens_snapshot IS
  'Itens extras do agendamento: produtos selecionados e plano assinado (intenção). Array de {tipo,id,nome,preco_cents}.';
