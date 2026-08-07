/**
 * Logs de acesso e auditoria → Logtail (Better Stack).
 *
 * Ativa definindo `LOGTAIL_SOURCE_TOKEN` como secret no Cloudflare Workers.
 * Sem token, as funções viram no-op (custo zero). Campos sensíveis (e-mail,
 * telefone, contato) são cifrados com AES-256-GCM quando
 * `APP_DATA_ENCRYPTION_KEY` está configurada; caso contrário, são mascarados.
 */

import { encryptString, hashSecret } from "./crypto";

const LOGTAIL_ENDPOINT = "https://in.logs.betterstack.com";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function auditEnabled(): boolean {
  return Boolean(env("LOGTAIL_SOURCE_TOKEN"));
}

const SENSITIVE_KEYS = new Set(["email", "contact", "phone", "name", "token", "password"]);

async function maskSensitive(meta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value !== "string" || value === "") {
      out[key] = value;
      continue;
    }
    if (SENSITIVE_KEYS.has(key)) {
      const enc = await encryptString(value);
      out[key] = enc ?? "[redacted]";
    } else if (key.startsWith("h_")) {
      // Prefixo "h_" = já anonimizado com hash.
      out[key] = await hashSecret(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export type AuditLevel = "info" | "warn" | "error";

/**
 * Envia um evento de auditoria. Fire-and-forget: nunca lança.
 * Retorna o request para `ctx.waitUntil` quando disponível.
 */
export function auditLog(
  event: string,
  level: AuditLevel = "info",
  meta: Record<string, unknown> = {},
): Promise<void> {
  const token = env("LOGTAIL_SOURCE_TOKEN");
  if (!token) return Promise.resolve();

  return (async () => {
    try {
      const line = {
        dt: new Date().toISOString(),
        level,
        event,
        ...(await maskSensitive(meta)),
      };
      await fetch(LOGTAIL_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify([line]),
        keepalive: true,
      });
    } catch {
      // Auditoria nunca derruba o request.
    }
  })();
}

/** Log de acesso: um registro por request (status, IP, duração). */
export function accessLog(
  request: Request,
  response: Response,
  { durationMs, ip }: { durationMs: number; ip: string },
): Promise<void> {
  const token = env("LOGTAIL_SOURCE_TOKEN");
  if (!token) return Promise.resolve();
  return auditLog("http.access", response.status >= 500 ? "error" : "info", {
    method: request.method,
    path: new URL(request.url).pathname,
    status: response.status,
    ip,
    duration_ms: Math.round(durationMs),
  });
}

/** Registra um login bem-sucedido ou falha (em conjunto com o banco). */
export function auditAuth(
  kind: "login_success" | "login_failed" | "signup_success",
  email: string,
) {
  void auditLog(`auth.${kind}`, kind === "login_failed" ? "warn" : "info", {
    email,
    source: "web",
  });
}
