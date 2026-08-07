import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type UserRole = "admin" | "editor" | "user";

/**
 * Lê a role do usuário em `user_security` (definida pela migração
 * security_core). Sem registro (migração ainda não aplicada) assume "admin",
 * preservando o comportamento atual de dono do negócio.
 */
export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>("admin");
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_security")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.role) setRole(data.role as UserRole);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    canEdit: role === "admin" || role === "editor",
  };
}

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  user: "Usuário",
};
