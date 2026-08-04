-- Restringe a leitura pública (anon) da tabela profissionais às colunas
-- realmente usadas pela página pública de agendamento (/p/:slug).
--
-- Contexto: a migração 20260729220000 (rename pt) fez REVOKE ALL e depois
-- GRANT SELECT sem lista de colunas, o que removeu a restrição por coluna
-- aplicada em 20260728052909. Com isso, anon voltou a ler TODAS as colunas,
-- incluindo owner_name, user_id e os templates de mensagem (msg_confirmed,
-- msg_cancelled), que só o painel (authenticated) precisa.
--
-- phone, address, lat/lng são intencionalmente públicos (a página de booking
-- exibe WhatsApp, endereço e mapa). Não existe coluna email nesta tabela.

-- 1) Revoga o SELECT total e reaplica por colunas públicas
REVOKE SELECT ON public.profissionais FROM anon;

GRANT SELECT (
  id, slug, business_name, logo_url, brand_color, description,
  address, phone, lat, lng, timezone
) ON public.profissionais TO anon;

-- 2) Remove a policy duplicada e órfã (nome em inglês) deixada pela migração
--    de rename. A policy atual "public read profissionais" (USING true)
--    permanece — agora a coluna é a barreira de acesso.
DROP POLICY IF EXISTS "public read professionals" ON public.profissionais;

-- 3) O frontend público (p.$slug.tsx) deve selecionar apenas as colunas acima;
--    já foi ajustado para não usar select("*").
