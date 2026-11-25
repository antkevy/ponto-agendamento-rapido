DROP POLICY IF EXISTS "public read produtos" ON public.produtos;
CREATE POLICY "public read produtos" ON public.produtos FOR SELECT USING (is_active);

DROP POLICY IF EXISTS "public read servicos" ON public.servicos;
CREATE POLICY "public read servicos" ON public.servicos FOR SELECT USING (is_active);

DROP POLICY IF EXISTS "public read funcionarios" ON public.funcionarios;
CREATE POLICY "public read funcionarios" ON public.funcionarios FOR SELECT USING (is_active);

DROP POLICY IF EXISTS "public read servicos_funcionario" ON public.servicos_funcionario;
CREATE POLICY "public read servicos_funcionario" ON public.servicos_funcionario FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.funcionarios e WHERE e.id = employee_id AND e.is_active)
  AND EXISTS (SELECT 1 FROM public.servicos s WHERE s.id = service_id AND s.is_active));

DROP POLICY IF EXISTS "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario;
CREATE POLICY "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.funcionarios e WHERE e.id = employee_id AND e.is_active));

DROP POLICY IF EXISTS "public read bloqueios_funcionario" ON public.bloqueios_funcionario;
CREATE POLICY "public read bloqueios_funcionario" ON public.bloqueios_funcionario FOR SELECT USING (
  ends_at > now() AND EXISTS (SELECT 1 FROM public.funcionarios e WHERE e.id = employee_id AND e.is_active));

DROP POLICY IF EXISTS "public read bloqueios" ON public.bloqueios;
CREATE POLICY "public read bloqueios" ON public.bloqueios FOR SELECT USING (ends_at > now());

DROP POLICY IF EXISTS "public read horarios" ON public.horarios;
CREATE POLICY "public read horarios" ON public.horarios FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = professional_id AND p.slug IS NOT NULL AND btrim(p.slug) <> ''));

DROP POLICY IF EXISTS "public read profissionais" ON public.profissionais;
CREATE POLICY "public read profissionais" ON public.profissionais FOR SELECT USING (slug IS NOT NULL AND btrim(slug) <> '');
DROP POLICY IF EXISTS "owner read profissional" ON public.profissionais;
CREATE POLICY "owner read profissional" ON public.profissionais FOR SELECT TO authenticated USING (auth.uid() = user_id);