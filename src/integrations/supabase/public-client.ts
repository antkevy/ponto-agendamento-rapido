import { createClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";

// Página pública /p/:slug com acesso por token (link secreto).
// O token é enviado no header `x-page-token`, que as policies da migração
// 20260808000000_scope_public_reads.sql comparam com profissionais.page_token.
// Sem token, retorna o cliente padrão (só enxerga páginas públicas).
const PAGE_TOKEN_HEADER = "x-page-token";

export function publicPageClient(token?: string) {
  if (!token) return supabase;
  return createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    {
      global: { headers: { [PAGE_TOKEN_HEADER]: token } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function pageTokenFromSearch(
  search: Record<string, unknown> | undefined,
): string | undefined {
  const raw = search?.["token"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}
