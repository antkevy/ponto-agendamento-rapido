/**
 * Converte uma signed URL do Supabase Storage em uma URL de render otimizada
 * (/storage/v1/render/image/public/...), com resize, qualidade e conversão
 * automática para webp (via cache de CDN). Requer que o bucket seja público
 * (migração 20260806100000_make_brand_assets_public.sql).
 *
 * Retorna a URL original quando não é uma signed URL do Supabase, para que
 * URLs já públicas ou externas continuem funcionando sem alteração.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  width = 400,
  quality = 75,
): string | null {
  if (!url) return null;
  const withoutQuery = url.split("?")[0];
  const marker = "/storage/v1/object/sign/";
  const idx = withoutQuery.indexOf(marker);
  if (idx === -1) return url;
  const renderBase = withoutQuery.replace(marker, "/storage/v1/render/image/public/");
  return `${renderBase}?width=${width}&quality=${quality}`;
}
