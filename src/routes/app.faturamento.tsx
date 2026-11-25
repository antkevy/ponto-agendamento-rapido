import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Info,
  Pencil,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import {
  formatBRL,
  weekdayInTimeZone,
  zonedDateKey,
  zonedDayBounds,
  zonedMonthBounds,
  zonedTodayKey,
} from "@/lib/booking";
import { CardTable, DataTableCell, DataTableHead, DataTableRow } from "@/components/ui/data-table";
import {
  civilDate,
  dateKey,
  monthStartKey,
  pad,
  parseDateKey,
  shiftKey,
} from "@/lib/faturamento-dates";

const PeriodCalendar = lazy(() =>
  import("@/components/faturamento/period-calendar").then((module) => ({
    default: module.PeriodCalendar,
  })),
);

export const Route = createFileRoute("/app/faturamento")({
  head: () => ({ meta: [{ title: "Faturamento — Agendaí" }] }),
  component: Page,
});

type PeriodKey = "week" | "month" | "year" | "custom";

type ApptRow = {
  id: string;
  starts_at: string;
  employee_id: string | null;
  service_snapshot_name: string;
  service_snapshot_price_cents: number;
  status: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  photo_url: string | null;
  is_active: boolean;
  commission_percent: number;
};

type EmployeeTotal = {
  id: string;
  name: string;
  photo: string | null;
  atendimentos: number;
  receita: number;
  commission: number;
};

type Bucket = { key: string; label: string; receita: number };

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "Semanal" },
  { key: "month", label: "Mensal" },
  { key: "year", label: "Anual" },
  { key: "custom", label: "Período" },
];

function anchorKey(todayKey: string, period: PeriodKey, offset: number): string {
  if (offset === 0 || period === "custom") return todayKey;
  const [year, month, day] = todayKey.split("-").map(Number);
  if (period === "week") return dateKey(civilDate(year, month, day + offset * 7));
  if (period === "year") return `${year + offset}-${pad(month)}-${pad(day)}`;
  const total = year * 12 + (month - 1) + offset;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

function periodBounds(
  key: string,
  period: PeriodKey,
  from: string,
  to: string,
  timeZone: string | null,
): { start: Date; end: Date } {
  const parsed = parseDateKey(key) ?? [2026, 1, 1];
  const [year, month, day] = parsed;

  if (period === "custom") {
    const startParts = parseDateKey(from) ?? parsed;
    const endParts = parseDateKey(to) ?? startParts;
    const first = civilDate(startParts[0], startParts[1], startParts[2]);
    const last = civilDate(endParts[0], endParts[1], endParts[2]);
    const ordered = first <= last ? [first, last] : [last, first];
    return {
      start: zonedDayBounds(
        ordered[0].getUTCFullYear(),
        ordered[0].getUTCMonth() + 1,
        ordered[0].getUTCDate(),
        timeZone,
      ).start,
      end: zonedDayBounds(
        ordered[1].getUTCFullYear(),
        ordered[1].getUTCMonth() + 1,
        ordered[1].getUTCDate() + 1,
        timeZone,
      ).start,
    };
  }

  if (period === "month") return zonedMonthBounds(year, month, timeZone);
  if (period === "year") {
    return {
      start: zonedDayBounds(year, 1, 1, timeZone).start,
      end: zonedDayBounds(year + 1, 1, 1, timeZone).start,
    };
  }

  const back = (weekdayInTimeZone(new Date(), timeZone) + 6) % 7;
  const monday = civilDate(year, month, day - back);
  const sunday = civilDate(year, month, day - back + 6);
  return {
    start: zonedDayBounds(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timeZone,
    ).start,
    end: zonedDayBounds(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth() + 1,
      sunday.getUTCDate() + 1,
      timeZone,
    ).start,
  };
}

function formatRange(start: Date, end: Date, timeZone: string | null): string {
  const startKey = zonedDateKey(start, timeZone);
  const endKey = zonedDateKey(new Date(end.getTime() - 1), timeZone);
  const format = (key: string, opts: Intl.DateTimeFormatOptions) =>
    civilDate(...(key.split("-").map(Number) as [number, number, number])).toLocaleDateString(
      "pt-BR",
      { timeZone: "UTC", ...opts },
    );
  return `${format(startKey, { day: "2-digit", month: "short" })} — ${format(endKey, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function buildBuckets(
  appts: ApptRow[],
  start: Date,
  end: Date,
  timeZone: string | null,
): { buckets: Bucket[]; byMonth: boolean } {
  const startKey = zonedDateKey(start, timeZone);
  const lastKey = zonedDateKey(new Date(end.getTime() - 1), timeZone);
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const byMonth = span > 62;
  const buckets = new Map<string, Bucket>();

  if (byMonth) {
    let cursor = civilDate(Number(startKey.slice(0, 4)), Number(startKey.slice(5, 7)), 1);
    const last = civilDate(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)), 1);
    while (cursor <= last) {
      const key = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`;
      buckets.set(key, {
        key,
        label: cursor
          .toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short" })
          .replace(".", ""),
        receita: 0,
      });
      cursor = civilDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 1);
    }
  } else {
    let cursor = civilDate(
      Number(startKey.slice(0, 4)),
      Number(startKey.slice(5, 7)),
      Number(startKey.slice(8, 10)),
    );
    const last = civilDate(
      Number(lastKey.slice(0, 4)),
      Number(lastKey.slice(5, 7)),
      Number(lastKey.slice(8, 10)),
    );
    while (cursor <= last) {
      const key = dateKey(cursor);
      buckets.set(key, {
        key,
        label:
          span > 14
            ? cursor.toLocaleDateString("pt-BR", {
                timeZone: "UTC",
                day: "2-digit",
                month: "2-digit",
              })
            : String(cursor.getUTCDate()),
        receita: 0,
      });
      cursor = civilDate(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate() + 1,
      );
    }
  }

  for (const appt of appts) {
    if (appt.status === "cancelled") continue;
    const key = byMonth
      ? zonedDateKey(new Date(appt.starts_at), timeZone).slice(0, 7)
      : zonedDateKey(new Date(appt.starts_at), timeZone);
    const bucket = buckets.get(key);
    if (bucket) bucket.receita += appt.service_snapshot_price_cents;
  }

  return { buckets: [...buckets.values()], byMonth };
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: "accent" | "success" | "warning";
}) {
  const bubble = {
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
  }[tone];
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${bubble}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xl font-black tabular-nums tracking-tight text-foreground sm:text-2xl">
          {value}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className={`text-sm text-muted-foreground ${strong ? "font-semibold text-foreground" : ""}`}
      >
        {label}
      </dt>
      <dd
        className={`shrink-0 text-sm tabular-nums ${strong ? "text-lg font-black text-foreground" : "font-semibold text-foreground"} ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function RevenueChart({ buckets, byMonth }: { buckets: Bucket[]; byMonth: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.receita));
  const total = buckets.reduce((sum, b) => sum + b.receita, 0);
  const active = buckets.find((b) => b.key === selected);
  const step = Math.max(1, Math.ceil(buckets.length / (byMonth ? 12 : 14)));
  const withRevenue = buckets.filter((b) => b.receita > 0);
  const best = withRevenue.reduce<Bucket | null>(
    (top, b) => (!top || b.receita > top.receita ? b : top),
    null,
  );
  const worst = withRevenue.reduce<Bucket | null>(
    (low, b) => (!low || b.receita < low.receita ? b : low),
    null,
  );
  const average = buckets.length ? Math.round(total / buckets.length) : 0;
  const unit = byMonth ? "mês" : "dia";

  return (
    <>
      <div className="overflow-x-auto scrollbar-slim touch-pan-x">
        <div className="flex h-40 min-w-max items-end gap-1 pt-8">
          {buckets.map((bucket, index) => {
            const isSelected = selected === bucket.key;
            const height = bucket.receita === 0 ? 2 : Math.max((bucket.receita / max) * 100, 6);
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setSelected(isSelected ? null : bucket.key)}
                aria-label={`${bucket.label} — ${formatBRL(Math.round(bucket.receita))}`}
                className="group relative flex h-full min-w-[26px] flex-1 items-end"
              >
                <div
                  className={`w-full rounded-t-[4px] bg-gradient-to-t transition-opacity ${
                    isSelected
                      ? "from-accent to-primary opacity-100"
                      : "from-accent/20 to-accent/70 opacity-80 group-hover:opacity-100"
                  }`}
                  style={{ height: `${height}%` }}
                />
                <div
                  className={`pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold shadow-lg transition-opacity ${
                    index === 0
                      ? "left-0"
                      : index === buckets.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2"
                  } ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
                >
                  {formatBRL(Math.round(bucket.receita))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex min-w-max gap-1" aria-hidden>
          {buckets.map((bucket, index) => (
            <span
              key={bucket.key}
              className={`min-w-[26px] flex-1 truncate text-center text-[10px] font-semibold tabular-nums leading-none ${
                selected === bucket.key ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {index % step === 0 || index === buckets.length - 1 ? bucket.label : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Média por {unit}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
            {formatBRL(average)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Melhor {unit}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
            {best ? `${best.label} · ${formatBRL(Math.round(best.receita))}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Menor {unit} com receita
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
            {worst ? `${worst.label} · ${formatBRL(Math.round(worst.receita))}` : "—"}
          </p>
        </div>
      </div>
      {active && (
        <p className="mt-3 text-xs text-muted-foreground">
          {active.label} selecionado:{" "}
          <span className="font-bold text-accent">{formatBRL(Math.round(active.receita))}</span>
        </p>
      )}
    </>
  );
}

function CommissionEditor({
  employee,
  editing,
  draft,
  canEdit,
  ready,
  pending,
  onStart,
  onDraft,
  onCommit,
  onCancel,
}: {
  employee: EmployeeTotal;
  editing: boolean;
  draft: string;
  canEdit: boolean;
  ready: boolean;
  pending: boolean;
  onStart: () => void;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          min={0}
          max={100}
          autoFocus
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommit();
            if (event.key === "Escape") onCancel();
          }}
          aria-label={`Comissão de ${employee.name}`}
          className="h-11 w-[74px] rounded-lg border border-border bg-background px-2 text-right text-sm font-semibold tabular-nums"
        />
        <button
          type="button"
          aria-label="Salvar comissão"
          onClick={onCommit}
          disabled={pending}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={onCancel}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!canEdit || !ready}
      onClick={onStart}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 font-semibold tabular-nums text-foreground transition-colors hover:bg-accent/10 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {employee.commission.toFixed(2).replace(".", ",")}%
      {canEdit && ready && <Pencil className="h-3.5 w-3.5 text-accent" />}
    </button>
  );
}

function Page() {
  const { data: pro, isLoading: proLoading } = useMyProfessional();
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const timeZone = pro?.timezone ?? null;

  const [period, setPeriod] = useState<PeriodKey>("month");
  const [offset, setOffset] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const todayKey = useMemo(() => zonedTodayKey(timeZone), [timeZone]);
  const selectedKey = useMemo(
    () => anchorKey(todayKey, period, offset),
    [todayKey, period, offset],
  );
  const bounds = useMemo(
    () => periodBounds(selectedKey, period, from, to, timeZone),
    [selectedKey, period, from, to, timeZone],
  );

  const {
    data: raw,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["faturamento", pro?.id, bounds.start.toISOString(), bounds.end.toISOString()],
    enabled: !!pro?.id,
    queryFn: async () => {
      const proId = pro!.id;
      const appts: ApptRow[] = [];
      const PAGE = 1000;
      for (let range = 0; ; range += PAGE) {
        const { data, error } = await supabase
          .from(db.agendamentos)
          .select(
            "id, starts_at, employee_id, service_snapshot_name, service_snapshot_price_cents, status",
          )
          .eq("professional_id", proId)
          .gte("starts_at", bounds.start.toISOString())
          .lt("starts_at", bounds.end.toISOString())
          .order("starts_at", { ascending: true })
          .range(range, range + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as ApptRow[];
        appts.push(...page);
        if (page.length < PAGE) break;
      }

      let employees: EmployeeRow[] = [];
      let commissionReady = true;
      const withCommission = await supabase
        .from(db.funcionarios)
        .select("id, name, photo_url, is_active, commission_percent")
        .eq("professional_id", proId);
      if (withCommission.error) {
        const code = withCommission.error.code ?? "";
        const missingColumn =
          code === "42703" || /commission_percent/i.test(withCommission.error.message);
        if (!missingColumn) throw withCommission.error;
        commissionReady = false;
        const fallback = await supabase
          .from(db.funcionarios)
          .select("id, name, photo_url, is_active")
          .eq("professional_id", proId);
        if (fallback.error) throw fallback.error;
        employees = (fallback.data ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          photo_url: e.photo_url,
          is_active: e.is_active,
          commission_percent: 0,
        }));
      } else {
        employees = (withCommission.data ?? []) as EmployeeRow[];
      }

      return { appts, employees, commissionReady };
    },
  });

  const saveCommission = useMutation({
    mutationFn: async ({ id, percent }: { id: string; percent: number }) => {
      const { error } = await supabase
        .from(db.funcionarios)
        .update({ commission_percent: percent })
        .eq("id", id)
        .eq("professional_id", pro!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Comissão atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["faturamento"] });
    },
    onError: (error) => {
      toast.error(`Não foi possível salvar a comissão. ${error.message}`);
    },
  });

  const summary = useMemo(() => {
    if (!raw) return null;
    const active = raw.appts.filter((a) => a.status !== "cancelled");
    const gross = active.reduce((sum, a) => sum + a.service_snapshot_price_cents, 0);
    const byEmployee = new Map<string, EmployeeTotal>();
    for (const employee of raw.employees) {
      byEmployee.set(employee.id, {
        id: employee.id,
        name: employee.name,
        photo: employee.photo_url,
        atendimentos: 0,
        receita: 0,
        commission: Number(employee.commission_percent) || 0,
      });
    }
    let unassignedCount = 0;
    let unassignedRevenue = 0;
    for (const appt of active) {
      const employee = appt.employee_id ? byEmployee.get(appt.employee_id) : null;
      if (employee) {
        employee.atendimentos += 1;
        employee.receita += appt.service_snapshot_price_cents;
      } else {
        unassignedCount += 1;
        unassignedRevenue += appt.service_snapshot_price_cents;
      }
    }
    const employees = [...byEmployee.values()]
      .filter((e) => e.atendimentos > 0)
      .sort((a, b) => b.receita - a.receita);
    const commissions = employees.reduce(
      (sum, e) => sum + Math.round((e.receita * e.commission) / 100),
      0,
    );
    const byService = new Map<string, { name: string; quantidade: number; receita: number }>();
    for (const appt of active) {
      const entry = byService.get(appt.service_snapshot_name) ?? {
        name: appt.service_snapshot_name,
        quantidade: 0,
        receita: 0,
      };
      entry.quantidade += 1;
      entry.receita += appt.service_snapshot_price_cents;
      byService.set(appt.service_snapshot_name, entry);
    }
    return {
      gross,
      commissions,
      net: gross - commissions,
      atendimentos: active.length,
      ticket: active.length ? Math.round(gross / active.length) : 0,
      employees,
      unassignedCount,
      unassignedRevenue,
      services: [...byService.values()].sort((a, b) => b.receita - a.receita).slice(0, 6),
    };
  }, [raw]);

  const buckets = useMemo(
    () => (raw ? buildBuckets(raw.appts, bounds.start, bounds.end, timeZone) : null),
    [raw, bounds.start, bounds.end, timeZone],
  );

  function commitCommission(employee: EmployeeTotal) {
    const percent = Number(draft.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      toast.error("Informe um percentual entre 0 e 100.");
      return;
    }
    saveCommission.mutate({ id: employee.id, percent });
  }

  if (!proLoading && !pro) {
    return (
      <AppShell title="Faturamento">
        <OnboardingCard />
      </AppShell>
    );
  }

  const commissionRate = summary && summary.gross ? (summary.commissions / summary.gross) * 100 : 0;
  const periodLabel = formatRange(bounds.start, bounds.end, timeZone);

  return (
    <AppShell title="Faturamento">
      {isError && (
        <div role="alert" className="card-elevated mb-4 p-4 text-sm text-destructive">
          Não foi possível carregar o faturamento. Tente novamente.
        </div>
      )}

      <section className="ui-card-glass relative animate-fade-in-up overflow-hidden p-4 sm:p-6">
        <span className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="ui-badge text-[10px] uppercase tracking-widest">Financeiro</span>
              <span className="text-xs font-semibold capitalize text-muted-foreground">
                {periodLabel}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Fechamento do período
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Entradas, comissões da equipe e o resultado do negócio em um só lugar.
            </p>
          </div>

          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
            <div
              className="flex w-full gap-1 overflow-x-auto scrollbar-slim touch-pan-x rounded-xl border border-border bg-background/70 p-1 sm:w-auto"
              role="tablist"
              aria-label="Período do faturamento"
            >
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={period === item.key}
                  data-selected={period === item.key}
                  onClick={() => {
                    if (item.key === "custom" && !from) {
                      setFrom(shiftKey(todayKey, -29));
                      setTo(todayKey);
                    }
                    setPeriod(item.key);
                    setOffset(0);
                    setEditing(null);
                  }}
                  className="min-h-[44px] shrink-0 rounded-lg px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:min-h-[40px] sm:px-4 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {period !== "custom" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Período anterior"
                  onClick={() => setOffset((value) => value - 1)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-background/70 transition-colors hover:bg-muted sm:h-9 sm:w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[130px] text-center text-xs font-semibold capitalize text-foreground">
                  {periodLabel}
                </span>
                <button
                  type="button"
                  aria-label="Próximo período"
                  onClick={() => setOffset((value) => value + 1)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-background/70 transition-colors hover:bg-muted sm:h-9 sm:w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {period === "custom" && (
          <div className="relative mt-5 border-t border-border/60 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
                  <CalendarRange className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold tracking-tight text-foreground">
                    Intervalo personalizado
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Toque em uma data para começar e em outra para terminar
                  </p>
                </div>
              </div>
              <span className="ui-badge text-[11px]">Toque para selecionar</span>
            </div>
            <Suspense
              fallback={
                <div className="skeleton h-72 rounded-xl" aria-label="Carregando calendário" />
              }
            >
              <PeriodCalendar
                from={from}
                to={to}
                todayKey={todayKey}
                timeZone={timeZone}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom);
                  setTo(nextTo);
                  setEditing(null);
                }}
              />
            </Suspense>
          </div>
        )}

        <div className="relative mt-6 grid gap-5 border-t border-border/60 pt-5 sm:grid-cols-3">
          {isLoading || proLoading || !summary ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="skeleton h-11 w-11 rounded-xl" />
                <div>
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton mt-2 h-6 w-28" />
                </div>
              </div>
            ))
          ) : (
            <>
              <Metric
                icon={Wallet}
                label="Entradas"
                value={formatBRL(summary.gross)}
                hint={`${summary.atendimentos} atendimento(s)`}
                tone="accent"
              />
              <Metric
                icon={Coins}
                label="Comissões"
                value={formatBRL(summary.commissions)}
                hint={`${commissionRate.toFixed(1).replace(".", ",")}% do bruto`}
                tone="warning"
              />
              <Metric
                icon={CircleDollarSign}
                label="Resultado"
                value={formatBRL(summary.net)}
                hint="bruto menos comissões"
                tone="success"
              />
            </>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]">
        <section className="card-elevated animate-fade-in-up p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Demonstrativo da equipe</h2>
                <p className="text-xs text-muted-foreground">
                  Toque no percentual para definir a comissão de cada profissional
                </p>
              </div>
            </div>
            {raw && !raw.commissionReady && (
              <span className="ui-badge text-[11px]">Migração de comissão pendente</span>
            )}
            {raw?.commissionReady && !canEdit && (
              <span className="ui-badge text-[11px]">Somente leitura</span>
            )}
          </div>

          {!summary || summary.employees.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum atendimento com funcionário no período.
            </p>
          ) : (
            <>
              <div className="hidden lg:block">
                <CardTable className="border-0 bg-transparent shadow-none">
                  <thead className="bg-muted/50">
                    <tr>
                      <DataTableHead>Profissional</DataTableHead>
                      <DataTableHead>Atend.</DataTableHead>
                      <DataTableHead>Receita</DataTableHead>
                      <DataTableHead className="text-right">Comissão</DataTableHead>
                      <DataTableHead className="text-right">A pagar</DataTableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.employees.map((employee) => {
                      const due = Math.round((employee.receita * employee.commission) / 100);
                      const isEditing = editing === employee.id;
                      return (
                        <DataTableRow key={employee.id}>
                          <DataTableCell>
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-xs font-bold text-accent">
                                {employee.photo ? (
                                  <img
                                    src={employee.photo}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  employee.name.slice(0, 2).toUpperCase()
                                )}
                              </span>
                              <span className="font-semibold text-foreground">{employee.name}</span>
                            </div>
                          </DataTableCell>
                          <DataTableCell className="tabular-nums">
                            {employee.atendimentos}
                          </DataTableCell>
                          <DataTableCell className="font-semibold tabular-nums">
                            {formatBRL(employee.receita)}
                          </DataTableCell>
                          <DataTableCell className="text-right">
                            <CommissionEditor
                              employee={employee}
                              editing={isEditing}
                              draft={draft}
                              canEdit={canEdit}
                              ready={!!raw?.commissionReady}
                              pending={saveCommission.isPending}
                              onStart={() => {
                                setEditing(employee.id);
                                setDraft(String(employee.commission).replace(".", ","));
                              }}
                              onDraft={setDraft}
                              onCommit={() => commitCommission(employee)}
                              onCancel={() => setEditing(null)}
                            />
                          </DataTableCell>
                          <DataTableCell className="text-right font-bold tabular-nums text-success">
                            {formatBRL(due)}
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/40">
                    <tr>
                      <DataTableCell className="font-bold">Total</DataTableCell>
                      <DataTableCell className="font-bold tabular-nums">
                        {summary.employees.reduce((sum, e) => sum + e.atendimentos, 0)}
                      </DataTableCell>
                      <DataTableCell className="font-bold tabular-nums">
                        {formatBRL(summary.employees.reduce((sum, e) => sum + e.receita, 0))}
                      </DataTableCell>
                      <DataTableCell />
                      <DataTableCell className="text-right font-bold tabular-nums text-success">
                        {formatBRL(summary.commissions)}
                      </DataTableCell>
                    </tr>
                  </tfoot>
                </CardTable>
              </div>

              <div className="space-y-3 lg:hidden">
                {summary.employees.map((employee) => {
                  const due = Math.round((employee.receita * employee.commission) / 100);
                  return (
                    <div
                      key={employee.id}
                      className="rounded-xl border border-border bg-background/50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-xs font-bold text-accent">
                          {employee.photo ? (
                            <img
                              src={employee.photo}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            employee.name.slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-foreground">{employee.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {employee.atendimentos} atendimento(s) ·{" "}
                            <span className="font-semibold text-foreground">
                              {formatBRL(employee.receita)}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Comissão
                          </p>
                          <CommissionEditor
                            employee={employee}
                            editing={editing === employee.id}
                            draft={draft}
                            canEdit={canEdit}
                            ready={!!raw?.commissionReady}
                            pending={saveCommission.isPending}
                            onStart={() => {
                              setEditing(employee.id);
                              setDraft(String(employee.commission).replace(".", ","));
                            }}
                            onDraft={setDraft}
                            onCommit={() => commitCommission(employee)}
                            onCancel={() => setEditing(null)}
                          />
                        </div>
                        <div className="text-right">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            A pagar
                          </p>
                          <p className="pt-2.5 text-base font-black tabular-nums text-success">
                            {formatBRL(due)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                  <span className="text-sm font-bold text-foreground">Total da equipe</span>
                  <span className="text-sm font-black tabular-nums text-success">
                    {formatBRL(summary.commissions)}
                  </span>
                </div>
              </div>
            </>
          )}

          {summary && summary.unassignedCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {summary.unassignedCount} atendimento(s) sem responsável:{" "}
              <span className="font-semibold text-foreground">
                {formatBRL(summary.unassignedRevenue)}
              </span>
              . Contam no bruto, mas não geram comissão.
            </p>
          )}
        </section>

        <aside className="card-elevated animate-fade-in-up p-5">
          <div className="flex items-center gap-3">
            <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Fechamento</h2>
              <p className="text-xs text-muted-foreground">Resumo contábil do período</p>
            </div>
          </div>

          {!summary ? (
            <div className="skeleton mt-5 h-52" role="status" aria-label="Carregando fechamento" />
          ) : (
            <>
              <dl className="mt-6 space-y-4">
                <LedgerRow label="Receita bruta" value={formatBRL(summary.gross)} />
                <LedgerRow
                  label="Comissões da equipe"
                  value={`− ${formatBRL(summary.commissions)}`}
                  danger
                />
                <div className="border-t border-border/60 pt-4">
                  <LedgerRow label="Resultado líquido" value={formatBRL(summary.net)} strong />
                </div>
                <LedgerRow label="Atendimentos" value={String(summary.atendimentos)} />
                <LedgerRow label="Ticket médio" value={formatBRL(summary.ticket)} />
              </dl>
              <div className="mt-6">
                <div className="mb-2 flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Comissões sobre o bruto</span>
                  <span className="tabular-nums text-foreground">
                    {commissionRate.toFixed(1).replace(".", ",")}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-warning transition-[width] duration-500"
                    style={{ width: `${Math.min(commissionRate, 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {buckets && buckets.buckets.length > 0 && (
        <section className="card-elevated mt-6 animate-fade-in-up p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
                <TrendingUp className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Evolução do faturamento</h2>
                <p className="text-xs text-muted-foreground">
                  {buckets.byMonth ? "Visão mensal" : "Visão diária"} · clique numa barra para
                  destacar
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Total no período
              </p>
              <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                {formatBRL(Math.round(buckets.buckets.reduce((sum, b) => sum + b.receita, 0)))}
              </p>
            </div>
          </div>
          <RevenueChart buckets={buckets.buckets} byMonth={buckets.byMonth} />
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card-elevated animate-fade-in-up p-5">
          <div className="flex items-center gap-3">
            <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
              <Receipt className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">Receita por serviço</h2>
          </div>
          {!summary || summary.services.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {summary.services.map((service) => {
                const percent = summary.gross ? (service.receita / summary.gross) * 100 : 0;
                return (
                  <div key={service.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-foreground">
                        {service.name}
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {formatBRL(service.receita)} · {percent.toFixed(1).replace(".", ",")}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent/50 to-accent transition-[width] duration-500"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card-elevated animate-fade-in-up p-5">
          <div className="flex items-center gap-3">
            <span className="ui-icon-bubble grid h-10 w-10 place-items-center rounded-xl">
              <Info className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">Regras do cálculo</h2>
          </div>
          <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Entradas:</span> soma dos agendamentos
              confirmados e concluídos no período, no fuso do negócio.
            </p>
            <p>
              <span className="font-semibold text-foreground">Comissão:</span> percentual definido
              para cada profissional, aplicado à receita dos atendimentos atribuídos a ele.
            </p>
            <p>
              <span className="font-semibold text-foreground">Cancelamentos</span> não entram em
              nenhum cálculo.
            </p>
            <p>
              Alterar o percentual exige papel de admin ou editor; a gravação é protegida por RLS.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        Período: <span className="font-semibold capitalize text-foreground">{periodLabel}</span>
      </div>
    </AppShell>
  );
}
