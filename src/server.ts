import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { accessLog, auditLog } from "./lib/audit";
import { buildTooManyResponse, clientIp, GLOBAL_LIMIT, rateLimitRequest } from "./lib/rate-limit";
import { verifyTurnstile } from "./lib/turnstile";
import { setPublicRuntimeEnv } from "./lib/runtime-env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Headers de segurança aplicados em toda resposta. O Cloudflare Workers já
 * entrega HTTPS de ponta a ponta (SSL automático); o HSTS garante que o
 * navegador só use HTTPS daqui em diante.
 */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (process.env.APP_ENABLE_CSP === "1") {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Garante que secrets vindos das bindings do Cloudflare cheguem ao processo. */
function mergeWorkerEnv(env: unknown) {
  if (typeof process === "undefined" || !env || typeof env !== "object") return;
  const bindings = env as Record<string, string | undefined>;
  for (const key of [
    "LOGTAIL_SOURCE_TOKEN",
    "APP_DATA_ENCRYPTION_KEY",
    "APP_ENABLE_CSP",
    "APP_SITE_URL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
  ]) {
    if (bindings[key] && !process.env[key]) process.env[key] = bindings[key];
  }
}

function waitUntil(ctx: unknown, promise: Promise<unknown>) {
  const c = ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  if (c && typeof c.waitUntil === "function") {
    c.waitUntil(promise.catch(() => {}));
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Endpoint interno: verifica o token do Turnstile sem expor o secret. */
async function handleTurnstileVerify(request: Request, ctx: unknown): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // Evita que outro site use nosso endpoint como oracle de verificação.
  if (origin && origin !== url.origin) return jsonResponse({ ok: false }, 403);

  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== "string") return jsonResponse({ ok: false }, 400);

    const configured = process.env.APP_SITE_URL;
    const expectedHost = configured ? new URL(configured).hostname : url.hostname;
    const result = await verifyTurnstile(
      body.token,
      process.env.TURNSTILE_SECRET_KEY,
      expectedHost,
    );
    if (!result.ok) {
      waitUntil(
        ctx,
        auditLog("captcha.failed", "warn", {
          reason: result.reason,
          path: url.pathname,
          h_ip: clientIp(request),
        }),
      );
    }
    return jsonResponse({ ok: result.ok });
  } catch {
    return jsonResponse({ ok: false }, 400);
  }
}

/**
 * Proxy da API Pwned Passwords (HIBP). Nunca recebe a senha — apenas o prefixo
 * de 5 caracteres do SHA-1 — e devolve os sufixos para comparação no cliente.
 */
async function handlePasswordCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return jsonResponse({ suffixes: [] }, 403);
  if (request.method !== "GET") return jsonResponse({ suffixes: [] }, 405);

  const prefix = (url.searchParams.get("prefix") ?? "").toUpperCase();
  if (!/^[0-9A-F]{5}$/.test(prefix)) return jsonResponse({ suffixes: [] }, 400);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "Agendai-Password-Check", "Add-Padding": "true" },
      // Cache no edge: a faixa é pública e muda pouco.
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } });

    if (!response.ok) return jsonResponse({ suffixes: [] }, 502);

    const suffixes = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.split(":")[0]?.trim().toUpperCase())
      .filter((value): value is string => Boolean(value));

    const json = jsonResponse({ suffixes });
    json.headers.set("cache-control", "public, max-age=86400");
    return json;
  } catch {
    return jsonResponse({ suffixes: [] }, 502);
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    mergeWorkerEnv(env);
    // Expose only public values to SSR and to the browser (via __root.tsx).
    setPublicRuntimeEnv({
      SUPABASE_URL: process.env.SUPABASE_URL ?? null,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? null,
      TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY ?? null,
    });
    const startedAt = performance.now();

    try {
      const url = new URL(request.url);
      const limited = rateLimitRequest(request, GLOBAL_LIMIT);
      if (!limited.ok) {
        const response = withSecurityHeaders(buildTooManyResponse(limited.retryAfterMs));
        waitUntil(
          ctx,
          auditLog("http.rate_limited", "warn", {
            path: url.pathname,
            h_ip: clientIp(request),
            retry_after_ms: limited.retryAfterMs,
          }),
        );
        return response;
      }

      // Config pública necessária no navegador. A site key do Turnstile não é
      // sensível, então pode vir de um secret do Worker quando não há .env.
      if (url.pathname === "/api/site-config") {
        return withSecurityHeaders(
          jsonResponse({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null }),
        );
      }

      // Diagnóstico sem valores: ajuda a confirmar quais configurações chegaram.
      if (url.pathname === "/api/diagnostics") {
        return withSecurityHeaders(
          jsonResponse({
            ok: true,
            build: {
              VITE_SUPABASE_URL: Boolean(import.meta.env.VITE_SUPABASE_URL),
              VITE_SUPABASE_PUBLISHABLE_KEY: Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
            },
            worker: {
              SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
              SUPABASE_PUBLISHABLE_KEY: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
              TURNSTILE_SITE_KEY: Boolean(process.env.TURNSTILE_SITE_KEY),
              TURNSTILE_SECRET_KEY: Boolean(process.env.TURNSTILE_SECRET_KEY),
              APP_SITE_URL: Boolean(process.env.APP_SITE_URL),
            },
          }),
        );
      }

      if (url.pathname === "/api/turnstile-verify") {
        if (request.method !== "POST") {
          return withSecurityHeaders(jsonResponse({ ok: false }, 405));
        }
        return withSecurityHeaders(await handleTurnstileVerify(request, ctx));
      }

      // k-anonymity: recebe só 5 chars do SHA-1 e devolve os sufixos da faixa.
      if (url.pathname === "/api/password-check") {
        return withSecurityHeaders(await handlePasswordCheck(request));
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const final = withSecurityHeaders(normalized);

      waitUntil(
        ctx,
        accessLog(request, final, {
          durationMs: performance.now() - startedAt,
          ip: clientIp(request),
        }),
      );
      return final;
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
