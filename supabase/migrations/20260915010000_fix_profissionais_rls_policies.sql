-- =====================================================================
-- Agendaí — Fix: "permission denied for table profissionais"
-- =====================================================================
--
-- Causa raiz:
--   20260915000000_security_hardening.sql revogou o SELECT (tabela inteira)
--   de public.profissionais para o papel authenticated e re-concedeu apenas
--   uma allowlist de colunas públicas (SEM user_id), correto para anti
--   cross-tenant PII.
--
--   Porém as policies RLS "owner *" de agendamentos, servicos, horarios,
--   bloqueios, funcionarios, servicos_funcionario, disponibilidade_funcionario,
--   bloqueios_funcionario, clientes, planos e produtos fazem subquery direta:
--
--     EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = X.professional_id
--             AND p.user_id = auth.uid())
--
--   No contexto do usuário autenticado (o chamador), essa subquery precisa de
--   SELECT na coluna user_id de profissionais — que deixou de ser concedida.
--   Resultado: qualquer SELECT/INSERT/UPDATE/DELETE owner (ex.: agendar) passa
--   a estourar "permission denied for table profissionais".
--
-- Correção:
--   A checagem de propriedade (ownership) passa a sair DO contexto da RLS e a
--   rodar dentro de helpers SECURITY DEFINER (executam como owner do schema).
--   Assim o authenticated não precisa de privilégio em user_id/colunas
--   privadas de profissionais e o cross-tenant continua bloqueado.
--
-- Idempotente. Aplicar no Supabase SQL Editor.
-- =====================================================================

BEGIN;

-- ************************************************************
-- Helpers SECURITY DEFINER (visíveis apenas a authenticated)
-- ************************************************************
CREATE OR REPLACE FUNCTION public.is_owner_of_professional(_professional_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profissionais p
    WHERE p.id = _professional_id
      AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_owner_of_professional(UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_of_professional(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_owner_of_employee(_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = _employee_id
      AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_owner_of_employee(UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_of_employee(UUID) TO authenticated;

-- ************************************************************
-- agendamentos
-- ************************************************************
DROP POLICY IF EXISTS "owner read agendamentos" ON public.agendamentos;
CREATE POLICY "owner read agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (public.is_owner_of_professional(agendamentos.professional_id));

DROP POLICY IF EXISTS "owner update agendamentos" ON public.agendamentos;
CREATE POLICY "owner update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (public.is_owner_of_professional(agendamentos.professional_id))
  WITH CHECK (public.is_owner_of_professional(agendamentos.professional_id));

DROP POLICY IF EXISTS "owner delete agendamentos" ON public.agendamentos;
CREATE POLICY "owner delete agendamentos" ON public.agendamentos
  FOR DELETE TO authenticated
  USING (public.is_owner_of_professional(agendamentos.professional_id));

-- ************************************************************
-- servicos / horarios / bloqueios
-- ************************************************************
DROP POLICY IF EXISTS "owner manage servicos" ON public.servicos;
CREATE POLICY "owner manage servicos" ON public.servicos
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(servicos.professional_id))
  WITH CHECK (public.is_owner_of_professional(servicos.professional_id));

DROP POLICY IF EXISTS "owner manage horarios" ON public.horarios;
CREATE POLICY "owner manage horarios" ON public.horarios
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(horarios.professional_id))
  WITH CHECK (public.is_owner_of_professional(horarios.professional_id));

DROP POLICY IF EXISTS "owner manage bloqueios" ON public.bloqueios;
CREATE POLICY "owner manage bloqueios" ON public.bloqueios
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(bloqueios.professional_id))
  WITH CHECK (public.is_owner_of_professional(bloqueios.professional_id));

-- ************************************************************
-- funcionarios
-- ************************************************************
DROP POLICY IF EXISTS "owner manage funcionarios" ON public.funcionarios;
CREATE POLICY "owner manage funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(funcionarios.professional_id))
  WITH CHECK (public.is_owner_of_professional(funcionarios.professional_id));

-- ************************************************************
-- servicos_funcionario / disponibilidade_funcionario / bloqueios_funcionario
-- ************************************************************
DROP POLICY IF EXISTS "owner manage servicos_funcionario" ON public.servicos_funcionario;
CREATE POLICY "owner manage servicos_funcionario" ON public.servicos_funcionario
  FOR ALL TO authenticated
  USING (public.is_owner_of_employee(servicos_funcionario.employee_id))
  WITH CHECK (public.is_owner_of_employee(servicos_funcionario.employee_id));

DROP POLICY IF EXISTS "owner manage disponibilidade_funcionario" ON public.disponibilidade_funcionario;
CREATE POLICY "owner manage disponibilidade_funcionario" ON public.disponibilidade_funcionario
  FOR ALL TO authenticated
  USING (public.is_owner_of_employee(disponibilidade_funcionario.employee_id))
  WITH CHECK (public.is_owner_of_employee(disponibilidade_funcionario.employee_id));

DROP POLICY IF EXISTS "owner manage bloqueios_funcionario" ON public.bloqueios_funcionario;
CREATE POLICY "owner manage bloqueios_funcionario" ON public.bloqueios_funcionario
  FOR ALL TO authenticated
  USING (public.is_owner_of_employee(bloqueios_funcionario.employee_id))
  WITH CHECK (public.is_owner_of_employee(bloqueios_funcionario.employee_id));

-- ************************************************************
-- clientes / planos / produtos
-- ************************************************************
DROP POLICY IF EXISTS "owner manage clientes" ON public.clientes;
CREATE POLICY "owner manage clientes" ON public.clientes
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(clientes.professional_id))
  WITH CHECK (public.is_owner_of_professional(clientes.professional_id));

DROP POLICY IF EXISTS "owner manage planos" ON public.planos;
CREATE POLICY "owner manage planos" ON public.planos
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(planos.professional_id))
  WITH CHECK (public.is_owner_of_professional(planos.professional_id));

DROP POLICY IF EXISTS "owner manage produtos" ON public.produtos;
CREATE POLICY "owner manage produtos" ON public.produtos
  FOR ALL TO authenticated
  USING (public.is_owner_of_professional(produtos.professional_id))
  WITH CHECK (public.is_owner_of_professional(produtos.professional_id));

COMMIT;