import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { accessLog } from "./lib/audit";
import { buildTooManyResponse, clientIp, GLOBAL_LIMIT, rateLimitRequest } from "./lib/rate-limit";

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
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    mergeWorkerEnv(env);
    const startedAt = performance.now();

    try {
      const limited = rateLimitRequest(request, GLOBAL_LIMIT);
      if (!limited.ok) return buildTooManyResponse(limited.retryAfterMs);

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
