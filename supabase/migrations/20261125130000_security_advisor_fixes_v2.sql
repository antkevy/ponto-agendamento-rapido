-- =====================================================================
-- Agendaí — Correção dos achados do Security Advisor (versão 2)
-- Aplicar no Supabase SQL Editor. Idempotente e tolerante a tabelas
-- inexistentes (ex.: plano_servicos/saas_plans, criados apenas se a
-- migração de billing tiver sido aplicada).
--
-- O que faz:
--   1) Encontra TODAS as policies de SELECT que liberam tudo para o público
--      (anon/public) e as substitui por filtros seguros, preservando o
--      agendamento público.
--   2) Tabelas privadas (clientes, agendamentos, cobranças etc.) passam a
--      negar leitura pública.
--   3) brand-assets: remove a listagem pública; URLs diretas continuam
--      funcionando porque o bucket é público.
-- =====================================================================

DO $fix$
DECLARE
  r record;
  rel regclass;
  cond text;
  has_active boolean;
  has_prof boolean;
  has_slug boolean;
  privado text[] := ARRAY[
    'agendamentos', 'clientes', 'user_security', 'auth_event_log',
    'public_contact_attempts', 'team_members',
    'saas_subscriptions', 'saas_payments', 'stripe_accounts',
    'customer_subscriptions', 'subscription_periods', 'subscription_usage',
    'webhook_events', 'payment_transactions'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual ~ '^[( ]*true'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    ORDER BY tablename, policyname
  LOOP
    rel := to_regclass('public.' || r.tablename);
    IF rel IS NULL THEN
      RAISE NOTICE 'public.% não existe — pulando.', r.tablename;
      CONTINUE;
    END IF;

    -- Catálogo da plataforma: somente usuários autenticados.
    IF r.tablename = 'saas_plans' THEN
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
      EXECUTE 'CREATE POLICY "authenticated read saas_plans" ON public.saas_plans FOR SELECT TO authenticated USING (is_active)';
      EXECUTE 'REVOKE SELECT ON public.saas_plans FROM anon';
      RAISE NOTICE 'public.saas_plans: leitura restrita a autenticados.';
      CONTINUE;
    END IF;

    -- Tabelas com dados privados: nega leitura pública.
    IF r.tablename = ANY(privado) THEN
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (false)', 'block public read ' || r.tablename, r.tablename);
      RAISE NOTICE 'public.%: leitura pública bloqueada.', r.tablename;
      CONTINUE;
    END IF;

    SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = rel AND attname = 'is_active' AND NOT attisdropped),
           EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = rel AND attname = 'professional_id' AND NOT attisdropped),
           EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = rel AND attname = 'slug' AND NOT attisdropped)
    INTO has_active, has_prof, has_slug;

    cond := NULL;
    IF has_active THEN
      cond := 'is_active';
    END IF;

    IF has_prof THEN
      cond := coalesce(cond || ' AND ', '') ||
        'EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = ' || r.tablename ||
        '.professional_id AND p.slug IS NOT NULL AND length(btrim(p.slug)) > 0)';
    ELSIF has_slug THEN
      cond := coalesce(cond || ' AND ', '') ||
        'slug IS NOT NULL AND length(btrim(slug)) > 0';
    END IF;

    IF cond IS NULL THEN
      cond := 'false';
      RAISE NOTICE 'public.% sem filtro conhecido: leitura pública negada. Se algum recurso parar de funcionar, me avise.', r.tablename;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (%s)', 'public read ' || r.tablename, r.tablename, cond);
    RAISE NOTICE 'public.%: policy corrigida.', r.tablename;
  END LOOP;
END
$fix$;

-- storage.objects existe sempre; remove a listagem aberta do brand-assets.
DROP POLICY IF EXISTS "brand-assets public read" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets owner read" ON storage.objects;
CREATE POLICY "brand-assets owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Conferência (opcional): cole depois do Success para ver o que restou.
-- SELECT tablename, policyname, cmd, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual ~ '^[( ]*true'
-- ORDER BY tablename;
