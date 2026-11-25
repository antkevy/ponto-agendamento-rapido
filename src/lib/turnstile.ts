/**
 * Verificação server-side do Cloudflare Turnstile.
 * Chamada apenas pelo Worker (secret nunca chega ao navegador).
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = {
  ok: boolean;
  reason?: "bad_token" | "bad_hostname" | "timeout" | "unconfigured";
};

export async function verifyTurnstile(
  token: string,
  secret: string | undefined,
  expectedHost?: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!token || token.length > 4096) return { ok: false, reason: "bad_token" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { ok: false, reason: "bad_token" };

    const data = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      "error-codes"?: string[];
    };
    if (!data.success) return { ok: false, reason: "bad_token" };
    if (expectedHost && data.hostname && data.hostname !== expectedHost) {
      return { ok: false, reason: "bad_hostname" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "timeout" };
  }
}
