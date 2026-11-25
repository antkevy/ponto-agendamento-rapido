-- =====================================================================
-- Agendaí — Correções dos achados do Security Advisor (25/11/2026)
-- SUPERSEDADA pela migração 20261125130000_security_advisor_fixes_v2.sql.
-- Esta versão falha em projetos onde plano_servicos/saas_plans não existem.
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- 1) Catálogos: leitura pública só do que está ativo e pertence a um
--    estabelecimento com página pública (slug). Antes era USING (true).
-- 2) brand-assets: remove a policy de SELECT aberta a todos. O bucket é
--    público, então URLs diretas continuam funcionando; a listagem via API
--    fica restrita ao dono da pasta.
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Tabelas que "deixavam todo mundo passar"
-- ************************************************************

DROP POLICY IF EXISTS "public read planos" ON public.planos;
CREATE POLICY "public read planos" ON public.planos
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = planos.professional_id
        AND p.slug IS NOT NULL
        AND btrim(p.slug) <> ''
    )
  );

DROP POLICY IF EXISTS "public read produtos" ON public.produtos;
CREATE POLICY "public read produtos" ON public.produtos
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = produtos.professional_id
        AND p.slug IS NOT NULL
        AND btrim(p.slug) <> ''
    )
  );

DROP POLICY IF EXISTS "public read plano_servicos" ON public.plano_servicos;
CREATE POLICY "public read plano_servicos" ON public.plano_servicos
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.planos pl
      JOIN public.profissionais p ON p.id = pl.professional_id
      WHERE pl.id = plano_servicos.plan_id
        AND pl.is_active
        AND p.slug IS NOT NULL
        AND btrim(p.slug) <> ''
    )
    AND EXISTS (
      SELECT 1 FROM public.servicos s
      WHERE s.id = plano_servicos.servico_id AND s.is_active
    )
  );

-- Catálogo da plataforma: não é exibido ao visitante público; somente
-- usuários autenticados precisam consultá-lo.
DROP POLICY IF EXISTS "public read saas_plans" ON public.saas_plans;
CREATE POLICY "authenticated read saas_plans" ON public.saas_plans
  FOR SELECT TO authenticated
  USING (is_active);
REVOKE SELECT ON public.saas_plans FROM anon;

-- ************************************************************
-- 2) Storage: URLs públicas continuam; listagem só para o dono
-- ************************************************************

DROP POLICY IF EXISTS "brand-assets public read" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets owner read" ON storage.objects;
CREATE POLICY "brand-assets owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

COMMIT;

-- Validação rápida (somente leitura): cole depois, se quiser conferir.
-- SELECT tablename, policyname, cmd, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('planos','produtos','plano_servicos','saas_plans')
-- ORDER BY tablename, policyname;
