/**
 * Verificação de senhas vazadas usando a API Pwned Passwords (HIBP) com
 * k-anonymity: o navegador envia só os 5 primeiros caracteres do SHA-1 e
 * compara os sufixos localmente. A senha (ou o hash completo) nunca sai do
 * dispositivo do usuário.
 *
 * `null` significa "não foi possível verificar" (rede indisponível). Nesse
 * caso o fluxo segue em frente para não travar cadastro/recuperação — a
 * política de complexidade continua valendo.
 */

async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function isLeakedPassword(password: string): Promise<boolean | null> {
  if (!password || typeof crypto === "undefined" || !crypto.subtle) return null;

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(`/api/password-check?prefix=${prefix}`, {
      cache: "force-cache",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { suffixes?: unknown };
    if (!Array.isArray(data.suffixes)) return null;

    return data.suffixes.some((item) => typeof item === "string" && item.toUpperCase() === suffix);
  } catch {
    return null;
  }
}

export const LEAKED_PASSWORD_MESSAGE =
  "Essa senha apareceu em vazamentos conhecidos. Escolha uma senha nova e única.";
