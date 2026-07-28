import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/booking";
import { X, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/app/agendamentos")({
  head: () => ({ meta: [{ title: "Agendamentos — Agendaí" }] }),
  component: Page,
});

type Filter = "today" | "week" | "month" | "all";
type StatusFilter = "all" | "confirmed" | "cancelled" | "completed";

type Appt = {
  id: string;
  starts_at: string;
  ends_at: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  service_snapshot_name: string;
  service_snapshot_price_cents: number;
  status: "confirmed" | "cancelled" | "completed";
  notes: string | null;
};

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const [range, setRange] = useState<Filter>("week");
  const [status, setStatus] = useState<StatusFilter>("all");
  const qc = useQueryClient();

  const { data: appts } = useQuery({
    queryKey: ["appointments", pro?.id, range, status],
    enabled: !!pro?.id,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      if (range === "today") end.setDate(end.getDate() + 1);
      else if (range === "week") end.setDate(end.getDate() + 7);
      else if (range === "month") end.setMonth(end.getMonth() + 1);
      else end.setFullYear(end.getFullYear() + 5);

      let q = supabase.from("appointments").select("*").eq("professional_id", pro!.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at");
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data as Appt[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Appt["status"] }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Agendamentos">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {(["today","week","month","all"] as Filter[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} data-selected={range === r} className="chip !min-h-[38px] !py-1.5 text-sm">
                {r === "today" ? "Hoje" : r === "week" ? "7 dias" : r === "month" ? "30 dias" : "Todos"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            {(["all","confirmed","completed","cancelled"] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)} data-selected={status === s} className="chip !min-h-[38px] !py-1.5 text-sm">
                {s === "all" ? "Todos" : s === "confirmed" ? "Confirmados" : s === "completed" ? "Concluídos" : "Cancelados"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {(appts ?? []).length === 0 && <p className="text-muted-foreground text-sm">Nenhum agendamento neste período.</p>}
            {(appts ?? []).map((a) => (
              <div key={a.id} className="card-elevated p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{a.client_name}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">{a.service_snapshot_name} · {formatBRL(a.service_snapshot_price_cents)}</p>
                    <p className="text-sm mt-1">{new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.client_phone} · {a.client_email}</p>
                  </div>
                  {a.status === "confirmed" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => update.mutate({ id: a.id, status: "completed" })} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm"><CheckCheck className="h-4 w-4" /> Concluir</button>
                      <button onClick={() => { if (confirm("Cancelar este agendamento?")) update.mutate({ id: a.id, status: "cancelled" }); }} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm text-destructive"><X className="h-4 w-4" /> Cancelar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: Appt["status"] }) {
  const map = {
    confirmed: { label: "Confirmado", cls: "bg-accent/10 text-accent" },
    cancelled: { label: "Cancelado", cls: "bg-destructive/10 text-destructive" },
    completed: { label: "Concluído", cls: "bg-success/10 text-success" },
  } as const;
  const c = map[status];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>;
}
