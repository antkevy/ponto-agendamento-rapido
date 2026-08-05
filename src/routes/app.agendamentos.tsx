import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import {
  formatBRL,
  formatLongDate,
  formatTime,
  computeSlots,
  WEEKDAYS_PT_SHORT,
} from "@/lib/booking";
import type { AvailabilityRow, Block, BusySlot } from "@/lib/booking";
import { cn } from "@/lib/utils";
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
  CalendarPlus,
  Tag,
  User,
  Users,
  MessageCircle,
  Pencil,
  Calendar,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { displayPhoneBR, isValidPhoneBR } from "@/lib/phone";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { PhoneInput } from "@/components/phone-input";
import { Modal } from "@/routes/app.servicos";
import {
  UIButton,
  UIIconBubble,
  UIInput,
  UITextarea,
  UINotice,
  UISummaryRow,
} from "@/components/ui-kit";

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

  const counts = useMemo(
    () => ({
      all: filtered.length,
      confirmed: filtered.filter((a) => a.status === "confirmed").length,
      completed: filtered.filter((a) => a.status === "completed").length,
      cancelled: filtered.filter((a) => a.status === "cancelled").length,
    }),
    [filtered],
  );

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
            <p className="text-sm text-muted-foreground">
              Gerencie os agendamentos do seu negócio.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refetch()}
                disabled={isFetching}
                title="Atualizar"
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg hover:bg-muted border border-border text-muted-foreground disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 transition-colors ${isFetching ? "animate-spin text-accent" : "text-muted-foreground"}`}
                />
              </button>
              <button
                onClick={() => setCreating(true)}
                className="btn-brand inline-flex items-center justify-center gap-2 flex-1 sm:flex-none"
              >
                <Plus className="h-4 w-4" /> Novo agendamento
              </button>
            </div>
          </div>

          <div className="card-elevated p-3 sm:p-4 mb-4">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Período
              </p>
              <div
                className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-muted sm:max-w-md"
                role="group"
                aria-label="Período"
              >
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    data-selected={range === r.key || undefined}
                    className="min-h-[40px] rounded-lg text-sm font-semibold transition-all text-muted-foreground hover:text-foreground data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por cliente, serviço, telefone ou email..."
                  className="w-full h-[44px] pl-9 pr-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <span
                    className={`absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full pointer-events-none ${STATUSES.find((s) => s.key === status)?.dotCls}`}
                  />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusFilter)}
                    aria-label="Filtrar por status"
                    className="h-[44px] pl-9 pr-9 rounded-lg border border-border bg-background text-sm font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} ({counts[s.key]})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <span className="hidden sm:block">
                  <ViewToggle value={view} onChange={setView} />
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-muted-foreground">
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-sm font-medium text-accent hover:underline"
              >
                Limpar busca
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card-elevated p-8 text-center">
              <CalendarClock className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
              <p className="font-semibold">Nenhum agendamento encontrado</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || status !== "all"
                  ? "Ajuste os filtros para ver mais resultados."
                  : "Crie o primeiro agendamento do dia."}
              </p>
              {(search || status !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm mt-4"
                >
                  <X className="h-4 w-4" /> Limpar filtros
                </button>
              )}
            </div>
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
            <Modal onClose={() => setCreating(false)} size="xl" hideFooter>
              <NewAppointmentForm
                proId={pro.id}
                saving={create.isPending}
                onSubmit={(v) => create.mutate(v)}
                onClose={() => setCreating(false)}
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

function NewAppointmentForm({
  proId,
  saving,
  onSubmit,
  onClose,
}: {
  proId: string;
  saving: boolean;
  onSubmit: (v: NewAppointmentPayload) => void;
  onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [clientKey, setClientKey] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [slot, setSlot] = useState<Date | null>(null);
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
  const selectedClient =
    clientMode === "existing" ? clientOptions.find((c) => c.key === clientKey) : null;
  const when = slot;
  const finalNamePreview =
    clientMode === "existing" ? (selectedClient?.name ?? "") : clientName.trim();
  const endTimeLabel =
    selected && when
      ? formatTime(new Date(when.getTime() + selected.duration_minutes * 60000))
      : "—";

  const summaryCard = selected ? (
    <div className="ui-card p-4 sm:p-5 space-y-3">
      <UISummaryRow icon={Tag} sub={`${selected.duration_minutes} min`}>
        {selected.name}
      </UISummaryRow>
      <UISummaryRow icon={Calendar} sub={when ? `às ${formatTime(when)}` : undefined}>
        <span className="first-letter:uppercase">
          {when ? formatLongDate(when) : "Data a definir"}
        </span>
      </UISummaryRow>
      <UISummaryRow icon={User}>{finalNamePreview || "Cliente a definir"}</UISummaryRow>
      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">Total</span>
        <span className="text-2xl font-black tracking-tight" style={{ color: "var(--brand)" }}>
          {formatBRL(selected.price_cents)}
        </span>
      </div>
    </div>
  ) : null;

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
        if (!slot) {
          toast.error("Escolha uma data e horário disponíveis.");
          return;
        }
        const start = slot;
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
      className="flex flex-col h-full"
    >
      <header className="flex items-center justify-between gap-3 mb-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <UIIconBubble icon={CalendarPlus} />
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight text-foreground">Novo agendamento</h2>
            <p className="text-sm text-muted-foreground">Marque um horário para um cliente.</p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-visible lg:gap-10">
        <div className="space-y-5 min-h-0 lg:space-y-6 lg:overflow-y-auto lg:pr-1">
          <section className="space-y-3">
            <SectionLabel>Serviço</SectionLabel>
            <span className="ui-field">
              <Tag className="ui-field-icon" />
              <select
                required
                value={serviceId}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setSlot(null);
                }}
                className="ui-field-input pl-11"
              >
                <option value="">Selecione um serviço...</option>
                {(services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatBRL(s.price_cents)}
                  </option>
                ))}
              </select>
            </span>
            {!servicesLoading && (services ?? []).length === 0 && (
              <UINotice icon={Info} title="Nenhum serviço ativo">
                Crie um serviço na aba Serviços para poder agendar.
              </UINotice>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Cliente</SectionLabel>
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted"
              role="group"
              aria-label="Tipo de cliente"
            >
              <button
                type="button"
                onClick={() => {
                  setClientMode("new");
                  setClientKey("");
                }}
                className={cn(
                  "min-h-[40px] rounded-lg text-sm font-semibold transition-all",
                  clientMode === "new"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Cliente novo
              </button>
              <button
                type="button"
                onClick={() => setClientMode("existing")}
                className={cn(
                  "min-h-[40px] rounded-lg text-sm font-semibold transition-all",
                  clientMode === "existing"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Já cadastrado
              </button>
            </div>

            {clientMode === "existing" ? (
              <>
                <span className="ui-field">
                  <Users className="ui-field-icon" />
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
                    className="ui-field-input pl-11"
                  >
                    <option value="">Selecione um cliente...</option>
                    {clientOptions.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name} · {displayPhoneBR(c.phone)}
                      </option>
                    ))}
                  </select>
                </span>
                {selectedClient && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/50">
                    <span className="ui-icon-bubble h-9 w-9 grid place-items-center rounded-full shrink-0 font-bold text-sm">
                      {selectedClient.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {selectedClient.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {displayPhoneBR(selectedClient.phone)}
                        {selectedClient.email ? ` · ${selectedClient.email}` : ""}
                      </p>
                    </div>
                  </div>
                )}
                {clientOptions.length === 0 && (
                  <UINotice icon={Info} title="Nenhum cliente cadastrado">
                    Escolha "Cliente novo" — o cliente é cadastrado automaticamente ao agendar.
                  </UINotice>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <UIInput
                  label="Nome completo"
                  icon={User}
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  autoComplete="name"
                  placeholder="Ex.: Maria Silva"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-sm font-semibold text-foreground mb-2">
                      WhatsApp
                    </span>
                    <span className="ui-field">
                      <MessageCircle className="ui-field-icon" />
                      <PhoneInput
                        value={phone}
                        onChange={setPhone}
                        className="ui-field-input pl-11"
                      />
                    </span>
                  </label>
                  <UIInput
                    label="E-mail (opcional)"
                    icon={Mail}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Data e hora</SectionLabel>
            <AvailabilityPicker
              proId={proId}
              durationMinutes={selected?.duration_minutes ?? 0}
              selectedSlot={slot}
              onPick={setSlot}
            />
            {selected && (
              <p className="text-xs text-muted-foreground">
                {selected.duration_minutes} min de duração · término às {endTimeLabel}
              </p>
            )}
          </section>

          <UITextarea
            label="Observações (opcional)"
            icon={Pencil}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alguma preferência ou observação?"
          />
        </div>

        {summaryCard && <aside className="hidden lg:block">{summaryCard}</aside>}
      </div>

      {summaryCard && <div className="mt-5 lg:hidden shrink-0">{summaryCard}</div>}

      <footer className="mt-5 sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-3 bg-background border-t border-border shrink-0">
        <div className="flex gap-3">
          <UIButton type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </UIButton>
          <UIButton type="submit" className="flex-[1.6]" icon={CalendarPlus} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar"}
          </UIButton>
        </div>
      </footer>
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</p>
  );
}

function AvailabilityPicker({
  proId,
  durationMinutes,
  selectedSlot,
  onPick,
}: {
  proId: string;
  durationMinutes: number;
  selectedSlot: Date | null;
  onPick: (d: Date | null) => void;
}) {
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(() =>
    selectedSlot ? new Date(selectedSlot) : null,
  );

  const { data: proAvail, isLoading: loadingAvail } = useQuery({
    queryKey: ["appt-avail", proId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.horarios)
        .select("*")
        .eq("professional_id", proId);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const rangeStart = monthStart;
  const rangeEnd = useMemo(() => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [monthStart]);

  const { data: proBlocks } = useQuery({
    queryKey: ["appt-blocks", proId, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueios)
        .select("starts_at,ends_at")
        .eq("professional_id", proId)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: busy, isLoading: loadingBusy } = useQuery({
    queryKey: ["appt-busy", proId, selectedDay?.toISOString()],
    enabled: !!selectedDay,
    queryFn: async () => {
      const from = new Date(selectedDay!);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      const { data, error } = await supabase.rpc("get_busy_slots", {
        _professional_id: proId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return (data as BusySlot[]) ?? [];
    },
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const startWeekday = first.getDay();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    const end = new Date(monthStart);
    end.setMonth(end.getMonth() + 1);
    for (let d = new Date(first); d < end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const dayHasAvailability = (day: Date) =>
    !!proAvail && proAvail.some((r) => r.weekday === day.getDay());

  const canGoPrev = monthStart > new Date(today.getFullYear(), today.getMonth(), 1);

  const slots = useMemo(() => {
    if (!selectedDay || !proAvail || !proBlocks || !busy) return [];
    if (durationMinutes <= 0) return [];
    return computeSlots({
      day: selectedDay,
      serviceDurationMinutes: durationMinutes,
      availability: proAvail,
      blocks: proBlocks,
      busy,
    });
  }, [selectedDay, proAvail, proBlocks, busy, durationMinutes]);

  if (durationMinutes <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha um serviço para ver os horários disponíveis.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {loadingAvail ? (
        <div className="skeleton h-40" />
      ) : !proAvail || proAvail.length === 0 ? (
        <UINotice icon={Info} title="Sem horários de funcionamento">
          Defina os horários na aba Serviços → Horários para poder agendar.
        </UINotice>
      ) : (
        <>
          <div className="card-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(monthStart);
                  d.setMonth(d.getMonth() - 1);
                  setMonthStart(d);
                }}
                disabled={!canGoPrev}
                aria-label="Mês anterior"
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-semibold capitalize">
                {monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(monthStart);
                  d.setMonth(d.getMonth() + 1);
                  setMonthStart(d);
                }}
                aria-label="Próximo mês"
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {WEEKDAYS_PT_SHORT.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const past = d < today;
                const canSelect = !past && dayHasAvailability(d);
                const selected = selectedDay && d.toDateString() === selectedDay.toDateString();
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canSelect}
                    onClick={() => {
                      setSelectedDay(d);
                      onPick(null);
                    }}
                    data-selected={selected || undefined}
                    data-today={isToday || undefined}
                    className="h-10 w-full rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 hover:text-accent transition-colors data-[today]:ring-1 data-[today]:ring-accent/40 data-[selected]:!bg-accent data-[selected]:!text-accent-foreground data-[selected]:ring-0"
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {!selectedDay ? (
              <p className="text-sm text-muted-foreground">
                Selecione uma data no calendário para ver os horários disponíveis.
              </p>
            ) : loadingBusy ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-10" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum horário livre nesse dia. Tente outro.
              </p>
            ) : (
              <div className="space-y-5">
                {[
                  { label: "Manhã", from: 6, to: 12 },
                  { label: "Tarde", from: 12, to: 18 },
                  { label: "Noite", from: 18, to: 24 },
                ].map(({ label, from, to }) => {
                  const periodSlots = slots.filter((s) => {
                    const h = s.getHours();
                    return h >= from && h < to;
                  });
                  if (periodSlots.length === 0) return null;
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-4 bg-border" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </h4>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {periodSlots.map((s) => (
                          <button
                            key={s.toISOString()}
                            type="button"
                            onClick={() => {
                              setSelectedDay(s);
                              onPick(s);
                            }}
                            data-selected={selectedSlot?.getTime() === s.getTime()}
                            className="chip"
                          >
                            {formatTime(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
