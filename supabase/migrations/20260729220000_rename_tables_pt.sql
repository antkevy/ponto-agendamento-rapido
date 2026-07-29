-- ============================================================
-- Renomeia todas as tabelas para português
-- Ordem: 1) Drop RPCs  2) Drop RLS policies  3) Rename tables
--        4) Recreate RPCs  5) Recreate RLS policies
-- ============================================================

-- ********** 1. DROP RPCs (functions que hardcode table names) ********** --
DROP FUNCTION IF EXISTS public.get_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_employee_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.lookup_client_appointments(TEXT);
DROP FUNCTION IF EXISTS public.client_cancel_appointment(UUID, TEXT);

-- ********** 2. DROP RLS POLICIES (referenciam outras tabelas) ********** --

-- Services
DROP POLICY IF EXISTS "public read services" ON public.services;
DROP POLICY IF EXISTS "owner manage services" ON public.services;

-- Availability
DROP POLICY IF EXISTS "public read availability" ON public.availability;
DROP POLICY IF EXISTS "owner manage availability" ON public.availability;

-- Blocks
DROP POLICY IF EXISTS "public read blocks" ON public.blocks;
DROP POLICY IF EXISTS "owner manage blocks" ON public.blocks;

-- Appointments
DROP POLICY IF EXISTS "public create appointments" ON public.appointments;
DROP POLICY IF EXISTS "owner read appointments" ON public.appointments;
DROP POLICY IF EXISTS "owner update appointments" ON public.appointments;
DROP POLICY IF EXISTS "owner delete appointments" ON public.appointments;

-- Employees
DROP POLICY IF EXISTS "public read employees" ON public.employees;
DROP POLICY IF EXISTS "owner manage employees" ON public.employees;

-- Employee Services
DROP POLICY IF EXISTS "public read employee_services" ON public.employee_services;
DROP POLICY IF EXISTS "owner manage employee_services" ON public.employee_services;

-- Employee Availability
DROP POLICY IF EXISTS "public read employee_availability" ON public.employee_availability;
DROP POLICY IF EXISTS "owner manage employee_availability" ON public.employee_availability;

-- Employee Blocks
DROP POLICY IF EXISTS "public read employee_blocks" ON public.employee_blocks;
DROP POLICY IF EXISTS "owner manage employee_blocks" ON public.employee_blocks;

-- ********** 3. RENOMEAR TABELAS ********** --
ALTER TABLE IF EXISTS public.professionals      RENAME TO profissionais;
ALTER TABLE IF EXISTS public.services           RENAME TO servicos;
ALTER TABLE IF EXISTS public.availability       RENAME TO horarios;
ALTER TABLE IF EXISTS public.blocks             RENAME TO bloqueios;
ALTER TABLE IF EXISTS public.appointments       RENAME TO agendamentos;
ALTER TABLE IF EXISTS public.employees          RENAME TO funcionarios;
ALTER TABLE IF EXISTS public.employee_services  RENAME TO servicos_funcionario;
ALTER TABLE IF EXISTS public.employee_availability RENAME TO disponibilidade_funcionario;
ALTER TABLE IF EXISTS public.employee_blocks    RENAME TO bloqueios_funcionario;

-- ********** 4. RECRIAR RPCs (com nomes novos) ********** --

-- 4.1 Get busy slots (professional-level)
CREATE OR REPLACE FUNCTION public.get_busy_slots(
  _professional_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE(starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT starts_at, ends_at FROM public.agendamentos
  WHERE professional_id = _professional_id
    AND status = 'confirmed'
    AND starts_at < _to
    AND ends_at > _from;
$$;

-- 4.2 Get busy slots (employee-level)
CREATE OR REPLACE FUNCTION public.get_employee_busy_slots(
  _employee_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE(starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT starts_at, ends_at FROM public.agendamentos
  WHERE employee_id = _employee_id
    AND status = 'confirmed'
    AND starts_at < _to
    AND ends_at > _from;
$$;

-- 4.3 Client lookup by contact
CREATE OR REPLACE FUNCTION public.lookup_client_appointments(_contact TEXT)
RETURNS TABLE(
  id UUID,
  professional_id UUID,
  professional_business_name TEXT,
  professional_slug TEXT,
  service_name TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status public.appointment_status,
  client_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.professional_id, p.business_name, p.slug, a.service_snapshot_name,
         a.starts_at, a.ends_at, a.status, a.client_name
  FROM public.agendamentos a
  JOIN public.profissionais p ON p.id = a.professional_id
  WHERE (lower(a.client_email) = lower(_contact) OR a.client_phone = _contact)
  ORDER BY a.starts_at DESC
  LIMIT 100;
$$;

-- 4.4 Client cancellation
CREATE OR REPLACE FUNCTION public.client_cancel_appointment(_id UUID, _contact TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE rows_affected INT;
BEGIN
  UPDATE public.agendamentos
  SET status = 'cancelled', updated_at = now()
  WHERE id = _id
    AND status = 'confirmed'
    AND (lower(client_email) = lower(_contact) OR client_phone = _contact);
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

-- ********** 5. RECRIAR RLS POLICIES (com nomes novos) ********** --

-- 5.1 Profissionais (apenas auto-referenciais — rename já basta, mas recriamos por clareza)
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read profissionais" ON public.profissionais;
CREATE POLICY "public read profissionais" ON public.profissionais
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner insert profissional" ON public.profissionais;
CREATE POLICY "owner insert profissional" ON public.profissionais
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner update profissional" ON public.profissionais;
CREATE POLICY "owner update profissional" ON public.profissionais
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner delete profissional" ON public.profissionais;
CREATE POLICY "owner delete profissional" ON public.profissionais
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5.2 Servicos
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read servicos" ON public.servicos;
CREATE POLICY "public read servicos" ON public.servicos
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage servicos" ON public.servicos;
CREATE POLICY "owner manage servicos" ON public.servicos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = servicos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = servicos.professional_id AND p.user_id = auth.uid()));

-- 5.3 Horarios
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read horarios" ON public.horarios;
CREATE POLICY "public read horarios" ON public.horarios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage horarios" ON public.horarios;
CREATE POLICY "owner manage horarios" ON public.horarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = horarios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = horarios.professional_id AND p.user_id = auth.uid()));

-- 5.4 Bloqueios
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read bloqueios" ON public.bloqueios;
CREATE POLICY "public read bloqueios" ON public.bloqueios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage bloqueios" ON public.bloqueios;
CREATE POLICY "owner manage bloqueios" ON public.bloqueios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = bloqueios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = bloqueios.professional_id AND p.user_id = auth.uid()));

-- 5.5 Agendamentos
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public create agendamentos" ON public.agendamentos;
CREATE POLICY "public create agendamentos" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND status = 'confirmed'
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
DROP POLICY IF EXISTS "owner read agendamentos" ON public.agendamentos;
CREATE POLICY "owner read agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = agendamentos.professional_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner update agendamentos" ON public.agendamentos;
CREATE POLICY "owner update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = agendamentos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = agendamentos.professional_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner delete agendamentos" ON public.agendamentos;
CREATE POLICY "owner delete agendamentos" ON public.agendamentos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = agendamentos.professional_id AND p.user_id = auth.uid()));

-- 5.6 Funcionarios
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read funcionarios" ON public.funcionarios;
CREATE POLICY "public read funcionarios" ON public.funcionarios
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage funcionarios" ON public.funcionarios;
CREATE POLICY "owner manage funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = funcionarios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = funcionarios.professional_id AND p.user_id = auth.uid()));

-- 5.7 Servicos Funcionario
ALTER TABLE public.servicos_funcionario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read servicos_funcionario" ON public.servicos_funcionario;
CREATE POLICY "public read servicos_funcionario" ON public.servicos_funcionario
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage servicos_funcionario" ON public.servicos_funcionario;
CREATE POLICY "owner manage servicos_funcionario" ON public.servicos_funcionario
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = servicos_funcionario.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = servicos_funcionario.employee_id AND p.user_id = auth.uid()
  ));

-- 5.8 Disponibilidade Funcionario
ALTER TABLE public.disponibilidade_funcionario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario;
CREATE POLICY "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage disponibilidade_funcionario" ON public.disponibilidade_funcionario;
CREATE POLICY "owner manage disponibilidade_funcionario" ON public.disponibilidade_funcionario
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = disponibilidade_funcionario.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = disponibilidade_funcionario.employee_id AND p.user_id = auth.uid()
  ));

-- 5.9 Bloqueios Funcionario
ALTER TABLE public.bloqueios_funcionario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read bloqueios_funcionario" ON public.bloqueios_funcionario;
CREATE POLICY "public read bloqueios_funcionario" ON public.bloqueios_funcionario
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage bloqueios_funcionario" ON public.bloqueios_funcionario;
CREATE POLICY "owner manage bloqueios_funcionario" ON public.bloqueios_funcionario
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = bloqueios_funcionario.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.funcionarios e
    JOIN public.profissionais p ON p.id = e.professional_id
    WHERE e.id = bloqueios_funcionario.employee_id AND p.user_id = auth.uid()
  ));

-- ********** 6. ATUALIZAR INDEXES (nomes para refletir novas tabelas) ********** --
ALTER INDEX IF EXISTS idx_professionals_slug               RENAME TO idx_profissionais_slug;
ALTER INDEX IF EXISTS idx_services_professional             RENAME TO idx_servicos_profissional;
ALTER INDEX IF EXISTS idx_availability_professional         RENAME TO idx_horarios_profissional;
ALTER INDEX IF EXISTS idx_blocks_professional_starts        RENAME TO idx_bloqueios_profissional_inicio;
ALTER INDEX IF EXISTS idx_appointments_professional_starts  RENAME TO idx_agendamentos_profissional_inicio;
ALTER INDEX IF EXISTS idx_appointments_client_phone         RENAME TO idx_agendamentos_cliente_telefone;
ALTER INDEX IF EXISTS idx_appointments_client_email         RENAME TO idx_agendamentos_cliente_email;
ALTER INDEX IF EXISTS idx_employees_professional            RENAME TO idx_funcionarios_profissional;
ALTER INDEX IF EXISTS idx_employee_services_service         RENAME TO idx_servicos_funcionario_servico;
ALTER INDEX IF EXISTS idx_employee_availability_employee    RENAME TO idx_disponibilidade_funcionario_funcionario;
ALTER INDEX IF EXISTS idx_employee_blocks_employee          RENAME TO idx_bloqueios_funcionario_funcionario;
ALTER INDEX IF EXISTS idx_appointments_employee             RENAME TO idx_agendamentos_funcionario;

-- ********** 7. ATUALIZAR EXCLUSION CONSTRAINT ********** --
ALTER TABLE public.agendamentos RENAME CONSTRAINT no_overlap_confirmed TO no_conflito_agendamentos;

-- ********** 8. ATUALIZAR TRIGGERS ********** --
ALTER TRIGGER trg_pros_updated ON public.profissionais       RENAME TO trg_pros_atualizado;
ALTER TRIGGER trg_services_updated ON public.servicos         RENAME TO trg_servicos_atualizado;
ALTER TRIGGER trg_appts_updated ON public.agendamentos        RENAME TO trg_agendamentos_atualizado;
ALTER TRIGGER trg_employees_updated ON public.funcionarios    RENAME TO trg_funcionarios_atualizado;

-- ********** 9. ATUALIZAR GRANT NAMES ********** --
-- (Grants são vinculados ao OID da tabela, então renomear o nome no GRANT
--  é apenas cosmético — mas faremos via REVOKE/GRANT para manter a migração limpa)

-- Revoke antigos
REVOKE ALL ON public.profissionais, public.servicos, public.horarios, public.bloqueios,
           public.agendamentos, public.funcionarios, public.servicos_funcionario,
           public.disponibilidade_funcionario, public.bloqueios_funcionario
FROM anon, authenticated, service_role;

-- Grant novos
GRANT SELECT                           ON public.profissionais TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.profissionais TO authenticated;
GRANT ALL                              ON public.profissionais TO service_role;

GRANT SELECT                           ON public.servicos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.servicos TO authenticated;
GRANT ALL                              ON public.servicos TO service_role;

GRANT SELECT                           ON public.horarios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.horarios TO authenticated;
GRANT ALL                              ON public.horarios TO service_role;

GRANT SELECT                           ON public.bloqueios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.bloqueios TO authenticated;
GRANT ALL                              ON public.bloqueios TO service_role;

GRANT SELECT, INSERT                   ON public.agendamentos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.agendamentos TO authenticated;
GRANT ALL                              ON public.agendamentos TO service_role;

GRANT SELECT                           ON public.funcionarios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.funcionarios TO authenticated;
GRANT ALL                              ON public.funcionarios TO service_role;

GRANT SELECT                           ON public.servicos_funcionario TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.servicos_funcionario TO authenticated;
GRANT ALL                              ON public.servicos_funcionario TO service_role;

GRANT SELECT                           ON public.disponibilidade_funcionario TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.disponibilidade_funcionario TO authenticated;
GRANT ALL                              ON public.disponibilidade_funcionario TO service_role;

GRANT SELECT                           ON public.bloqueios_funcionario TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.bloqueios_funcionario TO authenticated;
GRANT ALL                              ON public.bloqueios_funcionario TO service_role;

-- RPCs
GRANT EXECUTE ON FUNCTION public.get_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT)                               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT)                          TO anon, authenticated;

-- ============================================================
-- FIM — TABELAS RENOMEADAS COM SUCESSO
-- ============================================================
