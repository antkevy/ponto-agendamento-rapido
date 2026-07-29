import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { useAuth } from "@/hooks/use-auth";

export function useMyProfessional() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-professional", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from(db.profissionais)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
