import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/booking";
import { X, CheckCheck, Search, CalendarClock, Phone, Mail, MessageSquare } from "lucide-react";
import { displayPhoneBR } from "@/lib/phone";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";

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

const RANGES: { key: Filter; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "7 dias" },
  { key: "month", label: "30 dias" },
  { key: "all", label: "Todos" },
];
const STATUSES: { key: StatusFilter; label: string; dotCls: string }[] = [
  { key: "all", label: "Todos", dotCls: "bg-muted-foreground" },
  { key: "confirmed", label: "Confirmados", dotCls: "bg-accent" },
  { key: "completed", label: "Concluídos", dotCls: "bg-success" },
  { key: "cancelled", label: "Cancelados", dotCls: "bg-destructive" },
];

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const [range, setRange] = useState<Filter>("week");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
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

  const filtered = useMemo(() => {
    const list = appts ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      a.client_name.toLowerCase().includes(q) ||
      a.service_snapshot_name.toLowerCase().includes(q) ||
      (a.client_phone ?? "").includes(q) ||
      (a.client_email ?? "").toLowerCase().includes(q)
    );
  }, [appts, search]);

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
          <div className="card-elevated p-4 mb-5 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Período</p>
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => setRange(r.key)} data-selected={range === r.key || undefined} className="chip !min-h-[36px] !py-1.5 text-sm">
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s.key} onClick={() => setStatus(s.key)} data-selected={status === s.key || undefined} className="chip !min-h-[36px] !py-1.5 text-sm inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${s.dotCls}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por cliente, serviço, telefone ou email..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{filtered.length} resultado(s)</span>
                <span className="max-sm:hidden"><ViewToggle value={view} onChange={setView} /></span>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum agendamento encontrado.</p>
          ) : view === "list" ? (
            <div className="space-y-3">
              {filtered.map((a) => <ApptRow key={a.id} a={a} businessName={pro.business_name} onUpdate={(s) => update.mutate({ id: a.id, status: s })} />)}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => <ApptCard key={a.id} a={a} businessName={pro.business_name} onUpdate={(s) => update.mutate({ id: a.id, status: s })} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function whatsAppUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

function whatsAppMsg(a: Appt, businessName: string, status: Appt["status"]) {
  if (status === "completed") return "";
  const date = new Date(a.starts_at).toLocaleDateString("pt-BR", { dateStyle: "full" });
  const time = new Date(a.starts_at).toLocaleTimeString("pt-BR", { timeStyle: "short" });
  if (status === "confirmed") {
    return `Ola ${a.client_name}! Seu agendamento na ${businessName} esta confirmado!\n\nData: ${date}\nHorario: ${time}\nServico: ${a.service_snapshot_name}\nValor: ${formatBRL(a.service_snapshot_price_cents)}\n\nQualquer duvida, estamos a disposicao!`;
  }
  return `Ola ${a.client_name}! Notamos que voce cancelou seu agendamento na ${businessName}.\n\nSe precisar de ajuda ou quiser remarcar, e so nos chamar! Estamos aqui para o que precisar.`;
}

function ApptRow({ a, businessName, onUpdate }: { a: Appt; businessName: string; onUpdate: (s: Appt["status"]) => void }) {
  return (
    <div className="card-elevated p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{a.client_name}</p>
            <StatusBadge status={a.status} />
          </div>
          <p className="text-sm text-muted-foreground">{a.service_snapshot_name} · {formatBRL(a.service_snapshot_price_cents)}</p>
          <p className="text-sm mt-1">{new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>
          <p className="text-xs text-muted-foreground mt-1">{displayPhoneBR(a.client_phone)}{a.client_email ? ` · ${a.client_email}` : ""}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => { const msg = whatsAppMsg(a, businessName, a.status); window.open(`${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`, "_blank"); }} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm" title="Enviar mensagem"><MessageSquare className="h-4 w-4" /> Enviar mensagem</button>
          {a.status === "confirmed" && <Actions onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

function ApptCard({ a, businessName, onUpdate }: { a: Appt; businessName: string; onUpdate: (s: Appt["status"]) => void }) {
  return (
    <div className="card-elevated p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold truncate">{a.client_name}</p>
        <StatusBadge status={a.status} />
      </div>
      <p className="text-sm text-muted-foreground truncate">{a.service_snapshot_name}</p>
      <p className="text-sm font-medium">{formatBRL(a.service_snapshot_price_cents)}</p>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3" /> {displayPhoneBR(a.client_phone)}</p>
      {a.client_email && <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {a.client_email}</p>}
      <div className="flex gap-2 mt-auto pt-3">
        <button onClick={() => { const msg = whatsAppMsg(a, businessName, a.status); window.open(`${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`, "_blank"); }} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm flex-1 justify-center" title="Enviar mensagem"><MessageSquare className="h-4 w-4" /> Enviar mensagem</button>
        {a.status === "confirmed" && <Actions onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

function Actions({ onUpdate }: { onUpdate: (s: Appt["status"]) => void }) {
  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={() => onUpdate("completed")} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm"><CheckCheck className="h-4 w-4" /> Concluir</button>
      <button onClick={() => { if (confirm("Cancelar este agendamento?")) onUpdate("cancelled"); }} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm text-destructive"><X className="h-4 w-4" /> Cancelar</button>
    </div>
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
