/**
 * Rate limiting por IP no Worker (Cloudflare). Janela deslizante em memória.
 *
 * Importante: o deploy é Cloudflare Workers, então este limiter roda por
 * isolate. Para um limite distribuído (por usuário/IP de verdade, incluindo o
 * login que vai direto ao Supabase em `/auth/v1/token`), configure regras de
 * "Rate limiting" no dashboard do Cloudflare. Este módulo protege o SSR e as
 * rotas que passam pelo Worker.
 */

type Bucket = { count: number; windowStart: number };

const store = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitOptions = {
  /** Chave da política (ex.: "global", "auth"). */
  scope?: string;
  limit: number;
  windowMs: number;
};

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function pruneIfNeeded(now: number) {
  if (store.size < MAX_BUCKETS) return;
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart >= 60_000) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  { limit, windowMs }: Omit<RateLimitOptions, "scope">,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  pruneIfNeeded(now);
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: windowMs - (now - bucket.windowStart) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function rateLimitRequest(
  request: Request,
  { scope = "global", ...rest }: RateLimitOptions,
): { ok: boolean; retryAfterMs: number } {
  return rateLimit(`${clientIp(request)}:${scope}`, rest);
}

/** Limites padrão — generosos para não quebrar carregamento de página. */
export const GLOBAL_LIMIT = { scope: "global", limit: 600, windowMs: 60_000 } as const;

export function buildTooManyResponse(retryAfterMs: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly." }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(Math.ceil(retryAfterMs / 1000)),
    },
  });
}
