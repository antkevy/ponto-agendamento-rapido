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

-- 3.1 Professionals
CREATE TABLE IF NOT EXISTS public.professionals (
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

-- 3.2 Services
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Availability (weekly schedule)
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- 3.4 Blocks (vacations / time-off)
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- 3.5 Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
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

-- 3.6 Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7 Employee <-> Services (many-to-many)
CREATE TABLE IF NOT EXISTS public.employee_services (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, service_id)
);

-- 3.8 Employee availability
CREATE TABLE IF NOT EXISTS public.employee_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time > start_time),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.9 Employee blocks
CREATE TABLE IF NOT EXISTS public.employee_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ********** 4. ÍNDICES ********** --
CREATE INDEX IF NOT EXISTS idx_professionals_slug ON public.professionals(slug);
CREATE INDEX IF NOT EXISTS idx_services_professional ON public.services(professional_id);
CREATE INDEX IF NOT EXISTS idx_availability_professional ON public.availability(professional_id);
CREATE INDEX IF NOT EXISTS idx_blocks_professional_starts ON public.blocks(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_starts ON public.appointments(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client_phone ON public.appointments(client_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_client_email ON public.appointments(client_email);
CREATE INDEX IF NOT EXISTS idx_employees_professional ON public.employees(professional_id);
CREATE INDEX IF NOT EXISTS idx_employee_services_service ON public.employee_services(service_id);
CREATE INDEX IF NOT EXISTS idx_employee_availability_employee ON public.employee_availability(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_blocks_employee ON public.employee_blocks(employee_id);
CREATE INDEX IF NOT EXISTS idx_appointments_employee ON public.appointments(employee_id);

-- Exclusion constraint: prevent overlapping confirmed appointments
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS no_overlap_confirmed;
ALTER TABLE public.appointments
  ADD CONSTRAINT no_overlap_confirmed
  EXCLUDE USING gist (
    (COALESCE(employee_id, professional_id)) WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- ********** 5. TRIGGERS (updated_at) ********** --
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_pros_updated ON public.professionals;
CREATE TRIGGER trg_pros_updated BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_services_updated ON public.services;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_appts_updated ON public.appointments;
CREATE TRIGGER trg_appts_updated BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employees_updated ON public.employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
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
  SELECT starts_at, ends_at FROM public.appointments
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
  SELECT starts_at, ends_at FROM public.appointments
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
  FROM public.appointments a
  JOIN public.professionals p ON p.id = a.professional_id
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
  UPDATE public.appointments
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
GRANT SELECT                           ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.professionals TO authenticated;
GRANT ALL                              ON public.professionals TO service_role;

GRANT SELECT                           ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.services TO authenticated;
GRANT ALL                              ON public.services TO service_role;

GRANT SELECT                           ON public.availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.availability TO authenticated;
GRANT ALL                              ON public.availability TO service_role;

GRANT SELECT                           ON public.blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.blocks TO authenticated;
GRANT ALL                              ON public.blocks TO service_role;

GRANT SELECT, INSERT                   ON public.appointments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.appointments TO authenticated;
GRANT ALL                              ON public.appointments TO service_role;

GRANT SELECT                           ON public.employees TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.employees TO authenticated;
GRANT ALL                              ON public.employees TO service_role;

GRANT SELECT                           ON public.employee_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.employee_services TO authenticated;
GRANT ALL                              ON public.employee_services TO service_role;

GRANT SELECT                           ON public.employee_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.employee_availability TO authenticated;
GRANT ALL                              ON public.employee_availability TO service_role;

GRANT SELECT                           ON public.employee_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.employee_blocks TO authenticated;
GRANT ALL                              ON public.employee_blocks TO service_role;

-- RPCs
GRANT EXECUTE ON FUNCTION public.get_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_busy_slots(UUID, TIMESTAMPTZ, TIMESTAMPTZ)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_client_appointments(TEXT)                               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_appointment(UUID, TEXT)                          TO anon, authenticated;

-- ********** 8. ROW LEVEL SECURITY (RLS) ********** --

-- 8.1 Professionals
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read professionals" ON public.professionals;
CREATE POLICY "public read professionals" ON public.professionals
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner insert professional" ON public.professionals;
CREATE POLICY "owner insert professional" ON public.professionals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner update professional" ON public.professionals;
CREATE POLICY "owner update professional" ON public.professionals
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner delete professional" ON public.professionals;
CREATE POLICY "owner delete professional" ON public.professionals
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 8.2 Services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read services" ON public.services;
CREATE POLICY "public read services" ON public.services
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage services" ON public.services;
CREATE POLICY "owner manage services" ON public.services
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = services.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = services.professional_id AND p.user_id = auth.uid()));

-- 8.3 Availability
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read availability" ON public.availability;
CREATE POLICY "public read availability" ON public.availability
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage availability" ON public.availability;
CREATE POLICY "owner manage availability" ON public.availability
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = availability.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = availability.professional_id AND p.user_id = auth.uid()));

-- 8.4 Blocks
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read blocks" ON public.blocks;
CREATE POLICY "public read blocks" ON public.blocks
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner manage blocks" ON public.blocks;
CREATE POLICY "owner manage blocks" ON public.blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = blocks.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = blocks.professional_id AND p.user_id = auth.uid()));

-- 8.5 Appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public create appointments" ON public.appointments;
CREATE POLICY "public create appointments" ON public.appointments
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND status = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = appointments.service_id
        AND s.professional_id = appointments.professional_id
        AND s.is_active
    )
    AND (
      appointments.employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = appointments.employee_id
          AND e.professional_id = appointments.professional_id
          AND e.is_active
      )
    )
  );
DROP POLICY IF EXISTS "owner read appointments" ON public.appointments;
CREATE POLICY "owner read appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner update appointments" ON public.appointments;
CREATE POLICY "owner update appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "owner delete appointments" ON public.appointments;
CREATE POLICY "owner delete appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = appointments.professional_id AND p.user_id = auth.uid()));

-- 8.6 Employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read employees" ON public.employees;
CREATE POLICY "public read employees" ON public.employees
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage employees" ON public.employees;
CREATE POLICY "owner manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = employees.professional_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = employees.professional_id AND p.user_id = auth.uid()));

-- 8.7 Employee Services
ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read employee_services" ON public.employee_services;
CREATE POLICY "public read employee_services" ON public.employee_services
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage employee_services" ON public.employee_services;
CREATE POLICY "owner manage employee_services" ON public.employee_services
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_services.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_services.employee_id AND p.user_id = auth.uid()
  ));

-- 8.8 Employee Availability
ALTER TABLE public.employee_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read employee_availability" ON public.employee_availability;
CREATE POLICY "public read employee_availability" ON public.employee_availability
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage employee_availability" ON public.employee_availability;
CREATE POLICY "owner manage employee_availability" ON public.employee_availability
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_availability.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_availability.employee_id AND p.user_id = auth.uid()
  ));

-- 8.9 Employee Blocks
ALTER TABLE public.employee_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read employee_blocks" ON public.employee_blocks;
CREATE POLICY "public read employee_blocks" ON public.employee_blocks
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "owner manage employee_blocks" ON public.employee_blocks;
CREATE POLICY "owner manage employee_blocks" ON public.employee_blocks
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_blocks.employee_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.professionals p ON p.id = e.professional_id
    WHERE e.id = employee_blocks.employee_id AND p.user_id = auth.uid()
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
