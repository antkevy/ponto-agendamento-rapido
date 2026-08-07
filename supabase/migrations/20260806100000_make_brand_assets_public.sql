-- =====================================================================
-- Agendaí — Torna o bucket brand-assets público
-- Aplicar no Supabase SQL Editor (idempotente).
--
-- Por que: a página pública de agendamento usa URLs do Storage. Com o
-- bucket público, dá para usar o endpoint de otimização de imagem
-- (/storage/v1/render/image/public/...?width=&quality=), que redimensiona
-- e converte para webp com cache de CDN — imagens carregam muito mais
-- rápido. Sem isso, as signed URLs de 10 anos não podem ser transformadas
-- (as opções ficam embutidas no token no momento da assinatura).
--
-- Segurança: a LEITURA já era aberta a todos via policy "brand-assets
-- public read" (as imagens são exibidas publicamente no /p/:slug). As
-- ESCRITAS continuam restritas ao dono (policy "brand-assets owner
-- insert/update/delete" exige (storage.foldername(name))[1] = auth.uid()).
-- =====================================================================

UPDATE storage.buckets
SET public = true
WHERE name = 'brand-assets';
