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
          <p className="text-sm text-muted-foreground mb-4">Defina faixas separadas para manhã e tarde. Adicione mais faixas por dia se precisar de mais divisões (ex: noite).</p>
          {WEEKDAYS_PT.map((label, wd) => {
            const dayRows = (rows ?? []).filter((r) => r.weekday === wd);
            const morning = dayRows.filter((r) => Number(r.start_time.slice(0, 2)) < 12);
            const afternoon = dayRows.filter((r) => Number(r.start_time.slice(0, 2)) >= 12);
            return (
              <div key={wd} className="card-elevated p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black tracking-tight text-foreground">{label}</h3>
                  {dayRows.length === 0 && <span className="text-xs text-muted-foreground">Fechado</span>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <PeriodBlock
                    label="Manhã"
                    defaultStart="08:00"
                    defaultEnd="12:00"
                    rows={morning}
                    onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })}
                    onRemove={(id) => remove.mutate(id)}
                  />
                  <PeriodBlock
                    label="Tarde"
                    defaultStart="13:00"
                    defaultEnd="18:00"
                    rows={afternoon}
                    onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })}
                    onRemove={(id) => remove.mutate(id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function PeriodBlock({
  label,
  defaultStart,
  defaultEnd,
  rows,
  onAdd,
  onRemove,
}: {
  label: string;
  defaultStart: string;
  defaultEnd: string;
  rows: Row[];
  onAdd: (start: string, end: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  return (
    <div className="rounded-xl border border-border/70 bg-surface/60 p-4 transition-colors hover:border-accent/40">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground min-h-[36px]"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        )}
      </div>

      {rows.length === 0 && !open ? (
        <p className="text-xs text-muted-foreground italic">Sem horário</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-all hover:border-accent/50 hover:shadow-md"
            >
              <span className="font-mono font-semibold tracking-tight">{r.start_time.slice(0, 5)} <span className="text-muted-foreground">–</span> {r.end_time.slice(0, 5)}</span>
              <button
                onClick={() => onRemove(r.id)}
                className="rounded-md p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground min-h-[36px] focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <span className="text-muted-foreground">–</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground min-h-[36px] focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <button
            onClick={() => { onAdd(start + ":00", end + ":00"); setOpen(false); setStart(defaultStart); setEnd(defaultEnd); }}
            className="btn-pill-solid !py-1 !px-4 text-sm !min-h-[36px]"
          >
            Salvar
          </button>
          <button onClick={() => setOpen(false)} className="text-muted-foreground text-sm min-h-[36px] px-2 hover:text-foreground">Cancelar</button>
        </div>
      )}
    </div>
  );
}
