import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABEL } from "@/hooks/use-user-role";

type Member = {
  user_id: string;
  email: string;
  role: string;
  mfa_enabled: boolean;
  password_changed_at: string | null;
};

const ROLES = ["admin", "editor", "user"] as const;

/** Lista e altera papéis. A RPC já bloqueia qualquer chamado não-admin. */
export function TeamRoles() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const {
    data: members,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["team_members"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.rpc("list_team_members");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.rpc("set_user_role", {
        p_user_id: userId,
        p_role: role,
      });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível alterar o papel deste usuário.");
    },
    onSuccess: () => {
      toast.success("Papel atualizado.");
      qc.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-elevated p-6 space-y-5">
      <div className="flex items-center gap-3">
        <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-bold tracking-tight">Equipe e permissões</h3>
          <p className="text-xs text-muted-foreground">
            Administradores podem editar tudo; editores podem gerenciar catálogo e horários.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipe...
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a equipe. Tente novamente.
        </p>
      ) : !members || members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-slim">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Usuário
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  2FA
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Papel
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === user?.id;
                return (
                  <tr key={m.user_id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3">
                      <span className="font-medium">{m.email}</span>
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`ui-badge text-xs ${
                          m.mfa_enabled ? "text-[var(--success)]" : "text-[var(--warning)]"
                        }`}
                      >
                        {m.mfa_enabled ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Papel de ${m.email}`}
                        value={ROLES.includes(m.role as (typeof ROLES)[number]) ? m.role : "user"}
                        disabled={isSelf || changeRole.isPending}
                        onChange={(e) =>
                          changeRole.mutate({ userId: m.user_id, role: e.target.value })
                        }
                        className="min-h-[44px] w-full rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-60"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r] ?? r}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
