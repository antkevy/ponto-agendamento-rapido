import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/bloqueios")({
  head: () => ({ meta: [{ title: "Bloqueios — Agendaí" }] }),
  component: Page,
});

type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: blocks } = useQuery({
    queryKey: ["blocks", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from(db.bloqueios).select("*").eq("professional_id", pro!.id).order("starts_at");
      if (error) throw error;
      return data as Block[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { starts_at: string; ends_at: string; reason: string | null }) => {
      const { error } = await supabase.from(db.bloqueios).insert({ professional_id: pro!.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blocks"] }); setShowForm(false); toast.success("Bloqueio adicionado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(db.bloqueios).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blocks"] }),
  });

  return (
    <AppShell title="Bloqueios de agenda">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <p className="text-sm text-muted-foreground mb-4">Bloqueie períodos em que você não estará disponível (férias, feriados, imprevistos).</p>
          <button onClick={() => setShowForm((v) => !v)} className="btn-brand inline-flex items-center gap-2 mb-4"><Plus className="h-4 w-4" /> Novo bloqueio</button>
          {showForm && <BlockForm onSubmit={(v) => add.mutate(v)} saving={add.isPending} />}
          <ul className="mt-4 space-y-2">
            {(blocks ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nenhum bloqueio ativo.</li>}
            {(blocks ?? []).map((b) => (
              <li key={b.id} className="card-elevated p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{new Date(b.starts_at).toLocaleString("pt-BR")} → {new Date(b.ends_at).toLocaleString("pt-BR")}</p>
                  {b.reason && <p className="text-sm text-muted-foreground truncate">{b.reason}</p>}
                </div>
                <button onClick={() => remove.mutate(b.id)} className="text-destructive shrink-0 p-2 min-h-[44px] min-w-[44px] grid place-items-center"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}

function BlockForm({ onSubmit, saving }: { onSubmit: (v: { starts_at: string; ends_at: string; reason: string | null }) => void; saving: boolean }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!start || !end) return; onSubmit({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), reason: reason || null }); }} className="card-elevated p-4 grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="text-sm font-medium">Início</span>
        <input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} placeholder="Data e hora de início" className={inputCls} /></label>
      <label className="block"><span className="text-sm font-medium">Fim</span>
        <input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="Data e hora de fim" className={inputCls} /></label>
      <label className="block sm:col-span-2"><span className="text-sm font-medium">Motivo (opcional)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Férias, feriado..." className={inputCls} /></label>
      <button disabled={saving} className="btn-brand sm:col-span-2 disabled:opacity-60">{saving ? "Salvando..." : "Adicionar bloqueio"}</button>
    </form>
  );
}
const inputCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
