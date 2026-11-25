import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Info,
  Pencil,
  Receipt,
  Users,
  Wallet,
  X,
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
import { StatCard } from "@/components/ui/stat-card";

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

const pad = (n: number) => String(n).padStart(2, "0");

function civilDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDateKey(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

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

function RevenueChart({ buckets, byMonth }: { buckets: Bucket[]; byMonth: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.receita));
  const total = buckets.reduce((sum, b) => sum + b.receita, 0);
  const active = buckets.find((b) => b.key === selected);
  const step = Math.max(1, Math.ceil(buckets.length / (byMonth ? 12 : 14)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {active ? active.label : "Total no período"}
          </p>
          {active && (
            <p className="text-[11px] text-muted-foreground">Clique na barra para fixar</p>
          )}
        </div>
        <p className="text-xl font-black tabular-nums tracking-tight text-foreground">
          {formatBRL(Math.round(active?.receita ?? total))}
        </p>
      </div>
      <div className="overflow-x-auto scrollbar-slim">
        <div className="flex h-44 min-w-max items-end gap-1 pt-8">
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
                  className={`w-full rounded-t-[4px] transition-colors ${
                    isSelected
                      ? "bg-accent"
                      : bucket.receita === 0
                        ? "bg-muted-foreground/15"
                        : "bg-accent/45 group-hover:bg-accent/80"
                  }`}
                  style={{ height: `${height}%` }}
                />
                <div
                  className={`pointer-events-none absolute -top-1 -translate-y-full whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold shadow-lg transition-opacity z-10 ${
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
    </div>
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

  return (
    <AppShell title="Faturamento">
      <OnboardingCard />

      <div className="card-elevated p-5 animate-fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Período
            </p>
            <p className="text-lg font-bold tracking-tight capitalize text-foreground">
              {formatRange(bounds.start, bounds.end, timeZone)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  data-selected={period === item.key}
                  onClick={() => {
                    setPeriod(item.key);
                    setOffset(0);
                    setEditing(null);
                  }}
                  className="chip"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {period !== "custom" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Período anterior"
                  onClick={() => setOffset((value) => value - 1)}
                  className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-border hover:bg-muted/60 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Próximo período"
                  onClick={() => setOffset((value) => value + 1)}
                  className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-border hover:bg-muted/60 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        {period === "custom" && (
          <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">De</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Até</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setFrom(todayKey);
                setTo(todayKey);
              }}
              className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted/60 transition-colors"
            >
              Hoje
            </button>
          </div>
        )}
      </div>

      {isError && (
        <div role="alert" className="card-elevated mt-4 p-4 text-sm text-destructive">
          Não foi possível carregar o faturamento. Tente novamente.
        </div>
      )}

      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || proLoading || !summary ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card-elevated p-5" role="status" aria-label="Carregando">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 h-9 w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              icon={Wallet}
              label="Faturamento bruto"
              value={summary.gross}
              hint="agendamentos ativos"
              tone="success"
              ticker
              formatTicker={(value) => formatBRL(Math.round(value))}
            />
            <StatCard
              icon={Users}
              label="Comissões"
              value={summary.commissions}
              hint="somando a equipe"
              tone="accent"
              ticker
              formatTicker={(value) => formatBRL(Math.round(value))}
            />
            <StatCard
              icon={CircleDollarSign}
              label="Após comissões"
              value={summary.net}
              hint="bruto menos comissões"
              tone="brand"
              ticker
              formatTicker={(value) => formatBRL(Math.round(value))}
            />
            <StatCard
              icon={Receipt}
              label="Atendimentos"
              value={summary.atendimentos}
              hint={`ticket médio ${formatBRL(summary.ticket)}`}
              tone="warning"
              ticker
            />
          </>
        )}
      </div>

      {buckets && buckets.buckets.length > 0 && (
        <div className="card-elevated mt-6 p-5 animate-fade-in-up">
          <div className="mb-5 flex items-center gap-3">
            <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Evolução do faturamento</h2>
              <p className="text-xs text-muted-foreground">
                {buckets.byMonth ? "Por mês" : "Por dia"} · clique numa barra para fixar o valor
              </p>
            </div>
          </div>
          <RevenueChart buckets={buckets.buckets} byMonth={buckets.byMonth} />
        </div>
      )}

      <div className="card-elevated mt-6 p-5 animate-fade-in-up">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Comissão por funcionário</h2>
              <p className="text-xs text-muted-foreground">
                Percentual configurável sobre a receita de cada atendimento
              </p>
            </div>
          </div>
          {raw && !raw.commissionReady && (
            <span className="ui-badge text-[11px]">Aplique a migração de comissão para editar</span>
          )}
          {raw?.commissionReady && !canEdit && (
            <span className="ui-badge text-[11px]">Somente leitura</span>
          )}
        </div>

        {!summary || summary.employees.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum atendimento com funcionário no período.
          </p>
        ) : (
          <CardTable className="border-0 bg-transparent shadow-none">
            <thead className="bg-muted/50">
              <tr>
                <DataTableHead>Funcionário</DataTableHead>
                <DataTableHead>Atendimentos</DataTableHead>
                <DataTableHead>Receita</DataTableHead>
                <DataTableHead className="text-right">Comissão</DataTableHead>
                <DataTableHead className="text-right">Valor devido</DataTableHead>
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
                    <DataTableCell className="tabular-nums">{employee.atendimentos}</DataTableCell>
                    <DataTableCell className="font-semibold tabular-nums">
                      {formatBRL(employee.receita)}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            autoFocus
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") commitCommission(employee);
                              if (event.key === "Escape") setEditing(null);
                            }}
                            aria-label={`Comissão de ${employee.name}`}
                            className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums"
                          />
                          <button
                            type="button"
                            aria-label="Salvar comissão"
                            onClick={() => commitCommission(employee)}
                            disabled={saveCommission.isPending}
                            className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Cancelar"
                            onClick={() => setEditing(null)}
                            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted/60 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit || !raw?.commissionReady}
                          onClick={() => {
                            setEditing(employee.id);
                            setDraft(String(employee.commission).replace(".", ","));
                          }}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 font-semibold tabular-nums text-foreground hover:bg-accent/10 disabled:cursor-default disabled:hover:bg-transparent transition-colors"
                        >
                          {employee.commission.toFixed(2).replace(".", ",")}%
                          {canEdit && raw?.commissionReady && (
                            <Pencil className="h-3 w-3 text-accent" />
                          )}
                        </button>
                      )}
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
        )}

        {summary && summary.unassignedCount > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            {summary.unassignedCount} atendimento(s) sem funcionário responsável:{" "}
            <span className="font-semibold text-foreground">
              {formatBRL(summary.unassignedRevenue)}
            </span>
            . Eles entram no faturamento bruto, mas não geram comissão.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card-elevated p-5 animate-fade-in-up">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Receita por serviço</h2>
          {!summary || summary.services.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
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
                        className="h-full rounded-full bg-accent transition-[width] duration-500"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-elevated p-5 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
              <Info className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">Como o valor é calculado</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">Faturamento bruto:</span> soma dos
              agendamentos ativos (confirmados e concluídos) no período escolhido.
            </li>
            <li>
              <span className="font-semibold text-foreground">Comissão:</span> percentual definido
              para cada funcionário, aplicado sobre a receita dos atendimentos atribuídos a ele.
            </li>
            <li>
              <span className="font-semibold text-foreground">Cancelamentos</span> não entram em
              nenhum cálculo.
            </li>
            <li>
              A edição do percentual exige papel de admin ou editor e é registrada pelo banco.
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
