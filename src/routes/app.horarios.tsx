import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { WEEKDAYS_PT } from "@/lib/booking";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/horarios")({
  head: () => ({ meta: [{ title: "Horários — Agendaí" }] }),
  component: Page,
});

type Row = { id: string; weekday: number; start_time: string; end_time: string };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["availability", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("availability").select("*").eq("professional_id", pro!.id).order("weekday").order("start_time");
      if (error) throw error;
      return data as Row[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { weekday: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("availability").insert({ professional_id: pro!.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["availability"] }); toast.success("Horário adicionado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("availability").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });

  return (
    <AppShell title="Horários de atendimento">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">Defina os dias e faixas de horário que você atende. Adicione mais de uma faixa por dia para incluir intervalo de almoço.</p>
          {WEEKDAYS_PT.map((label, wd) => {
            const dayRows = (rows ?? []).filter((r) => r.weekday === wd);
            return (
              <div key={wd} className="card-elevated p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{label}</h3>
                  <AddButton onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })} />
                </div>
                {dayRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Fechado</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {dayRows.map((r) => (
                      <li key={r.id} className="inline-flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                        <span className="font-mono">{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</span>
                        <button onClick={() => remove.mutate(r.id)} className="text-destructive hover:opacity-70" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function AddButton({ onAdd }: { onAdd: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-accent text-sm font-semibold inline-flex items-center gap-1 min-h-[44px] px-2"><Plus className="h-4 w-4" /> Adicionar</button>
  );
  return (
    <div className="flex items-center gap-2">
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="border border-border rounded-md px-2 py-1 text-sm min-h-[36px]" />
      <span className="text-muted-foreground">–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-border rounded-md px-2 py-1 text-sm min-h-[36px]" />
      <button onClick={() => { onAdd(start + ":00", end + ":00"); setOpen(false); }} className="btn-brand !py-1 !px-3 text-sm !min-h-[36px]">OK</button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground text-sm">×</button>
    </div>
  );
}
