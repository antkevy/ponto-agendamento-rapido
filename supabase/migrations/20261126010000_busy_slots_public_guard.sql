-- =====================================================================
-- Agendaí — Ajuste fino nas RPCs de horários ocupados (26/11/2026)
-- Aplicar no Supabase SQL Editor. Idempotente.
--
-- A migração do Lovable (20261125212445) limitou a janela a 62 dias e
-- mesclou intervalos sobrepostos. Esta completa duas lacunas:
--   1) get_employee_busy_slots também exige estabelecimento público (slug),
--      não apenas funcionário ativo.
--   2) get_busy_slots continua funcionando no painel do dono mesmo quando o
--      estabelecimento ainda não tem slug publicado.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_busy_slots(_professional_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (
    SELECT greatest(_from, now() - interval '1 day') AS f,
           least(_to, greatest(_from, now() - interval '1 day') + interval '62 days') AS t
  ), r AS (
    SELECT range_agg(tstzrange(a.starts_at, a.ends_at)) AS m
    FROM public.agendamentos a, w
    WHERE a.professional_id = _professional_id
      AND a.status = 'confirmed'
      AND a.starts_at < w.t AND a.ends_at > w.f
      AND EXISTS (
        SELECT 1 FROM public.profissionais p
        WHERE p.id = _professional_id
          AND (p.slug IS NOT NULL OR p.user_id = auth.uid())
      )
  )
  SELECT lower(x), upper(x) FROM r, unnest(r.m) x;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_busy_slots(_employee_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (
    SELECT greatest(_from, now() - interval '1 day') AS f,
           least(_to, greatest(_from, now() - interval '1 day') + interval '62 days') AS t
  ), r AS (
    SELECT range_agg(tstzrange(a.starts_at, a.ends_at)) AS m
    FROM public.agendamentos a, w
    WHERE a.employee_id = _employee_id
      AND a.status = 'confirmed'
      AND a.starts_at < w.t AND a.ends_at > w.f
      AND EXISTS (
        SELECT 1
        FROM public.funcionarios e
        JOIN public.profissionais p ON p.id = e.professional_id
        WHERE e.id = _employee_id
          AND e.is_active
          AND (p.slug IS NOT NULL OR p.user_id = auth.uid())
      )
  )
  SELECT lower(x), upper(x) FROM r, unnest(r.m) x;
$$;

-- Conferência (opcional): nenhuma das funções deve devolver PII, apenas janelas.
-- SELECT proname, prosrc FROM pg_proc
-- WHERE proname IN ('get_busy_slots', 'get_employee_busy_slots');
