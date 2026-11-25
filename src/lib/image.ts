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

/** Extrai o caminho do arquivo no bucket a partir de uma URL (assinada ou pública). */
export function storagePathFromUrl(url: string | null | undefined, bucket = "brand-assets") {
  if (!url) return null;
  const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = url.match(new RegExp(`/storage/v1/object/(?:sign|public)/${escapedBucket}/([^?]+)`));
  if (!m?.[1]) return null;

  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return null;
  }

  // Só aceita o formato gerado pelo app: <user-id>/<pasta>/<arquivo>.
  // Isso bloqueia caminhos relativos/encodedados que tentem sair da pasta do dono.
  const parts = path.split("/");
  if (parts.length < 3 || parts.some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[0])) {
    return null;
  }
  return path;
}
