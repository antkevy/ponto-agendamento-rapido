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
  CircleCheck,
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
  StickyNote,
  Check,
} from "lucide-react";
import { displayPhoneBR, isValidPhoneBR } from "@/lib/phone";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import {
  ApptDetailModal,
  ROW_BORDER,
  STATUSES,
  StatusBadge,
  WeekCalendar,
  whatsAppMsg,
  whatsAppUrl,
  type Appt,
  type StatusFilter,
} from "@/components/appointments";
import { PhoneInput } from "@/components/phone-input";
import { Modal } from "@/routes/app.servicos";
import { Reveal } from "@/components/reveal";
import { StatCard } from "@/components/ui/stat-card";
import { CardTable, DataTableHead, DataTableRow, DataTableCell } from "@/components/ui/data-table";
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

const RANGES: { key: Filter; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "week", label: "7 dias" },
  { key: "month", label: "30 dias" },
  { key: "all", label: "Todos" },
];

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const [range, setRange] = useState<Filter>("week");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Appt | null>(null);
  const qc = useQueryClient();

  const {
    data: appts,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["appointments", pro?.id, range],
    enabled: !!pro?.id,
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      if (range === "today") end.setDate(end.getDate() + 1);
      else if (range === "week") end.setDate(end.getDate() + 7);
      else if (range === "month") end.setMonth(end.getMonth() + 1);
      else {
        start.setFullYear(start.getFullYear() - 5);
        end.setFullYear(end.getFullYear() + 5);
      }

      const { data, error } = await supabase
        .from(db.agendamentos)
        .select("*")
        .eq("professional_id", pro!.id)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: range !== "all" });
      if (error) throw error;
      return data as Appt[];
    },
  });

  const filtered = useMemo(() => {
    const list = (appts ?? []).filter((a) => status === "all" || a.status === status);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.client_name.toLowerCase().includes(q) ||
        a.service_snapshot_name.toLowerCase().includes(q) ||
        (a.client_phone ?? "").includes(q) ||
        (a.client_email ?? "").toLowerCase().includes(q),
    );
  }, [appts, search, status]);

  const counts = useMemo(
    () => ({
      all: filtered.length,
      confirmed: filtered.filter((a) => a.status === "confirmed").length,
      completed: filtered.filter((a) => a.status === "completed").length,
      cancelled: filtered.filter((a) => a.status === "cancelled").length,
    }),
    [filtered],
  );

  const periodLabel = RANGES.find((r) => r.key === range)?.label ?? "Período";

  const summary = useMemo(() => {
    const list = appts ?? [];
    const todayStr = new Date().toDateString();
    return {
      today: list.filter((a) => new Date(a.starts_at).toDateString() === todayStr).length,
      confirmed: list.filter((a) => a.status === "confirmed").length,
      completed: list.filter((a) => a.status === "completed").length,
      cancelled: list.filter((a) => a.status === "cancelled").length,
    };
  }, [appts]);

  const update = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Appt, "status" | "notes">>) => {
      const { error } = await supabase.from(db.agendamentos).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appt-calendar-week"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async (v: NewAppointmentPayload) => {
      const { error, data } = await supabase
        .from(db.agendamentos)
        .insert({
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
        })
        .select("starts_at")
        .single();
      if (error) throw error;
      return { starts_at: data?.starts_at ?? v.starts_at };
    },
    onSuccess: (result) => {
      const created = new Date(result.starts_at);
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      if (range === "today") end.setDate(end.getDate() + 1);
      else if (range === "week") end.setDate(end.getDate() + 7);
      else if (range === "month") end.setMonth(end.getMonth() + 1);
      else end.setFullYear(end.getFullYear() + 5);

      const insideCurrentRange = created >= start && created < end;
      if (!insideCurrentRange) {
        const monthEnd = new Date(start);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        if (created < monthEnd) setRange("month");
        else setRange("all");
        setView("list");
      }
      if (status !== "all") setStatus("all");

      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["appt-calendar-week"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["appt-existing-clients"] });
      qc.invalidateQueries({ queryKey: ["appt-existing-fallback"] });
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
          <div className="animate-ui-slide-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
            <p className="text-sm text-muted-foreground">
              Gerencie os agendamentos do seu negócio.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void refetch();
                  void qc.invalidateQueries({ queryKey: ["appointments"] });
                  void qc.invalidateQueries({ queryKey: ["appt-calendar-week"] });
                  void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                }}
                disabled={isFetching}
                aria-busy={isFetching || undefined}
                title="Atualizar"
                className={cn(
                  "p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg border transition-colors",
                  isFetching
                    ? "border-accent/40 bg-accent/10 text-accent disabled:opacity-100"
                    : "border-border text-muted-foreground hover:bg-muted disabled:opacity-60",
                )}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isFetching ? "animate-spin text-accent" : "text-muted-foreground",
                  )}
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

          <div
            className="animate-ui-slide-up grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4"
            style={{ animationDelay: "40ms" }}
          >
            <StatCard
              icon={CalendarClock}
              label="Hoje"
              value={String(summary.today)}
              hint="agendamentos hoje"
              tone="accent"
            />
            <StatCard
              icon={CheckCheck}
              label="Agendados"
              value={String(summary.confirmed)}
              hint={`no período (${periodLabel})`}
              tone="brand"
            />
            <StatCard
              icon={CircleCheck}
              label="Concluídos"
              value={String(summary.completed)}
              hint="atendimentos finalizados"
              tone="success"
            />
            <StatCard
              icon={X}
              label="Cancelados"
              value={String(summary.cancelled)}
              hint={`no período (${periodLabel})`}
              tone="destructive"
            />
          </div>

          <div
            className="animate-ui-slide-up card-elevated p-3 sm:p-4 mb-4"
            style={{ animationDelay: "80ms" }}
          >
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
                    className="min-h-[44px] rounded-lg text-sm font-semibold transition-all text-muted-foreground hover:text-foreground data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm"
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
                <span>
                  <ViewToggle value={view} onChange={setView} />
                </span>
              </div>
            </div>
          </div>

          <div
            className="animate-ui-slide-up flex items-center justify-between gap-3 mb-3"
            style={{ animationDelay: "120ms" }}
          >
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

          {view === "calendar" ? (
            <Reveal delay={140}>
              <WeekCalendar proId={pro.id} status={status} search={search} onSelect={setDetail} />
            </Reveal>
          ) : filtered.length === 0 ? (
            <Reveal delay={140}>
              <div className="card-elevated p-10 sm:p-14 text-center">
                <span className="ui-icon-bubble mx-auto grid h-14 w-14 place-items-center rounded-2xl mb-4">
                  <CalendarClock className="h-7 w-7" />
                </span>
                <p className="text-lg font-bold">Nenhum agendamento encontrado</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  {search || status !== "all"
                    ? "Ajuste os filtros para ver mais resultados."
                    : "Você ainda não tem agendamentos. Crie o primeiro em poucos segundos."}
                </p>
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
                  {search || status !== "all" ? (
                    <button
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                      }}
                      className="btn-outline-brand inline-flex items-center gap-1 text-sm"
                    >
                      <X className="h-4 w-4" /> Limpar filtros
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setCreating(true)}
                        className="btn-brand inline-flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" /> Criar agendamento
                      </button>
                      <button
                        onClick={() => {
                          void refetch();
                          void qc.invalidateQueries({ queryKey: ["appointments"] });
                          void qc.invalidateQueries({ queryKey: ["appt-calendar-week"] });
                          void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                        }}
                        disabled={isFetching}
                        className="btn-outline-brand inline-flex items-center gap-1 text-sm"
                      >
                        <RefreshCw className="h-4 w-4" /> Atualizar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Reveal>
          ) : view === "list" ? (
            <Reveal delay={140}>
              <ApptsTable
                appts={filtered}
                businessName={pro.business_name}
                msgConfirmed={pro.msg_confirmed}
                msgCancelled={pro.msg_cancelled}
                onUpdateById={(id, s) => update.mutate({ id, status: s })}
                onDetail={setDetail}
              />
            </Reveal>
          ) : (
            <Reveal delay={140}>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((a, i) => (
                  <div key={a.id} className="ui-stagger" style={{ ["--i" as string]: i }}>
                    <ApptCard
                      a={a}
                      businessName={pro.business_name}
                      msgConfirmed={pro.msg_confirmed}
                      msgCancelled={pro.msg_cancelled}
                      onUpdate={(s) => update.mutate({ id: a.id, status: s })}
                      onDetail={() => setDetail(a)}
                    />
                  </div>
                ))}
              </div>
            </Reveal>
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

          {detail && (
            <ApptDetailModal
              key={detail.id}
              a={detail}
              businessName={pro.business_name}
              msgConfirmed={pro.msg_confirmed}
              msgCancelled={pro.msg_cancelled}
              onClose={() => setDetail(null)}
              onUpdate={(s) => {
                update.mutate({ id: detail.id, status: s });
                setDetail(null);
              }}
              onSaveNotes={(notes) => {
                update.mutate({ id: detail.id, notes });
                setDetail((d) => (d ? { ...d, notes } : d));
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

function ApptsTable({
  appts,
  businessName,
  msgConfirmed,
  msgCancelled,
  onUpdateById,
  onDetail,
}: {
  appts: Appt[];
  businessName: string;
  msgConfirmed: string | null;
  msgCancelled: string | null;
  onUpdateById: (id: string, s: Appt["status"]) => void;
  onDetail: (a: Appt) => void;
}) {
  return (
    <CardTable tableClassName="min-w-[760px]">
      <thead className="bg-muted/50 [&_tr]:border-b [&_tr]:border-border/60">
        <tr>
          <DataTableHead>Cliente</DataTableHead>
          <DataTableHead>Serviço</DataTableHead>
          <DataTableHead>Data</DataTableHead>
          <DataTableHead>Valor</DataTableHead>
          <DataTableHead>Status</DataTableHead>
          <DataTableHead className="text-right">Ações</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {appts.map((a, i) => (
          <DataTableRow
            key={a.id}
            className="ui-stagger-fade"
            style={{ ["--i" as string]: i, borderLeft: `2px solid ${ROW_BORDER[a.status]}` }}
          >
            <DataTableCell>
              <button
                type="button"
                onClick={() => onDetail(a)}
                className="flex items-center gap-2.5 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-accent/10 transition-colors cursor-pointer"
                title="Ver detalhes"
              >
                <span className="ui-icon-bubble h-9 w-9 shrink-0 grid place-items-center rounded-full text-sm font-bold">
                  {a.client_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold truncate max-w-[160px] hover:text-accent transition-colors">
                    {a.client_name}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate max-w-[160px]">
                    {displayPhoneBR(a.client_phone)}
                    {a.client_email ? ` · ${a.client_email}` : ""}
                  </span>
                </span>
              </button>
            </DataTableCell>
            <DataTableCell>
              <p className="font-medium truncate max-w-[200px]">{a.service_snapshot_name}</p>
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <div>
                  <p className="font-medium capitalize">
                    {new Date(a.starts_at).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(new Date(a.starts_at))}
                  </p>
                </div>
                {a.notes && (
                  <StickyNote
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              <p className="font-black tracking-tight" style={{ color: "var(--brand)" }}>
                {formatBRL(a.service_snapshot_price_cents)}
              </p>
            </DataTableCell>
            <DataTableCell>
              <StatusBadge status={a.status} />
            </DataTableCell>
            <DataTableCell>
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => {
                    const msg = whatsAppMsg(a, businessName, a.status, msgConfirmed, msgCancelled);
                    window.open(
                      `${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`,
                      "_blank",
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                  title="Enviar mensagem"
                >
                  <MessageSquare className="h-4 w-4" />
                  Mensagem
                </button>
                {a.status === "confirmed" && (
                  <>
                    <button
                      onClick={() => onUpdateById(a.id, "completed")}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-success hover:bg-success/10 transition-colors"
                      title="Concluir"
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Cancelar este agendamento?")) onUpdateById(a.id, "cancelled");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      title="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </DataTableCell>
          </DataTableRow>
        ))}
      </tbody>
    </CardTable>
  );
}

function ApptCard({
  a,
  businessName,
  msgConfirmed,
  msgCancelled,
  onUpdate,
  onDetail,
}: {
  a: Appt;
  businessName: string;
  msgConfirmed: string | null;
  msgCancelled: string | null;
  onUpdate: (s: Appt["status"]) => void;
  onDetail: () => void;
}) {
  return (
    <div
      className={cn(
        "card-elevated p-3 sm:p-4 flex flex-col gap-1.5",
        a.status === "completed" && "border-success/25 bg-success/[0.03]",
        a.status === "cancelled" && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onDetail}
          className="font-semibold truncate text-sm sm:text-base text-left hover:text-accent transition-colors cursor-pointer"
          title="Ver detalhes"
        >
          {a.client_name}
        </button>
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
      {a.notes && (
        <p
          className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"
          title={a.notes}
        >
          <StickyNote className="h-3 w-3 shrink-0" /> {a.notes}
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
  const [selectedServices, setSelectedServices] = useState<ServiceOption[]>([]);
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

  const totalDuration = useMemo(
    () => selectedServices.reduce((a, s) => a + s.duration_minutes, 0),
    [selectedServices],
  );
  const totalPrice = useMemo(
    () => selectedServices.reduce((a, s) => a + s.price_cents, 0),
    [selectedServices],
  );
  const combinedName = useMemo(
    () => selectedServices.map((s) => s.name).join(" + "),
    [selectedServices],
  );
  const selectedClient =
    clientMode === "existing" ? clientOptions.find((c) => c.key === clientKey) : null;
  const when = slot;
  const finalNamePreview =
    clientMode === "existing" ? (selectedClient?.name ?? "") : clientName.trim();
  const endTimeLabel =
    totalDuration > 0 && when ? formatTime(new Date(when.getTime() + totalDuration * 60000)) : "—";

  const summaryCard =
    selectedServices.length > 0 ? (
      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="space-y-2">
          {selectedServices.map((s) => (
            <UISummaryRow
              key={s.id}
              icon={Tag}
              sub={`${formatBRL(s.price_cents)} · ${s.duration_minutes} min`}
            >
              {s.name}
            </UISummaryRow>
          ))}
        </div>
        <UISummaryRow
          icon={Calendar}
          sub={when ? `às ${formatTime(when)} · até ${endTimeLabel}` : undefined}
        >
          <span className="first-letter:uppercase">
            {when ? formatLongDate(when) : "Data a definir"}
          </span>
        </UISummaryRow>
        <UISummaryRow icon={User}>{finalNamePreview || "Cliente a definir"}</UISummaryRow>
        <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted-foreground">
            Total · {totalDuration} min
          </span>
          <span className="text-2xl font-black tracking-tight" style={{ color: "var(--brand)" }}>
            {formatBRL(totalPrice)}
          </span>
        </div>
      </div>
    ) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (selectedServices.length === 0) {
          toast.error("Selecione ao menos um serviço.");
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
        const ends = new Date(start.getTime() + totalDuration * 60000);
        onSubmit({
          service_id: selectedServices[0].id,
          service_name: combinedName,
          service_price_cents: totalPrice,
          starts_at: start.toISOString(),
          ends_at: ends.toISOString(),
          client_name: finalName,
          client_phone: finalPhone,
          client_email: finalEmail,
          notes: notes.trim() || null,
        });
      }}
      className="flex flex-col min-h-full -m-5 p-5 sm:-m-6 sm:p-6 lg:m-0 lg:p-0 lg:h-full"
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

      <div className="flex-1 min-h-0 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-visible lg:gap-10">
        <div className="space-y-6 min-h-0 lg:space-y-6 lg:overflow-y-auto lg:overflow-x-hidden overscroll-contain scrollbar-slim lg:pr-3">
          <section className="space-y-3">
            <SectionLabel>
              Serviços ({selectedServices.length}
              {selectedServices.length > 0 ? ` · ${totalDuration} min` : ""})
            </SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {(services ?? []).map((s) => {
                const isSelected = selectedServices.some((x) => x.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedServices((prev) =>
                        isSelected ? prev.filter((x) => x.id !== s.id) : [...prev, s],
                      );
                      setSlot(null);
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all min-h-[56px]",
                      isSelected
                        ? "border-accent bg-accent/10 ring-1 ring-inset ring-accent"
                        : "border-border hover:border-accent/50 hover:bg-muted/40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatBRL(s.price_cents)} · {s.duration_minutes} min
                      </span>
                    </span>
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                        isSelected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border text-transparent",
                      )}
                      aria-hidden="true"
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>
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
                  "min-h-[44px] rounded-lg text-sm font-semibold transition-all",
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
                  "min-h-[44px] rounded-lg text-sm font-semibold transition-all",
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
              durationMinutes={totalDuration}
              selectedSlot={slot}
              onPick={setSlot}
            />
            {totalDuration > 0 && (
              <p className="text-xs text-muted-foreground">
                {totalDuration} min totais · término às {endTimeLabel}
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

      <footer className="mt-5 sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background border-t border-border shrink-0">
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
                    className="h-11 w-full rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 hover:text-accent transition-colors data-[today]:ring-1 data-[today]:ring-accent/40 data-[selected]:!bg-accent data-[selected]:!text-accent-foreground data-[selected]:ring-0"
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
                  <div key={i} className="skeleton h-11" />
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
