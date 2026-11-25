/**
 * Configurações públicas disponíveis no runtime do Worker.
 *
 * No Lovable, `VITE_*` é lido no build e o usuário nem sempre consegue editar
 * `.env`. As mesmas URLs/chaves públicas também existem como secrets/bindings
 * do Worker; aqui elas são expostas ao navegador de forma intencional.
 *
 * NUNCA incluir SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET_KEY ou qualquer
 * outro valor sensível neste objeto.
 */
export type PublicRuntimeEnv = {
  SUPABASE_URL?: string | null;
  SUPABASE_PUBLISHABLE_KEY?: string | null;
  TURNSTILE_SITE_KEY?: string | null;
};

type WithRuntimeEnv = typeof globalThis & { __AGENDAI_ENV__?: PublicRuntimeEnv };

export function setPublicRuntimeEnv(env: PublicRuntimeEnv): void {
  (globalThis as WithRuntimeEnv).__AGENDAI_ENV__ = env;
}

export function publicRuntimeEnv(): PublicRuntimeEnv {
  return (globalThis as WithRuntimeEnv).__AGENDAI_ENV__ ?? {};
}

/** Script injetado no <head> para o browser receber a mesma config do SSR. */
export function publicRuntimeEnvScript(): string {
  const env = publicRuntimeEnv();
  const payload = JSON.stringify(env).replace(/</g, "\\u003c");
  return `(function(){globalThis.__AGENDAI_ENV__=${payload};})();`;
}
