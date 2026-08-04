-- Cores do tema (Aparência → Cores do Tema) salvas no banco, para que TODOS
-- os visitantes da página pública de agendamento (/p/:slug) vejam as cores
-- escolhidas no painel. Antes, elas ficavam apenas no localStorage do dono.
--
-- Shape: { "light": {...Appearance}, "dark": {...Appearance} }
-- (ver src/lib/appearance.ts → ProfessionalTheme)

ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS theme_colors JSONB;

-- Inclui a coluna na allowlist de leitura pública (anon) criada pelo hardening
-- (20260803010000_restrict_profissionais_public_columns.sql). A policy
-- "public read profissionais" já permite SELECT de todas as linhas; a coluna
-- é a barreira.
GRANT SELECT (theme_colors) ON public.profissionais TO anon;

-- Escrita continua pela policy "owner update profissional"
-- (auth.uid() = user_id), já existente — nenhuma permissão extra necessária.
