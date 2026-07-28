import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/booking";
import { Pencil, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/app/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Agendaí" }] }),
  component: Page,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null; is_active: boolean };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Service> | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("professional_id", pro!.id).order("created_at");
      if (error) throw error;
      return data as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async (s: Partial<Service>) => {
      if (!pro) throw new Error();
      if (s.id) {
        const { error } = await supabase.from("services").update({ name: s.name!, duration_minutes: s.duration_minutes!, price_cents: s.price_cents ?? 0, description: s.description ?? null, is_active: s.is_active ?? true }).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert({ professional_id: pro.id, name: s.name!, duration_minutes: s.duration_minutes!, price_cents: s.price_cents ?? 0, description: s.description ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setEditing(null); toast.success("Serviço salvo!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("services").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("Removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Serviços">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <button onClick={() => setEditing({ duration_minutes: 30 })} className="btn-brand inline-flex items-center gap-2 mb-6">
            <Plus className="h-4 w-4" /> Novo serviço
          </button>
          <div className="grid gap-3">
            {(services ?? []).length === 0 && <p className="text-muted-foreground text-sm">Nenhum serviço ainda. Crie o primeiro para começar a receber agendamentos.</p>}
            {(services ?? []).map((s) => (
              <div key={s.id} className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.duration_minutes} min · {formatBRL(s.price_cents)}</p>
                  {s.description && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{s.description}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditing(s)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"><Pencil className="h-4 w-4" /> Editar</button>
                  <button onClick={() => { if (confirm("Excluir este serviço?")) remove.mutate(s.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>

          {editing && (
            <Modal onClose={() => setEditing(null)}>
              <ServiceForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} />
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}

function ServiceForm({ initial, onSubmit, saving }: { initial: Partial<Service>; onSubmit: (s: Partial<Service>) => void; saving: boolean }) {
  const [name, setName] = useState(initial.name ?? "");
  const [duration, setDuration] = useState(initial.duration_minutes ?? 30);
  const [priceReais, setPriceReais] = useState(((initial.price_cents ?? 0) / 100).toString().replace(".", ","));
  const [description, setDescription] = useState(initial.description ?? "");

  return (
    <form onSubmit={(e) => { e.preventDefault(); const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100); onSubmit({ id: initial.id, name, duration_minutes: duration, price_cents: cents, description }); }} className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-foreground">{initial.id ? "Editar" : "Novo"} serviço</h2>
      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-sm font-medium">Duração (min)</span>
          <input required type="number" inputMode="numeric" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls} /></label>
        <label className="block"><span className="text-sm font-medium">Preço (R$)</span>
          <input inputMode="decimal" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} className={inputCls} /></label>
      </div>
      <label className="block"><span className="text-sm font-medium">Descrição (opcional)</span>
        <textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

const inputCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid sm:place-items-center animate-fade-in-up" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-2xl p-6 h-full sm:h-auto sm:my-8 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
        <button onClick={onClose} className="btn-outline-brand w-full mt-3">Cancelar</button>
      </div>
    </div>
  );
}
