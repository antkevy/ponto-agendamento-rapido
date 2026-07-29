import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL, formatLongDate, formatTime } from "@/lib/booking";
import { isValidPhoneBR, displayPhoneBR } from "@/lib/phone";
import { PhoneInput } from "@/components/phone-input";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Calendar, DollarSign, X } from "lucide-react";

export const Route = createFileRoute("/app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Agendaí" }] }),
  component: Page,
});

type Cliente = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
};

type ClienteAppt = {
  id: string;
  starts_at: string;
  ends_at: string;
  service_snapshot_name: string;
  service_snapshot_price_cents: number;
  status: string;
};

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Cliente | null>(null);

  const { data: clientes } = useQuery({
    queryKey: ["clientes", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.clientes)
        .select("id, name, phone, email, notes, created_at")
        .eq("professional_id", pro!.id)
        .order("name");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const { data: appts } = useQuery({
    queryKey: ["cliente-appts", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.agendamentos)
        .select("id, starts_at, ends_at, service_snapshot_name, service_snapshot_price_cents, status")
        .eq("professional_id", pro!.id)
        .eq("client_phone", selected!.phone)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data as ClienteAppt[];
    },
  });

  const save = useMutation({
    mutationFn: async (v: { id?: string; name: string; phone: string; email: string; notes: string }) => {
      if (!isValidPhoneBR(v.phone)) throw new Error("Telefone incompleto. Use (XX) XXXXX-XXXX.");
      const payload = { name: v.name.trim(), phone: v.phone, email: v.email.trim() || null, notes: v.notes.trim() || null };
      if (v.id) {
        const { error } = await supabase.from(db.clientes).update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.clientes).insert({ professional_id: pro!.id, ...payload });
        if (error) {
          if (error.message?.includes("unique") || error.code === "23505") throw new Error("Já existe um cliente com este telefone.");
          throw error;
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); setEditing(null); setCreating(false); toast.success("Cliente salvo!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.clientes).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); setSelected(null); toast.success("Cliente removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (clientes ?? []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <AppShell title="Clientes">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..." className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <ViewToggle view={view} onChange={setView} />
            <button onClick={() => setCreating(true)} className="btn-brand inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Novo cliente</button>
          </div>

          {creating && <ClienteForm onSubmit={(v) => save.mutate(v)} saving={save.isPending} onCancel={() => setCreating(false)} />}

          {selected && (
            <div className="card-elevated p-4 mb-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{selected.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {displayPhoneBR(selected.phone)}</p>
                  {selected.email && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> {selected.email}</p>}
                  {selected.notes && <p className="text-sm text-muted-foreground mt-1">{selected.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(selected); setCreating(true); }} className="text-primary p-2 min-h-[44px] min-w-[44px] grid place-items-center"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm("Remover este cliente?")) remove.mutate(selected.id); }} className="text-destructive p-2 min-h-[44px] min-w-[44px] grid place-items-center"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => setSelected(null)} className="text-muted-foreground p-2 min-h-[44px] min-w-[44px] grid place-items-center"><X className="h-4 w-4" /></button>
                </div>
              </div>
              {appts && appts.length > 0 && (
                <>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Calendar className="h-3 w-3" /> Histórico de agendamentos</h4>
                  <div className="space-y-2">
                    {appts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.service_snapshot_name}</p>
                          <p className="text-xs text-muted-foreground">{formatLongDate(new Date(a.starts_at))} às {formatTime(new Date(a.starts_at))}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">{formatBRL(a.service_snapshot_price_cents)}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            a.status === "completed" ? "bg-green-100 text-green-700" :
                            a.status === "cancelled" ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {a.status === "completed" ? "Concluído" : a.status === "cancelled" ? "Cancelado" : "Confirmado"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(!appts || appts.length === 0) && <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado.</p>}
            </div>
          )}

          {editing && creating && <ClienteForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} onCancel={() => { setEditing(null); setCreating(false); }} />}

          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => setSelected(c)} className={`card-elevated p-4 text-left transition ${selected?.id === c.id ? "ring-2 ring-primary" : ""}`}>
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{displayPhoneBR(c.phone)}</p>
                  {c.email && <p className="text-sm text-muted-foreground truncate">{c.email}</p>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Nenhum cliente encontrado.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => setSelected(c)} className={`card-elevated p-4 w-full text-left transition flex items-center justify-between gap-3 ${selected?.id === c.id ? "ring-2 ring-primary" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{displayPhoneBR(c.phone)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <span onClick={(e) => { e.stopPropagation(); setEditing(c); setCreating(true); }} className="text-primary p-2 min-h-[44px] min-w-[44px] grid place-items-center"><Pencil className="h-4 w-4" /></span>
                    <span onClick={(e) => { e.stopPropagation(); if (confirm("Remover este cliente?")) remove.mutate(c.id); }} className="text-destructive p-2 min-h-[44px] min-w-[44px] grid place-items-center"><Trash2 className="h-4 w-4" /></span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function ClienteForm({ initial, onSubmit, saving, onCancel }: {
  initial?: Cliente;
  onSubmit: (v: { id?: string; name: string; phone: string; email: string; notes: string }) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSubmit({ id: initial?.id, name: name.trim(), phone, email, notes }); }} className="card-elevated p-4 grid gap-3 sm:grid-cols-2 mb-4">
      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className={inpCls} /></label>
      <label className="block"><span className="text-sm font-medium">WhatsApp</span>
        <PhoneInput value={phone} onChange={setPhone} /></label>
      <label className="block"><span className="text-sm font-medium">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" className={inpCls} /></label>
      <label className="block sm:col-span-2"><span className="text-sm font-medium">Observações</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotações sobre o cliente..." className={inpCls} rows={2} /></label>
      <div className="sm:col-span-2 flex gap-2">
        <button disabled={saving} className="btn-brand flex-1 disabled:opacity-60">{saving ? "Salvando..." : initial ? "Salvar" : "Adicionar cliente"}</button>
        <button type="button" onClick={onCancel} className="btn-ghost px-4">Cancelar</button>
      </div>
    </form>
  );
}

const inpCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
