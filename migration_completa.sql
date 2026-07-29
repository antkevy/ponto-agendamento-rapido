-- ============================================================
-- MIGRAÇÃO COMPLETA — Agendaí (Lovable Cloud → Supabase Externo)
-- ============================================================
-- Execute toda esta SQL no SQL Editor do novo projeto Supabase.
-- Ordem: 1) Storage → 2) Enum → 3) Tabelas → 4) Índices
--        5) Triggers → 6) RPCs → 7) Permissões → 8) RLS
-- ============================================================

-- ********** 1. STORAGE BUCKET ********** --
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', false, 3145728, '{image/png,image/jpeg,image/webp}')
ON CONFLICT (id) DO NOTHING;

-- ********** 2. ENUM ********** --
CREATE TYPE public.appointment_status AS ENUM ('confirmed', 'cancelled', 'completed');

-- ********** 3. TABELAS ********** --

-- 3.1 Profissionais
CREATE TABLE IF NOT EXISTS public.profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  owner_name TEXT,
  logo_url TEXT,
  brand_color TEXT NOT NULL DEFAULT '#0284C7',
  description TEXT,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  msg_confirmed TEXT,
  msg_cancelled TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Servicos
CREATE TABLE IF NOT EXISTS public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Horarios (weekly schedule)
CREATE TABLE IF NOT EXISTS public.horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- 3.4 Bloqueios (vacations / time-off)
CREATE TABLE IF NOT EXISTS public.bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- 3.5 Agendamentos
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  employee_id UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  notes TEXT,
  status public.appointment_status NOT NULL DEFAULT 'confirmed',
  service_snapshot_name TEXT NOT NULL,
  service_snapshot_price_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- 3.6 Funcionarios
CREATE TABLE IF NOT EXISTS public.funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7 Funcionario <-> Servicos (many-to-many)
CREATE TABLE IF NOT EXISTS public.servicos_funcionario (
  employee_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, service_id)
);

-- 3.8 Disponibilidade Funcionario
CREATE TABLE IF NOT EXISTS public.disponibilidade_funcionario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time > start_time),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.9 Bloqueios Funcionario
CREATE TABLE IF NOT EXISTS public.bloqueios_funcionario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ********** 4. ÍNDICES ********** --
CREATE INDEX IF NOT EXISTS idx_profissionais_slug ON public.profissionais(slug);
CREATE INDEX IF NOT EXISTS idx_servicos_profissional ON public.servicos(professional_id);
CREATE INDEX IF NOT EXISTS idx_horarios_profissional ON public.horarios(professional_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_profissional_inicio ON public.bloqueios(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_inicio ON public.agendamentos(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_telefone ON public.agendamentos(client_phone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_email ON public.agendamentos(client_email);
CREATE INDEX IF NOT EXISTS idx_funcionarios_profissional ON public.funcionarios(professional_id);
CREATE INDEX IF NOT EXISTS idx_servicos_funcionario_servico ON public.servicos_funcionario(service_id);
CREATE INDEX IF NOT EXISTS idx_disponibilidade_funcionario_funcionario ON public.disponibilidade_funcionario(employee_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_funcionario_funcionario ON public.bloqueios_funcionario(employee_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario ON public.agendamentos(employee_id);

-- Exclusion constraint: prevent overlapping confirmed appointments
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS no_conflito_agendamentos;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT no_conflito_agendamentos
  EXCLUDE USING gist (
    (COALESCE(employee_id, professional_id)) WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- ********** 5. TRIGGERS (updated_at) ********** --
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_pros_atualizado ON public.profissionais;
CREATE TRIGGER trg_pros_atualizado BEFORE UPDATE ON public.profissionais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_servicos_atualizado ON public.servicos;
CREATE TRIGGER trg_servicos_atualizado BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_agendamentos_atualizado ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_atualizado BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_funcionarios_atualizado ON public.funcionarios;
CREATE TRIGGER trg_funcionarios_atualizado BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ********** 6. FUNCTIONS / RPCs ********** --

-- 6.1 Get busy slots (professional-level)
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

-- 6.2 Get busy slots (employee-level)
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

-- 6.3 Client lookup by contact
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

-- 6.4 Client cancellation
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

-- ********** 7. PERMISSÕES (GRANTS) ********** --

-- Tabelas
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

-- ********** 8. ROW LEVEL SECURITY (RLS) ********** --

-- 8.1 Profissionais
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

-- 8.2 Servicos
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read servicos" ON public.servicos;
CREATE POLICY "public read servicos" ON public.servicos
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage servicos" ON public.servicos;
CREATE POLICY "owner manage servicos" ON public.servicos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = servicos.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = servicos.professional_id AND p.user_id = auth.uid()));

-- 8.3 Horarios
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read horarios" ON public.horarios;
CREATE POLICY "public read horarios" ON public.horarios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage horarios" ON public.horarios;
CREATE POLICY "owner manage horarios" ON public.horarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = horarios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = horarios.professional_id AND p.user_id = auth.uid()));

-- 8.4 Bloqueios
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read bloqueios" ON public.bloqueios;
CREATE POLICY "public read bloqueios" ON public.bloqueios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage bloqueios" ON public.bloqueios;
CREATE POLICY "owner manage bloqueios" ON public.bloqueios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = bloqueios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = bloqueios.professional_id AND p.user_id = auth.uid()));

-- 8.5 Agendamentos
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

-- 8.6 Funcionarios
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read funcionarios" ON public.funcionarios;
CREATE POLICY "public read funcionarios" ON public.funcionarios
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage funcionarios" ON public.funcionarios;
CREATE POLICY "owner manage funcionarios" ON public.funcionarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = funcionarios.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profissionais p WHERE p.id = funcionarios.professional_id AND p.user_id = auth.uid()));

-- 8.7 Servicos Funcionario
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

-- 8.8 Disponibilidade Funcionario
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

-- 8.9 Bloqueios Funcionario
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

-- ********** 9. STORAGE POLICIES (brand-assets) ********** --
DROP POLICY IF EXISTS "brand-assets public read" ON storage.objects;
CREATE POLICY "brand-assets public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "brand-assets owner insert" ON storage.objects;
CREATE POLICY "brand-assets owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "brand-assets owner update" ON storage.objects;
CREATE POLICY "brand-assets owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "brand-assets owner delete" ON storage.objects;
CREATE POLICY "brand-assets owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- FIM — BANCO DE DADOS CRIADO COM SUCESSO
-- ============================================================

-- ============================================================
-- INSTRUÇÕES DE MIGRAÇÃO
-- ============================================================
--
-- PRÉ-REQUISITOS:
-- 1. Crie uma conta em https://supabase.com (se não tiver)
-- 2. Crie um novo projeto Supabase
-- 3. Anote a Project URL e a anon key (Settings → API)
--
-- PASSO A PASSO:
--
-- A) CRIAR O BANCO
--    1. No novo projeto, vá em SQL Editor
--    2. Cole TODO o conteúdo deste arquivo
--    3. Execute (Ctrl+Enter)
--    4. Verifique se não houve erros (role o resultado)
--
-- B) MIGRAR DADOS (opcional — se quiser manter dados existentes)
--    1. No projeto Lovable Cloud original:
--       - Cloud → Overview → Advanced settings → Export project data
--       - Faça download do arquivo .sql exportado
--    2. No novo Supabase:
--       - SQL Editor → abra o arquivo exportado
--       - Execute (pode dar conflitos de duplicatas, ignore os que
--         falharem por já existirem — o schema já foi criado no passo A)
--
-- C) CONFIGURAR AUTENTICAÇÃO
--    1. No Supabase, vá em Authentication → Settings
--    2. Em "Site URL", coloque a URL do seu app Lovable
--    3. Configure os provedores desejados (Email, Google, etc.)
--
-- D) CONECTAR O LOVABLE AO NOVO SUPABASE
--    1. No Lovable, clique em Cloud (topo da tela)
--    2. Se ainda estiver com Lovable Cloud ativo, vá em
--       Overview → Advanced settings → Remove Lovable Cloud
--    3. Após remover, clique em "Already have a Supabase project?
--       Connect it here"
--    4. Autorize e selecione o novo projeto Supabase
--    5. As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
--       serão atualizadas automaticamente
--
-- E) VERIFICAR
--    1. Faça login no app e confira se os dados aparecem
--    2. Teste o fluxo completo: criar agendamento, ver painel, etc.
--    3. Se algo falhar, confira no Supabase Table Editor se as
--       tabelas têm dados
--
-- NOTAS IMPORTANTES:
-- - Usuários (auth.users) NÃO são transferidos pelo export SQL comum.
--   Para migrar usuários com senhas, use o Export oficial do
--   Lovable Cloud (Cloud → Advanced settings → Export), que desde
--   Julho/2026 inclui hashes de senha.
-- - Imagens do Storage precisam ser baixadas e re-enviadas para o
--   novo bucket, ou migradas via script. O export SQL não inclui
--   arquivos de storage.
-- ============================================================
