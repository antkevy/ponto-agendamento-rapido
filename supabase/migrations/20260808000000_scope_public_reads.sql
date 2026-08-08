-- =====================================================================
-- Agendaí — Páginas públicas por token (is_public + page_token)
-- Aplicar no Supabase SQL Editor (idempotente).
--
-- Problema: leitura pública escopada só por `is_public` ainda deixa o
-- catálogo do SaaS enumerável — a flag não é segredo. Um anon pode varrer
-- /p/{slug} e descobrir todos os profissionais cadastrados.
--
-- Correção:
--  1) profissionais ganha `page_token` (segredo, 24 hex) além de `is_public`.
--  2) Acesso público passa a ser:  is_public = true  OU  token do header
--     `x-page-token` confere (via postgrest `request.headers`). Com
--     is_public = false a página vira "link secreto": o slug sozinho não
--     retorna nada — só abre quem tem o token na URL.
--  3) Novos tenants nascem privados (default is_public = false); os já
--     existentes mantêm is_public = true (páginas vivas não quebram).
--  4) Booking e RPCs de horários exigem a mesma condição (defesa em
--     profundidade — página fechada é fechada de ponta a ponta), com a
--     exceção do próprio dono (auth.uid() = user_id).
--  5) Grant de page_token ao anon é seguro: a RLS filtra a ROW inteira antes
--     da visibilidade de coluna — uma linha cujo token não confere nunca
--     chega ao SELECT.
--
-- Aplicação: Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

-- ************************************************************
-- 1) Colunas em profissionais
-- ************************************************************
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS page_token TEXT;

-- Backfill do token para rows existentes.
UPDATE public.profissionais
SET page_token = encode(gen_random_bytes(12), 'hex')
WHERE page_token IS NULL OR page_token = '';

-- Novos tenants nascem privados (o dono publica em Configurações).
ALTER TABLE public.profissionais
  ALTER COLUMN is_public SET DEFAULT false;

ALTER TABLE public.profissionais
  ALTER COLUMN page_token SET NOT NULL,
  ALTER COLUMN page_token SET DEFAULT encode(gen_random_bytes(12), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS idx_profissionais_page_token
  ON public.profissionais (page_token);

CREATE INDEX IF NOT EXISTS idx_profissionais_is_public
  ON public.profissionais (is_public);

-- ************************************************************
-- 2) Helper: token da requisição (header `x-page-token`)
--    Lê a GUC `request.headers` que o PostgREST seta a cada request.
-- ************************************************************
CREATE OR REPLACE FUNCTION public.request_page_token()
RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    COALESCE(current_setting('request.headers', true), '{}')::jsonb ->> 'x-page-token',
    ''
  )
$$;

GRANT EXECUTE ON FUNCTION public.request_page_token() TO anon, authenticated;

-- ************************************************************
-- 3) Colunas mínimas para anon avaliar as policies (flags de visibilidade)
--    (bloqueios/bloqueios_funcionario são regrantados só com colunas públicas)
-- ************************************************************
GRANT SELECT (is_public, page_token) ON public.profissionais TO anon;
GRANT SELECT (is_active) ON public.servicos TO anon;
GRANT SELECT (is_active) ON public.funcionarios TO anon;
GRANT SELECT (is_active) ON public.planos TO anon;
GRANT SELECT (is_active) ON public.produtos TO anon;

-- ************************************************************
-- 4) Policies públicas escopadas (TO public: anon + autenticado).
--    Acesso = p.is_public OR token confere com o header.
-- ************************************************************

-- 4.1 Profissionais
DROP POLICY IF EXISTS "public read profissionais" ON public.profissionais;
CREATE POLICY "public read profissionais" ON public.profissionais
  FOR SELECT TO public
  USING (is_public OR page_token = public.request_page_token());

-- 4.2 Servicos (só serviços ativos de profissionais acessíveis)
DROP POLICY IF EXISTS "public read servicos" ON public.servicos;
CREATE POLICY "public read servicos" ON public.servicos
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = servicos.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.3 Horarios
DROP POLICY IF EXISTS "public read horarios" ON public.horarios;
CREATE POLICY "public read horarios" ON public.horarios
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = horarios.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.4 Bloqueios (escopo + sem `reason`)
DROP POLICY IF EXISTS "public read bloqueios" ON public.bloqueios;
CREATE POLICY "public read bloqueios" ON public.bloqueios
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = bloqueios.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.5 Funcionarios
DROP POLICY IF EXISTS "public read funcionarios" ON public.funcionarios;
CREATE POLICY "public read funcionarios" ON public.funcionarios
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = funcionarios.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.6 Servicos Funcionario
DROP POLICY IF EXISTS "public read servicos_funcionario" ON public.servicos_funcionario;
CREATE POLICY "public read servicos_funcionario" ON public.servicos_funcionario
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.funcionarios e
      JOIN public.profissionais p ON p.id = e.professional_id
      WHERE e.id = servicos_funcionario.employee_id
        AND e.is_active
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.7 Disponibilidade Funcionario
DROP POLICY IF EXISTS "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario;
CREATE POLICY "public read disponibilidade_funcionario" ON public.disponibilidade_funcionario
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.funcionarios e
      JOIN public.profissionais p ON p.id = e.professional_id
      WHERE e.id = disponibilidade_funcionario.employee_id
        AND e.is_active
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.8 Bloqueios Funcionario (escopo + sem `reason`)
DROP POLICY IF EXISTS "public read bloqueios_funcionario" ON public.bloqueios_funcionario;
CREATE POLICY "public read bloqueios_funcionario" ON public.bloqueios_funcionario
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.funcionarios e
      JOIN public.profissionais p ON p.id = e.professional_id
      WHERE e.id = bloqueios_funcionario.employee_id
        AND e.is_active
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.9 Planos
DROP POLICY IF EXISTS "public read planos" ON public.planos;
CREATE POLICY "public read planos" ON public.planos
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = planos.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- 4.10 Produtos
DROP POLICY IF EXISTS "public read produtos" ON public.produtos;
CREATE POLICY "public read produtos" ON public.produtos
  FOR SELECT TO public
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = produtos.professional_id
        AND (p.is_public OR p.page_token = public.request_page_token())
    )
  );

-- ************************************************************
-- 5) Dono sempre lê a própria row de profissionais
--    (is_public = false não pode trancar o dono fora do painel).
--    Nas demais tabelas o dono já é coberto pelas policies owner-manage.
-- ************************************************************
DROP POLICY IF EXISTS "owner read profissional" ON public.profissionais;
CREATE POLICY "owner read profissional" ON public.profissionais
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ************************************************************
-- 6) Booking público exige a mesma condição — página fechada não aceita
--    booking anônimo. O dono (auth.uid()) pode agendar walk-in no painel
--    mesmo com a página privada.
-- ************************************************************
DROP POLICY IF EXISTS "public create agendamentos" ON public.agendamentos;
CREATE POLICY "public create agendamentos" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    starts_at > now()
    AND ends_at > starts_at
    AND ends_at - starts_at <= interval '24 hours'
    AND starts_at <= now() + interval '120 days'
    AND status = 'confirmed'
    AND btrim(client_name) <> ''
    AND char_length(btrim(client_name)) BETWEEN 2 AND 200
    AND regexp_replace(btrim(client_phone), '\D', '', 'g') ~ '^[0-9]{10,11}$'
    AND (client_email IS NULL OR client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    AND char_length(btrim(service_snapshot_name)) <= 200
    AND (agendamentos.notes IS NULL OR char_length(btrim(agendamentos.notes)) <= 500)
    AND EXISTS (
      SELECT 1 FROM public.servicos s
      JOIN public.profissionais p ON p.id = s.professional_id
      WHERE s.id = agendamentos.service_id
        AND s.professional_id = agendamentos.professional_id
        AND s.is_active
        AND (
          p.is_public
          OR p.page_token = public.request_page_token()
          OR p.user_id = auth.uid()
        )
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

-- ************************************************************
-- 7) RPCs de horários: SECURITY DEFINER (bypassam RLS) — aplicar a mesma
--    condição na função. O dono sempre pode consultar os próprios slots.
-- ************************************************************
CREATE OR REPLACE FUNCTION public.get_busy_slots(
  _professional_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE(starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.starts_at, a.ends_at FROM public.agendamentos a
  WHERE a.professional_id = _professional_id
    AND a.status = 'confirmed'
    AND a.starts_at < _to
    AND a.ends_at > _from
    AND EXISTS (
      SELECT 1 FROM public.profissionais p
      WHERE p.id = _professional_id
        AND (
          p.is_public
          OR p.page_token = public.request_page_token()
          OR p.user_id = auth.uid()
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_employee_busy_slots(
  _employee_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE(starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.starts_at, a.ends_at FROM public.agendamentos a
  WHERE a.employee_id = _employee_id
    AND a.status = 'confirmed'
    AND a.starts_at < _to
    AND a.ends_at > _from
    AND EXISTS (
      SELECT 1 FROM public.funcionarios e
      JOIN public.profissionais p ON p.id = e.professional_id
      WHERE e.id = _employee_id
        AND (
          p.is_public
          OR p.page_token = public.request_page_token()
          OR p.user_id = auth.uid()
        )
    );
$$;

-- ************************************************************
-- 8) Colunas públicas para anon nos bloqueios (some `reason`/metadados).
--    Dono autenticado mantém SELECT total (grants anteriores).
-- ************************************************************
REVOKE SELECT ON public.bloqueios FROM anon;
GRANT SELECT (
  id, professional_id, starts_at, ends_at
) ON public.bloqueios TO anon;

REVOKE SELECT ON public.bloqueios_funcionario FROM anon;
GRANT SELECT (
  id, employee_id, starts_at, ends_at
) ON public.bloqueios_funcionario TO anon;

-- ************************************************************
-- 9) Índices de apoio para as subqueries EXISTS
-- ************************************************************
CREATE INDEX IF NOT EXISTS idx_funcionarios_profissional_ativo
  ON public.funcionarios (professional_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_servicos_profissional_ativo
  ON public.servicos (professional_id) WHERE is_active;

COMMIT;
