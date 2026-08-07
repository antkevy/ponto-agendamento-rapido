/**
 * Criptografia de dados sensíveis (AES-256-GCM) — lado servidor apenas.
 *
 * Onde se aplica hoje: campos sensíveis dos logs de auditoria (e-mail, telefone)
 * são cifrados antes de sair do Worker. A chave é `APP_DATA_ENCRYPTION_KEY`
 * (base64 de 32 bytes, AES-256) definida como secret no Cloudflare Workers.
 *
 * Uso futuro: campo `agendamentos.notes` (texto livre) é o candidato a
 * criptografia de coluna quando houver caminho de escrita servidor.
 */

const KEY_B64 = typeof process !== "undefined" ? process.env.APP_DATA_ENCRYPTION_KEY : undefined;

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey | null> {
  if (!KEY_B64) return null;
  if (cachedKey) return cachedKey;
  try {
    const raw = Uint8Array.from(atob(KEY_B64), (c) => c.charCodeAt(0));
    if (raw.byteLength !== 32) return null;
    cachedKey = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    return cachedKey;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Cifra um texto com AES-256-GCM. Retorna `"v1:<iv b64>:<ct+tag b64>"` ou
 * `null` quando a chave não está configurada.
 */
export async function encryptString(plain: string): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

/** Decifra um valor produzido por `encryptString`. Retorna `null` se inválido. */
export async function decryptString(payload: string): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;
  const [version, ivB64, ctB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !ctB64) return null;
  try {
    const iv = fromBase64(ivB64);
    const ct = fromBase64(ctB64);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Hash SHA-256 (hex) — útil para anonimizar identificadores em logs. */
export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hasEncryptionKey = (): boolean => Boolean(KEY_B64);
