-- =====================================================================
-- Agendaí — Estrutura de billing e pagamentos
-- 2026-09-16 · Idempotente · Aplicar no Supabase SQL Editor
-- =====================================================================
--
-- Este script adiciona:
-- 1) Tabelas do SaaS (saas_plans, saas_subscriptions, saas_payments)
-- 2) Tabela Stripe Connect (stripe_accounts)
-- 3) Extensão de planos do estabelecimento (colunas + plano_servicos)
-- 4) Assinaturas de clientes finais (customer_subscriptions, periods, usage)
-- 5) Infra: webhook_events + payment_transactions
-- 6) Alterações em tabelas existentes (planos, clientes, agendamentos)
-- 7) RPCs: lookup_client_subscriptions
--
-- NÃO altera tabelas existentes de forma destrutiva.
-- Todas as operações são idempotentes (IF NOT EXISTS, IF EXISTS DROP).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. TABELAS DO SAAS (cobrança ao estabelecimento · Asaas)
-- =====================================================================

-- 1.1) saas_plans — planos da plataforma (ex: Plano Básico R$29,90/mês)
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  monthly_price_cents INT NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  annual_price_cents INT NOT NULL DEFAULT 0 CHECK (annual_price_cents >= 0),
  features JSONB NOT NULL DEFAULT '{}',
  trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saas_plans IS
  'Planos de assinatura do SaaS (estabelecimento paga para usar a plataforma).';

-- 1.2) saas_subscriptions — assinatura do estabelecimento no SaaS
CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  saas_plan_id UUID NOT NULL REFERENCES public.saas_plans(id) ON DELETE RESTRICT,
  asaas_customer_id TEXT,
  asaas_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trialing','active','past_due','canceled','expired')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saas_subscriptions IS
  'Assinatura do estabelecimento no SaaS — espelho do Asaas. Dinheiro vai para a plataforma.';

-- 1.3) saas_payments — cobranças Asaas do SaaS
CREATE TABLE IF NOT EXISTS public.saas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.saas_subscriptions(id) ON DELETE CASCADE,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','overdue','refunded','cancelled','received')),
  amount_cents INT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  billing_type TEXT,
  invoice_url TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saas_payments IS
  'Cobranças Asaas (mensalidades do SaaS). Alimentado via webhook.';

-- =====================================================================
-- 2. STRIPE CONNECT
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL UNIQUE REFERENCES public.profissionais(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (account_status IN ('onboarding','active','disabled','restricted')),
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  requirements JSONB NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ,
  last_error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_accounts IS
  'Conta Stripe Connect (Express) do estabelecimento. Recebe pagamentos dos planos vendidos.';

-- =====================================================================
-- 3. PLANOS DOS ESTABELECIMENTOS
-- =====================================================================

-- 3.1) plano_servicos — serviços + quantidades por plano
CREATE TABLE IF NOT EXISTS public.plano_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, servico_id)
);

COMMENT ON TABLE public.plano_servicos IS
  'Serviços incluídos em um plano do estabelecimento. Cada linha = 1 serviço + quantidade contratada por ciclo.';

-- =====================================================================
-- 4. ASSINATURAS DE CLIENTES FINAIS
-- =====================================================================

-- 4.1) customer_subscriptions
CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE RESTRICT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete','trialing','active','past_due','canceled','unpaid','incomplete_expired')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  usage_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(professional_id, client_id, plan_id)
);

COMMENT ON TABLE public.customer_subscriptions IS
  'Assinatura do cliente final em um plano do estabelecimento — espelho do Stripe. Dinheiro vai para a conta Connect do estabelecimento.';

-- 4.2) subscription_periods — ciclos de billing
CREATE TABLE IF NOT EXISTS public.subscription_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.customer_subscriptions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL CHECK (period_end > period_start),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  allowances JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, period_start)
);

COMMENT ON TABLE public.subscription_periods IS
  'Ciclos de billing. allowances = snapshot das quantidades contratadas no início do ciclo {servico_uuid: qtd}.';
COMMENT ON COLUMN public.subscription_periods.allowances IS
  'Contratadas do ciclo: {servico_uuid: quantidade_contratada}. Imutável; utilização é computada via subscription_usage.';

-- 4.3) subscription_usage — ledger de consumo
CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.customer_subscriptions(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.subscription_periods(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, period_id, servico_id, appointment_id)
);

COMMENT ON TABLE public.subscription_usage IS
  'Ledger de consumo: cada linha = 1 uso de serviço dentro de um ciclo. UNIQUE impede duplicidade.';

-- =====================================================================
-- 5. INFRA (webhooks + transações)
-- =====================================================================

-- 5.1) webhook_events — fila de idempotência/reprocessamento
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('asaas','stripe')),
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','processed','failed','reprocessed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

COMMENT ON TABLE public.webhook_events IS
  'Registro de eventos de webhook (Asaas/Stripe). UNIQUE(provider,event_id) garante idempotência.';

-- 5.2) payment_transactions — registro unificado de movimentações
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('asaas','stripe')),
  provider_payment_id TEXT,
  professional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  subscription_type TEXT NOT NULL CHECK (subscription_type IN ('saas','customer')),
  subscription_id UUID,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','overdue','refunded','cancelled')),
  kind TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription','single')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_transactions IS
  'Registro unificado de movimentações financeiras. Alimentado via webhooks. Relatórios leem daqui.';

-- =====================================================================
-- 6. ALTERAÇÕES EM TABELAS EXISTENTES
-- =====================================================================

-- 6.1) planos — extensão para planos recorrentes com Stripe
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS periodicity TEXT NOT NULL DEFAULT 'monthly'
    CHECK (periodicity IN ('monthly','annually','custom')),
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS requires_account BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grace_usage_days INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.planos.periodicity IS
  'Ciclo de cobrança: monthly, annually ou custom.';
COMMENT ON COLUMN public.planos.stripe_product_id IS
  'ID do produto Stripe criado na conta Connect do estabelecimento (populado via Edge Function).';
COMMENT ON COLUMN public.planos.stripe_price_id IS
  'ID do preço Stripe vinculado ao plano (populado via Edge Function).';
COMMENT ON COLUMN public.planos.requires_account IS
  'Se true, estabelecimento precisa ter conta Connect ativa para vender este plano.';
COMMENT ON COLUMN public.planos.grace_usage_days IS
  'Dias de carência após vencimento para permitir uso do plano (padrão: 0).';

-- 6.2) clientes — portal do cliente final
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS access_code TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.clientes.access_code IS
  'Código de 6 dígitos para acesso do cliente ao portal de assinaturas (gerado no primeiro subscribe).';
COMMENT ON COLUMN public.clientes.stripe_customer_id IS
  'ID do Customer Stripe na conta Connect do estabelecimento (populado na primeira assinatura).';

-- 6.3) agendamentos — referência à assinatura do cliente
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS customer_subscription_id UUID
    REFERENCES public.customer_subscriptions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agendamentos.customer_subscription_id IS
  'Referência à assinatura do cliente quando o agendamento consome serviço de plano assinado.';

-- =====================================================================
-- 7. INDEXES
-- =====================================================================

-- saas_subscriptions
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_professional
  ON public.saas_subscriptions(professional_id);

-- saas_payments
CREATE INDEX IF NOT EXISTS idx_saas_payments_subscription
  ON public.saas_payments(subscription_id);

-- plano_servicos
CREATE INDEX IF NOT EXISTS idx_plano_servicos_plan
  ON public.plano_servicos(plan_id);
CREATE INDEX IF NOT EXISTS idx_plano_servicos_servico
  ON public.plano_servicos(servico_id);

-- customer_subscriptions
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_professional
  ON public.customer_subscriptions(professional_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_client
  ON public.customer_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_plan
  ON public.customer_subscriptions(plan_id);

-- subscription_periods
CREATE INDEX IF NOT EXISTS idx_subscription_periods_subscription
  ON public.subscription_periods(subscription_id);

-- subscription_usage
CREATE INDEX IF NOT EXISTS idx_subscription_usage_subscription
  ON public.subscription_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_period
  ON public.subscription_usage(period_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_servico
  ON public.subscription_usage(servico_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_appointment
  ON public.subscription_usage(appointment_id);

-- webhook_events (parcial: só eventos pendentes/falhos)
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON public.webhook_events(status) WHERE status IN ('received','failed');

-- payment_transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_professional
  ON public.payment_transactions(professional_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_sub_type
  ON public.payment_transactions(subscription_type, subscription_id);

-- agendamentos (nova FK)
CREATE INDEX IF NOT EXISTS idx_agendamentos_customer_subscription
  ON public.agendamentos(customer_subscription_id);

-- clientes (acesso ao portal)
CREATE INDEX IF NOT EXISTS idx_clientes_access_code
  ON public.clientes(access_code) WHERE access_code IS NOT NULL;

-- =====================================================================
-- 8. RLS POLICIES
-- =====================================================================

-- 8.1) saas_plans — catálogo público (listagem de planos da plataforma)
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read saas_plans" ON public.saas_plans;
CREATE POLICY "public read saas_plans" ON public.saas_plans
  FOR SELECT TO public USING (true);

-- 8.2) saas_subscriptions — owner lê a própria assinatura SaaS
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read saas_subscriptions" ON public.saas_subscriptions;
CREATE POLICY "owner read saas_subscriptions" ON public.saas_subscriptions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id = saas_subscriptions.professional_id AND p.user_id = auth.uid()
  ));

-- 8.3) saas_payments — owner lê as próprias cobranças SaaS
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read saas_payments" ON public.saas_payments;
CREATE POLICY "owner read saas_payments" ON public.saas_payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.saas_subscriptions ss
    JOIN public.profissionais p ON p.id = ss.professional_id
    WHERE ss.id = saas_payments.subscription_id AND p.user_id = auth.uid()
  ));

-- 8.4) stripe_accounts — owner lê a própria conta Connect
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read stripe_accounts" ON public.stripe_accounts;
CREATE POLICY "owner read stripe_accounts" ON public.stripe_accounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id = stripe_accounts.professional_id AND p.user_id = auth.uid()
  ));

-- 8.5) plano_servicos — catálogo público + owner manage
ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read plano_servicos" ON public.plano_servicos;
CREATE POLICY "public read plano_servicos" ON public.plano_servicos
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "owner manage plano_servicos" ON public.plano_servicos;
CREATE POLICY "owner manage plano_servicos" ON public.plano_servicos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.planos pl
    JOIN public.profissionais p ON p.id = pl.professional_id
    WHERE pl.id = plano_servicos.plan_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.planos pl
    JOIN public.profissionais p ON p.id = pl.professional_id
    WHERE pl.id = plano_servicos.plan_id AND p.user_id = auth.uid()
  ));

-- 8.6) customer_subscriptions — owner lê assinaturas dos seus clientes
ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read customer_subscriptions" ON public.customer_subscriptions;
CREATE POLICY "owner read customer_subscriptions" ON public.customer_subscriptions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id = customer_subscriptions.professional_id AND p.user_id = auth.uid()
  ));

-- 8.7) subscription_periods — owner lê períodos dos seus clientes
ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read subscription_periods" ON public.subscription_periods;
CREATE POLICY "owner read subscription_periods" ON public.subscription_periods
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customer_subscriptions cs
    JOIN public.profissionais p ON p.id = cs.professional_id
    WHERE cs.id = subscription_periods.subscription_id AND p.user_id = auth.uid()
  ));

-- 8.8) subscription_usage — owner lê uso dos seus clientes
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read subscription_usage" ON public.subscription_usage;
CREATE POLICY "owner read subscription_usage" ON public.subscription_usage
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customer_subscriptions cs
    JOIN public.profissionais p ON p.id = cs.professional_id
    WHERE cs.id = subscription_usage.subscription_id AND p.user_id = auth.uid()
  ));

-- 8.9) webhook_events — sem policies (só service_role)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy = acesso negado para anon/authenticated.
-- Escrito lido por Edge Functions via service_role.

-- 8.10) payment_transactions — owner lê suas transações
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read payment_transactions" ON public.payment_transactions;
CREATE POLICY "owner read payment_transactions" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (professional_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id = payment_transactions.professional_id AND p.user_id = auth.uid()
  ));

-- =====================================================================
-- 9. GRANTS
-- =====================================================================

-- saas_plans (catálogo público)
GRANT SELECT ON public.saas_plans TO anon;
GRANT SELECT ON public.saas_plans TO authenticated;
GRANT ALL ON public.saas_plans TO service_role;

-- saas_subscriptions (owner read, service_role write)
GRANT SELECT ON public.saas_subscriptions TO authenticated;
GRANT ALL ON public.saas_subscriptions TO service_role;

-- saas_payments (owner read, service_role write)
GRANT SELECT ON public.saas_payments TO authenticated;
GRANT ALL ON public.saas_payments TO service_role;

-- stripe_accounts (owner read, service_role write)
GRANT SELECT ON public.stripe_accounts TO authenticated;
GRANT ALL ON public.stripe_accounts TO service_role;

-- plano_servicos (catálogo público + owner CRUD)
GRANT SELECT ON public.plano_servicos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_servicos TO authenticated;
GRANT ALL ON public.plano_servicos TO service_role;

-- customer_subscriptions (owner read, service_role write)
GRANT SELECT ON public.customer_subscriptions TO authenticated;
GRANT ALL ON public.customer_subscriptions TO service_role;

-- subscription_periods (owner read, service_role write)
GRANT SELECT ON public.subscription_periods TO authenticated;
GRANT ALL ON public.subscription_periods TO service_role;

-- subscription_usage (owner read, service_role write)
GRANT SELECT ON public.subscription_usage TO authenticated;
GRANT ALL ON public.subscription_usage TO service_role;

-- webhook_events — sem grants (só service_role via Supabase client admin)
-- (default: sem grants para anon/authenticated)

-- payment_transactions (owner read, service_role write)
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

-- =====================================================================
-- 10. TRIGGERS
-- =====================================================================

-- 10.1) RBAC para plano_servicos (espelha padrão de planos)
DROP TRIGGER IF EXISTS trg_rbac_write_plano_servicos ON public.plano_servicos;
CREATE TRIGGER trg_rbac_write_plano_servicos
  BEFORE INSERT OR UPDATE ON public.plano_servicos
  FOR EACH ROW EXECUTE FUNCTION public.require_editor_role();

DROP TRIGGER IF EXISTS trg_rbac_delete_plano_servicos ON public.plano_servicos;
CREATE TRIGGER trg_rbac_delete_plano_servicos
  BEFORE DELETE ON public.plano_servicos
  FOR EACH ROW EXECUTE FUNCTION public.require_admin_role();

-- 10.2) updated_at para tabelas novas
DROP TRIGGER IF EXISTS trg_saas_plans_atualizado ON public.saas_plans;
CREATE TRIGGER trg_saas_plans_atualizado
  BEFORE UPDATE ON public.saas_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_saas_subscriptions_atualizado ON public.saas_subscriptions;
CREATE TRIGGER trg_saas_subscriptions_atualizado
  BEFORE UPDATE ON public.saas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_stripe_accounts_atualizado ON public.stripe_accounts;
CREATE TRIGGER trg_stripe_accounts_atualizado
  BEFORE UPDATE ON public.stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_customer_subscriptions_atualizado ON public.customer_subscriptions;
CREATE TRIGGER trg_customer_subscriptions_atualizado
  BEFORE UPDATE ON public.customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 11. RPCs
-- =====================================================================

-- 11.1) lookup_client_subscriptions — acesso do cliente ao portal
-- Segue padrão de lookup_client_appointments: phone+code, rate-limited, SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.lookup_client_subscriptions(
  _contact TEXT,
  _code TEXT
)
RETURNS TABLE(
  id UUID,
  professional_id UUID,
  professional_business_name TEXT,
  professional_slug TEXT,
  plan_name TEXT,
  plan_price_cents INT,
  plan_periodicity TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  client_name TEXT
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

  IF code_norm !~ '^[0-9]{6}$' THEN
    RETURN;
  END IF;

  IF NOT public.check_contact_rate_limit('__global__', 'sub_lookup', 400, interval '15 minutes') THEN
    RETURN;
  END IF;

  IF NOT public.check_contact_rate_limit(contact_norm, 'sub_lookup', 20, interval '15 minutes') THEN
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

  -- Verifica se o código pertence ao contato
  SELECT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.access_code = code_norm
      AND (
        (is_email AND lower(c.email) = contact_norm)
        OR (NOT is_email AND regexp_replace(c.phone, '\D', '', 'g') = contact_norm)
      )
  ) INTO verified;

  IF NOT verified THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cs.id, cs.professional_id, p.business_name, p.slug,
           pl.name, pl.price_cents, pl.periodicity, cs.status,
           cs.current_period_start, cs.current_period_end,
           cs.cancel_at, c.name
    FROM public.customer_subscriptions cs
    JOIN public.profissionais p ON p.id = cs.professional_id
    JOIN public.planos pl ON pl.id = cs.plan_id
    JOIN public.clientes c ON c.id = cs.client_id
    WHERE c.access_code = code_norm
      AND (
        (is_email AND lower(c.email) = contact_norm)
        OR (NOT is_email AND regexp_replace(c.phone, '\D', '', 'g') = contact_norm)
      )
    ORDER BY cs.created_at DESC
    LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_client_subscriptions(TEXT, TEXT) TO anon, authenticated;

COMMIT;
