import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL, formatLongDate, formatTime } from "@/lib/booking";
import { isValidPhoneBR, displayPhoneBR, onlyDigits } from "@/lib/phone";
import { PhoneInput } from "@/components/phone-input";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Calendar, ChevronDown, X } from "lucide-react";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: clientes, isLoading: clientesLoading } = useQuery({
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

  const { data: fallback, isLoading: fallbackLoading } = useQuery({
    queryKey: ["clientes-fallback", pro?.id],
    enabled: !!pro?.id && !!clientes && clientes.length === 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.agendamentos)
        .select("client_name, client_phone, client_email")
        .eq("professional_id", pro!.id)
        .order("starts_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const seen = new Set<string>();
      const rows: Cliente[] = [];
      for (const a of data ?? []) {
        const key = a.client_phone;
        if (key && !seen.has(key)) {
          seen.add(key);
          rows.push({ id: `fallback-${key}`, name: a.client_name, phone: key, email: a.client_email, notes: null, created_at: "" });
        }
      }
      return rows.sort((x, y) => x.name.localeCompare(y.name));
    },
  });

  const list = useMemo<Cliente[]>(() => {
    if (clientes && clientes.length > 0) return clientes;
    return fallback ?? [];
  }, [clientes, fallback]);

  const { data: appts } = useQuery({
    queryKey: ["cliente-appts", expandedId, list],
    enabled: !!expandedId && list.length > 0,
    queryFn: async () => {
      const c = list.find((x) => x.id === expandedId);
      if (!c) return [];
      const { data, error } = await supabase
        .from(db.agendamentos)
        .select("id, starts_at, ends_at, service_snapshot_name, service_snapshot_price_cents, status")
        .eq("professional_id", pro!.id)
        .eq("client_phone", c.phone)
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data as ClienteAppt[];
    },
  });

  const save = useMutation({
    mutationFn: async (v: { id?: string; name: string; phone: string; email: string; notes: string }) => {
      const phone = onlyDigits(v.phone);
      if (!isValidPhoneBR(phone)) throw new Error("Telefone incompleto. Use (XX) XXXXX-XXXX.");
      const payload = { name: v.name.trim(), phone, email: v.email.trim() || null, notes: v.notes.trim() || null };
      const realId = v.id && !v.id.startsWith("fallback-") ? v.id : undefined;
      if (realId) {
        const { error } = await supabase.from(db.clientes).update(payload).eq("id", realId);
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
      if (id.startsWith("fallback-")) throw new Error("Cliente vindo dos agendamentos não pode ser removido.");
      const { error } = await supabase.from(db.clientes).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); setExpandedId(null); toast.success("Cliente removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = list.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const listLoading = clientesLoading || (clientes?.length === 0 && fallbackLoading);

  return (
    <AppShell title="Clientes">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone..." className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <span className="max-sm:hidden"><ViewToggle value={view} onChange={setView} /></span>
            <button onClick={() => setCreating(true)} className="btn-brand inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Novo cliente</button>
          </div>

          {creating && !editing && <ClienteForm onSubmit={(v) => save.mutate(v)} saving={save.isPending} onCancel={() => setCreating(false)} />}
          {editing && <ClienteForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} onCancel={() => { setEditing(null); setCreating(false); }} />}

          {clientes && clientes.length === 0 && fallback && fallback.length > 0 && (
            <p className="text-xs text-muted-foreground mb-3">Mostrando clientes a partir dos agendamentos. Eles serão salvos automaticamente ao editar.</p>
          )}

          {}

          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <div key={c.id} className="card-elevated p-4 transition group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{displayPhoneBR(c.phone)}</p>
                      {c.email && <p className="text-sm text-muted-foreground truncate">{c.email}</p>}
                      {c.notes && <p className="text-xs text-muted-foreground truncate mt-1 italic">{c.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0 max-sm:sr-only group-hover:flex">
                      <span onClick={(e) => { e.stopPropagation(); setEditing(c); }} className="text-primary p-1.5 min-h-[36px] min-w-[36px] grid place-items-center rounded-md hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></span>
                      {!c.id.startsWith("fallback-") && <span onClick={(e) => { e.stopPropagation(); if (confirm("Remover este cliente?")) remove.mutate(c.id); }} className="text-destructive p-1.5 min-h-[36px] min-w-[36px] grid place-items-center rounded-md hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></span>}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && !listLoading && <p className="text-sm text-muted-foreground col-span-full">Nenhum cliente encontrado.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => {
                const isExpanded = expandedId === c.id;
                return (
                  <div key={c.id} className="card-elevated p-4 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-sm text-muted-foreground">{displayPhoneBR(c.phone)}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setExpandedId(isExpanded ? null : c.id)} className="btn-outline-brand inline-flex items-center gap-1 !py-1.5 text-xs sm:text-sm">
                          <ChevronDown className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`} />
                          <span>{isExpanded ? "Menos" : "Ver mais"}</span>
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {c.email && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5 shrink-0" /> {c.email}</p>}
                        {c.notes && <p className="text-sm text-muted-foreground">{c.notes}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => setEditing(c)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"><Pencil className="h-4 w-4" /> Editar</button>
                          {!c.id.startsWith("fallback-") && <button onClick={() => { if (confirm("Remover este cliente?")) remove.mutate(c.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /> Remover</button>}
                        </div>
                        <div className="border-t border-border pt-3">
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Histórico de agendamentos</h4>
                          {appts && appts.length > 0 ? (
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
                          ) : (
                            <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && !listLoading && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
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
  const [phone, setPhone] = useState(onlyDigits(initial?.phone ?? ""));
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSubmit({ id: initial?.id, name: name.trim(), phone, email, notes }); }} className="card-elevated p-4 grid gap-3 sm:grid-cols-2 mb-4">
      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" className={inpCls} /></label>
      <label className="block"><span className="text-sm font-medium">WhatsApp</span>
        <PhoneInput value={phone} onChange={setPhone} className={inpCls} /></label>
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
