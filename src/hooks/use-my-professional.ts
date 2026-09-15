import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";

type Profissional = Database["public"]["Tables"]["profissionais"]["Row"];

/**
 * Retorna o profissional do usuário logado (inclui colunas privadas).
 * Usa a RPC get_my_profissional() (SECURITY DEFINER) em vez de
 * SELECT * direto, para que a policy de coluna pública não restrinja
 * owner_name, msg_confirmed, msg_cancelled, etc.
 */
export function useMyProfessional() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-professional", user?.id],
    enabled: !!user,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Profissional | null> => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_my_professional");
      if (error) throw error;
      const rows = data as unknown as Profissional[];
      return rows?.[0] ?? null;
    },
  });
}
