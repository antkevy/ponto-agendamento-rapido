import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL } from "@/lib/booking";
import {
  X,
  CheckCheck,
  Search,
  CalendarClock,
  Phone,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
} from "lucide-react";
import { displayPhoneBR, isValidPhoneBR } from "@/lib/phone";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { PhoneInput } from "@/components/phone-input";
import { Modal } from "@/routes/app.servicos";

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
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const {
    data: appts,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["appointments", pro?.id, range, status],
    enabled: !!pro?.id,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      if (range === "today") end.setDate(end.getDate() + 1);
      else if (range === "week") end.setDate(end.getDate() + 7);
      else if (range === "month") end.setMonth(end.getMonth() + 1);
      else end.setFullYear(end.getFullYear() + 5);

      let q = supabase
        .from(db.agendamentos)
        .select("*")
        .eq("professional_id", pro!.id)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
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
    return list.filter(
      (a) =>
        a.client_name.toLowerCase().includes(q) ||
        a.service_snapshot_name.toLowerCase().includes(q) ||
        (a.client_phone ?? "").includes(q) ||
        (a.client_email ?? "").toLowerCase().includes(q),
    );
  }, [appts, search]);

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Appt["status"] }) => {
      const { error } = await supabase.from(db.agendamentos).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async (v: NewAppointmentPayload) => {
      const { error } = await supabase.from(db.agendamentos).insert({
        professional_id: pro!.id,
        service_id: v.service_id,
        starts_at: v.starts_at,
        ends_at: v.ends_at,
        client_name: v.client_name,
        client_phone: v.client_phone,
        client_email: v.client_email,
        notes: v.notes,
        status: "confirmed",
        service_snapshot_name: v.service_name,
        service_snapshot_price_cents: v.service_price_cents,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setCreating(false);
      toast.success("Agendamento criado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Agendamentos">
      {isLoading ? (
        <div className="skeleton h-32" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Gerencie os agendamentos do seu negócio.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreating(true)}
                className="btn-brand inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Novo agendamento
              </button>
              <button
                onClick={() => void refetch()}
                disabled={isFetching}
                title="Atualizar"
                className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border text-muted-foreground disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="card-elevated p-4 mb-5 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Período
              </p>
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    data-selected={range === r.key || undefined}
                    className="chip !min-h-[36px] !py-1.5 text-sm"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Status
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStatus(s.key)}
                    data-selected={status === s.key || undefined}
                    className="chip !min-h-[36px] !py-1.5 text-sm inline-flex items-center gap-1.5"
                  >
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
                <span className="text-xs text-muted-foreground">
                  {filtered.length} resultado(s)
                </span>
                <span className="max-sm:hidden">
                  <ViewToggle value={view} onChange={setView} />
                </span>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum agendamento encontrado.</p>
          ) : view === "list" ? (
            <div className="space-y-3">
              {filtered.map((a) => (
                <ApptRow
                  key={a.id}
                  a={a}
                  businessName={pro.business_name}
                  msgConfirmed={pro.msg_confirmed}
                  msgCancelled={pro.msg_cancelled}
                  onUpdate={(s) => update.mutate({ id: a.id, status: s })}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => (
                <ApptCard
                  key={a.id}
                  a={a}
                  businessName={pro.business_name}
                  msgConfirmed={pro.msg_confirmed}
                  msgCancelled={pro.msg_cancelled}
                  onUpdate={(s) => update.mutate({ id: a.id, status: s })}
                />
              ))}
            </div>
          )}

          {creating && (
            <Modal onClose={() => setCreating(false)}>
              <NewAppointmentForm
                proId={pro.id}
                saving={create.isPending}
                onSubmit={(v) => create.mutate(v)}
              />
            </Modal>
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

function whatsAppMsg(
  a: Appt,
  businessName: string,
  status: Appt["status"],
  customConfirmed: string | null,
  customCancelled: string | null,
) {
  if (status === "completed") return "";
  const date = new Date(a.starts_at).toLocaleDateString("pt-BR", { dateStyle: "full" });
  const time = new Date(a.starts_at).toLocaleTimeString("pt-BR", { timeStyle: "short" });
  const vars: Record<string, string> = {
    "{nome}": a.client_name,
    "{negocio}": businessName,
    "{data}": date,
    "{horario}": time,
    "{servico}": a.service_snapshot_name,
    "{valor}": formatBRL(a.service_snapshot_price_cents),
  };
  const replace = (s: string) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(k, v), s);
  const template = status === "confirmed" ? customConfirmed : customCancelled;
  if (template?.trim()) return replace(template);
  if (status === "confirmed") {
    return `Ola ${a.client_name}! Seu agendamento na ${businessName} esta confirmado!\n\nData: ${date}\nHorario: ${time}\nServico: ${a.service_snapshot_name}\nValor: ${formatBRL(a.service_snapshot_price_cents)}\n\nQualquer duvida, estamos a disposicao!`;
  }
  return `Ola ${a.client_name}! Notamos que voce cancelou seu agendamento na ${businessName}.\n\nSe precisar de ajuda ou quiser remarcar, e so nos chamar! Estamos aqui para o que precisar.`;
}

function ApptRow({
  a,
  businessName,
  msgConfirmed,
  msgCancelled,
  onUpdate,
}: {
  a: Appt;
  businessName: string;
  msgConfirmed: string | null;
  msgCancelled: string | null;
  onUpdate: (s: Appt["status"]) => void;
}) {
  return (
    <div className="card-elevated p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{a.client_name}</p>
            <StatusBadge status={a.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {a.service_snapshot_name} · {formatBRL(a.service_snapshot_price_cents)}
          </p>
          <p className="text-sm mt-1">
            {new Date(a.starts_at).toLocaleString("pt-BR", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {displayPhoneBR(a.client_phone)}
            {a.client_email ? ` · ${a.client_email}` : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => {
              const msg = whatsAppMsg(a, businessName, a.status, msgConfirmed, msgCancelled);
              window.open(
                `${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`,
                "_blank",
              );
            }}
            className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm"
            title="Mensagem"
          >
            <MessageSquare className="h-4 w-4" /> Mensagem
          </button>
          {a.status === "confirmed" && <Actions onUpdate={onUpdate} />}
        </div>
      </div>
    </div>
  );
}

function ApptCard({
  a,
  businessName,
  msgConfirmed,
  msgCancelled,
  onUpdate,
}: {
  a: Appt;
  businessName: string;
  msgConfirmed: string | null;
  msgCancelled: string | null;
  onUpdate: (s: Appt["status"]) => void;
}) {
  return (
    <div className="card-elevated p-3 sm:p-4 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold truncate text-sm sm:text-base">{a.client_name}</p>
        <StatusBadge status={a.status} />
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground truncate">{a.service_snapshot_name}</p>
      <p className="text-sm sm:text-base font-medium">
        {formatBRL(a.service_snapshot_price_cents)}
      </p>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <CalendarClock className="h-3 w-3 shrink-0" />{" "}
        {new Date(a.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      </p>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
        <Phone className="h-3 w-3 shrink-0" /> {displayPhoneBR(a.client_phone)}
      </p>
      {a.client_email && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
          <Mail className="h-3 w-3 shrink-0" /> {a.client_email}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-1 sm:mt-auto sm:pt-2">
        <button
          onClick={() => {
            const msg = whatsAppMsg(a, businessName, a.status, msgConfirmed, msgCancelled);
            window.open(
              `${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`,
              "_blank",
            );
          }}
          className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm flex-1 justify-center"
          title="Mensagem"
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="max-sm:sr-only"> Mensagem</span>
        </button>
        {a.status === "confirmed" && <Actions onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

function Actions({ onUpdate }: { onUpdate: (s: Appt["status"]) => void }) {
  return (
    <div className="flex gap-2 shrink-0">
      <button
        onClick={() => onUpdate("completed")}
        className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm"
      >
        <CheckCheck className="h-4 w-4" />
        <span className="max-sm:sr-only"> Concluir</span>
      </button>
      <button
        onClick={() => {
          if (confirm("Cancelar este agendamento?")) onUpdate("cancelled");
        }}
        className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm text-destructive"
      >
        <X className="h-4 w-4" />
        <span className="max-sm:sr-only"> Cancelar</span>
      </button>
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
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>
  );
}

type ServiceOption = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
};

type ClientOption = {
  key: string;
  name: string;
  phone: string;
  email: string | null;
};

type NewAppointmentPayload = {
  service_id: string;
  service_name: string;
  service_price_cents: number;
  starts_at: string;
  ends_at: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  notes: string | null;
};

const inputCls =
  "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";

function NewAppointmentForm({
  proId,
  saving,
  onSubmit,
}: {
  proId: string;
  saving: boolean;
  onSubmit: (v: NewAppointmentPayload) => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [clientKey, setClientKey] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["appt-new-services", proId],
    enabled: !!proId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.servicos)
        .select("id, name, duration_minutes, price_cents")
        .eq("professional_id", proId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as ServiceOption[];
    },
  });

  const { data: existingClients } = useQuery({
    queryKey: ["appt-existing-clients", proId],
    enabled: !!proId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.clientes)
        .select("id, name, phone, email")
        .eq("professional_id", proId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c) => ({ key: c.id, name: c.name, phone: c.phone, email: c.email }));
    },
  });

  const { data: existingFallback } = useQuery({
    queryKey: ["appt-existing-fallback", proId],
    enabled: !!proId && !!existingClients && existingClients.length === 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.agendamentos)
        .select("client_name, client_phone, client_email")
        .eq("professional_id", proId)
        .order("starts_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const seen = new Set<string>();
      const rows: ClientOption[] = [];
      for (const a of data ?? []) {
        const p = a.client_phone;
        if (p && !seen.has(p)) {
          seen.add(p);
          rows.push({ key: `fallback-${p}`, name: a.client_name, phone: p, email: a.client_email });
        }
      }
      return rows.sort((x, y) => x.name.localeCompare(y.name));
    },
  });

  const clientOptions = useMemo(() => {
    if (existingClients && existingClients.length > 0) return existingClients;
    return existingFallback ?? [];
  }, [existingClients, existingFallback]);

  const selected = (services ?? []).find((s) => s.id === serviceId);

  const nowInput = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const minInput = `${nowInput.getFullYear()}-${pad(nowInput.getMonth() + 1)}-${pad(nowInput.getDate())}T${pad(nowInput.getHours())}:${pad(nowInput.getMinutes())}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!serviceId) {
          toast.error("Selecione um serviço.");
          return;
        }
        const client =
          clientMode === "existing" ? clientOptions.find((c) => c.key === clientKey) : null;
        if (clientMode === "existing" && !client) {
          toast.error("Selecione um cliente existente.");
          return;
        }
        const finalName = client ? client.name : clientName.trim();
        const finalPhone = client ? client.phone : phone;
        const finalEmail = client ? client.email : email.trim() || null;
        if (finalName.length < 2) {
          toast.error("Informe o nome do cliente.");
          return;
        }
        if (!isValidPhoneBR(finalPhone)) {
          toast.error("Telefone incompleto. Use (XX) XXXXX-XXXX.");
          return;
        }
        const start = new Date(startsAt);
        if (!start.getTime() || start.getTime() <= Date.now()) {
          toast.error("Escolha uma data e horário futuros.");
          return;
        }
        const ends = new Date(start.getTime() + selected!.duration_minutes * 60000);
        onSubmit({
          service_id: serviceId,
          service_name: selected!.name,
          service_price_cents: selected!.price_cents,
          starts_at: start.toISOString(),
          ends_at: ends.toISOString(),
          client_name: finalName,
          client_phone: finalPhone,
          client_email: finalEmail,
          notes: notes.trim() || null,
        });
      }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-black tracking-tight text-foreground">Novo agendamento</h2>

      <label className="block">
        <span className="text-sm font-medium">Serviço</span>
        <select
          required
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className={inputCls}
        >
          <option value="">Selecione um serviço...</option>
          {(services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatBRL(s.price_cents)}
            </option>
          ))}
        </select>
        {!servicesLoading && (services ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Crie um serviço ativo na aba Serviços para poder agendar.
          </p>
        )}
      </label>
      <div>
        <span className="text-sm font-medium">Cliente</span>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => {
              setClientMode("new");
              setClientKey("");
            }}
            data-selected={clientMode === "new" || undefined}
            className="chip !min-h-[36px] !py-1.5 text-sm"
          >
            Cliente novo
          </button>
          <button
            type="button"
            onClick={() => setClientMode("existing")}
            data-selected={clientMode === "existing" || undefined}
            className="chip !min-h-[36px] !py-1.5 text-sm"
          >
            Já cadastrado
          </button>
        </div>
      </div>
      {clientMode === "existing" ? (
        <label className="block">
          <span className="text-sm font-medium">Selecionar cliente</span>
          <select
            required
            value={clientKey}
            onChange={(e) => {
              const key = e.target.value;
              setClientKey(key);
              const c = clientOptions.find((o) => o.key === key);
              if (c) {
                setClientName(c.name);
                setPhone(c.phone);
                setEmail(c.email ?? "");
              }
            }}
            className={inputCls}
          >
            <option value="">Selecione...</option>
            {clientOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} · {displayPhoneBR(c.phone)}
              </option>
            ))}
          </select>
          {clientOptions.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum cliente cadastrado ainda. Escolha "Cliente novo" ou cadastre na aba Clientes.
            </p>
          )}
        </label>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-medium">Nome do cliente</span>
            <input
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex.: Maria Silva"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Telefone (WhatsApp)</span>
            <PhoneInput value={phone} onChange={setPhone} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">E-mail (opcional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className={inputCls}
            />
          </label>
        </>
      )}
      <label className="block">
        <span className="text-sm font-medium">Data e hora do atendimento</span>
        <input
          required
          type="datetime-local"
          value={startsAt}
          min={minInput}
          onChange={(e) => setStartsAt(e.target.value)}
          className={inputCls}
        />
        {selected && (
          <p className="text-xs text-muted-foreground mt-1">
            Duração: {selected.duration_minutes} min · Término às{" "}
            {new Date(
              new Date(startsAt).getTime() + selected.duration_minutes * 60000,
            ).toLocaleTimeString("pt-BR", { timeStyle: "short" })}
          </p>
        )}
      </label>
      <label className="block">
        <span className="text-sm font-medium">Observações (opcional)</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Cliente pediu para lembrar de 15 min antes."
          className={inputCls}
        />
      </label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">
        {saving ? "Salvando..." : "Confirmar agendamento"}
      </button>
    </form>
  );
}
