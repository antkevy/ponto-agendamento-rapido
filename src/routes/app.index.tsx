import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL } from "@/lib/booking";
import {
  Calendar,
  DollarSign,
  CheckCircle2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Percent,
  RefreshCw,
} from "lucide-react";
import { OnboardingCard } from "@/components/onboarding-card";
import { StatCard } from "@/components/ui/stat-card";

const COLORS = ["#0284C7", "#16A34A", "#DC2626", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Painel — Agendaí" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: pro, isLoading } = useMyProfessional();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [monthOffset, setMonthOffset] = useState(0);
  const currentMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  const monthStart = useMemo(() => new Date(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [currentMonth]);

  const prevMonthStart = useMemo(() => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    return d;
  }, [currentMonth]);
  const prevMonthEnd = useMemo(() => new Date(monthStart), [monthStart]);

  const {
    data: stats,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dashboard-stats", pro?.id, monthOffset],
    enabled: !!pro?.id,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const proId = pro!.id;

      const [current, previous, todayAppts, upcoming] = await Promise.all([
        supabase
          .from(db.agendamentos)
          .select("id, starts_at, service_snapshot_name, service_snapshot_price_cents, status")
          .eq("professional_id", proId)
          .gte("starts_at", monthStart.toISOString())
          .lt("starts_at", monthEnd.toISOString()),
        supabase
          .from(db.agendamentos)
          .select("id, starts_at, service_snapshot_name, service_snapshot_price_cents, status")
          .eq("professional_id", proId)
          .gte("starts_at", prevMonthStart.toISOString())
          .lt("starts_at", prevMonthEnd.toISOString()),
        supabase
          .from(db.agendamentos)
          .select("id, starts_at, client_name, service_snapshot_name, status")
          .eq("professional_id", proId)
          .gte("starts_at", today.toISOString())
          .lt("starts_at", new Date(today.getTime() + 86400000).toISOString())
          .order("starts_at"),
        supabase
          .from(db.agendamentos)
          .select("id, starts_at, client_name, service_snapshot_name, status")
          .eq("professional_id", proId)
          .eq("status", "confirmed")
          .gte("starts_at", monthStart.toISOString())
          .lt("starts_at", monthEnd.toISOString())
          .order("starts_at")
          .limit(5),
      ]);

      const allCurrent = current.data ?? [];
      const allPrevious = previous.data ?? [];

      const confirmed = allCurrent.filter((a) => a.status === "confirmed");
      const completed = allCurrent.filter((a) => a.status === "completed");
      const cancelled = allCurrent.filter((a) => a.status === "cancelled");

      const revenueCompleted = completed.reduce((s, a) => s + a.service_snapshot_price_cents, 0);
      const revenueConfirmed = confirmed.reduce((s, a) => s + a.service_snapshot_price_cents, 0);
      const totalRevenue = revenueCompleted + revenueConfirmed;

      const prevCompleted = allPrevious.filter((a) => a.status === "completed");
      const prevRevenue = prevCompleted.reduce((s, a) => s + a.service_snapshot_price_cents, 0);
      const prevCount = allPrevious.filter((a) => a.status !== "cancelled").length;

      const dailyRevenue: Record<string, number> = {};
      allCurrent
        .filter((a) => a.status !== "cancelled")
        .forEach((a) => {
          const day = a.starts_at.slice(0, 10);
          dailyRevenue[day] = (dailyRevenue[day] ?? 0) + a.service_snapshot_price_cents;
        });

      const daysInMonth = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
      ).getDate();
      const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
        const key = d.toISOString().slice(0, 10);
        return { day: i + 1, receita: dailyRevenue[key] ?? 0 };
      });

      const serviceRevenue: Record<string, { receita: number; count: number }> = {};
      allCurrent
        .filter((a) => a.status !== "cancelled")
        .forEach((a) => {
          const name = a.service_snapshot_name;
          if (!serviceRevenue[name]) serviceRevenue[name] = { receita: 0, count: 0 };
          serviceRevenue[name].receita += a.service_snapshot_price_cents;
          serviceRevenue[name].count += 1;
        });
      const serviceData = Object.entries(serviceRevenue)
        .map(([name, v]) => ({ name, receita: v.receita, count: v.count }))
        .sort((a, b) => b.receita - a.receita);

      const statusData = [
        { name: "Agendados", value: confirmed.length, color: "var(--color-accent, #0284C7)" },
        { name: "Concluídos", value: completed.length, color: "var(--color-success, #16A34A)" },
        { name: "Cancelados", value: cancelled.length, color: "var(--color-destructive, #DC2626)" },
      ].filter((s) => s.value > 0);

      const avgTicket = completed.length > 0 ? Math.round(revenueCompleted / completed.length) : 0;

      return {
        today: todayAppts.data ?? [],
        upcoming: upcoming.data ?? [],
        revenueCompleted,
        revenueConfirmed,
        totalRevenue,
        monthCount: completed.length + confirmed.length,
        cancelledCount: cancelled.length,
        prevRevenue,
        prevCount,
        dailyData,
        serviceData,
        statusData,
        avgTicket,
      };
    },
  });

  const monthLabel = currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const pct = (current: number, previous: number) => {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  };

  return (
    <AppShell title="Painel">
      {isLoading ? (
        <div className="skeleton h-32" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonthOffset((p) => p - 1)}
                className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold capitalize text-lg">{monthLabel}</span>
              <button
                onClick={() => setMonthOffset((p) => p + 1)}
                className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {monthOffset !== 0 && (
                <button
                  onClick={() => setMonthOffset(0)}
                  className="text-xs text-accent hover:underline ml-2"
                >
                  Voltar ao mês atual
                </button>
              )}
            </div>
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-busy={isFetching || undefined}
              title="Atualizar dados"
              className={`p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg border transition-colors ${
                isFetching
                  ? "border-accent/40 bg-accent/10 text-accent disabled:opacity-100"
                  : "border-border text-muted-foreground hover:bg-muted disabled:opacity-60"
              }`}
            >
              <RefreshCw
                className={`h-4 w-4 origin-center transition-colors ${
                  isFetching ? "animate-spin text-accent" : "text-muted-foreground"
                }`}
              />
            </button>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {!stats ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-elevated p-5">
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton h-9 w-28 mt-3" />
                  <div className="skeleton h-3 w-24 mt-3" />
                </div>
              ))
            ) : (
              <>
                <StatCard
                  icon={Calendar}
                  label="Hoje"
                  value={stats.today.length}
                  hint="agendamentos"
                  tone="accent"
                  ticker
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Atendimentos"
                  value={stats.monthCount}
                  hint="no mês"
                  tone="brand"
                  trend={pct(stats.monthCount, stats.prevCount)}
                  ticker
                />
                <StatCard
                  icon={DollarSign}
                  label="Receita"
                  value={stats.totalRevenue}
                  hint="agendado + concluído"
                  tone="success"
                  trend={pct(stats.totalRevenue, stats.prevRevenue)}
                  ticker
                  formatTicker={(n) => formatBRL(Math.round(n))}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Ticket médio"
                  value={stats.avgTicket}
                  hint="por concluído"
                  tone="warning"
                  ticker
                  formatTicker={(n) => formatBRL(Math.round(n))}
                />
              </>
            )}
          </div>

          {stats && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">
                  Receita diária
                </h3>
                {stats.dailyData.every((d) => d.receita === 0) ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum dado no período.
                  </p>
                ) : (
                  <DailyRevenueChart data={stats.dailyData} />
                )}
              </div>

              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">
                  Receita por serviço
                </h3>
                {stats.serviceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum dado no período.
                  </p>
                ) : (
                  <ServiceBars data={stats.serviceData} />
                )}
              </div>
            </div>
          )}

          {stats && (stats.prevRevenue > 0 || stats.prevCount > 0) && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">
                  Comparação com mês anterior
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Receita</p>
                    <p className="text-xl font-black mt-1">{formatBRL(stats.totalRevenue)}</p>
                    <ComparisonBadge current={stats.totalRevenue} previous={stats.prevRevenue} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Atendimentos</p>
                    <p className="text-xl font-black mt-1">{stats.monthCount}</p>
                    <ComparisonBadge current={stats.monthCount} previous={stats.prevCount} />
                  </div>
                </div>
              </div>

              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">
                  Status dos agendamentos
                </h3>
                {stats.statusData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum dado no período.
                  </p>
                ) : (
                  <StatusBars data={stats.statusData} />
                )}
              </div>
            </div>
          )}

          <section className="mt-6 card-elevated p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground mb-4">
              Agendamentos de hoje
            </h2>
            {(stats?.today.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum agendamento hoje.</p>
            ) : (
              <ul className="divide-y divide-border">
                {stats!.today.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.client_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {a.service_snapshot_name}
                      </p>
                    </div>
                    <span className="text-sm font-mono shrink-0">
                      {new Date(a.starts_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 card-elevated p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground mb-4">
              Próximos agendamentos
            </h2>
            {(stats?.upcoming.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nada agendado ainda.{" "}
                <Link to="/app/agendamentos" className="text-accent hover:underline">
                  Ver todos
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {stats!.upcoming.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.client_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {a.service_snapshot_name}
                      </p>
                    </div>
                    <span className="text-sm shrink-0">
                      {new Date(a.starts_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function ComparisonBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold mt-1 ${isUp ? "text-success" : "text-destructive"}`}
    >
      {isUp ? "+" : ""}
      {pct.toFixed(1)}%
      <Percent className="h-3 w-3" />
    </span>
  );
}

function DailyRevenueChart({ data }: { data: { day: number; receita: number }[] }) {
  const max = Math.max(...data.map((d) => d.receita), 0);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="flex items-end gap-[3px] sm:gap-1 h-40 sm:h-48">
      {data.map((d) => {
        const isZero = d.receita === 0;
        const height = isZero ? 3 : Math.max((d.receita / max) * 100, 8);
        const isPeak = !isZero && d.receita === max;
        const isSelected = selected === d.day;
        return (
          <button
            key={d.day}
            type="button"
            onClick={() => setSelected(isSelected ? null : d.day)}
            aria-label={`Dia ${d.day} — ${formatBRL(d.receita)}`}
            className="group relative flex-1 h-full flex items-end"
          >
            <div
              className={`w-full rounded-t-[3px] transition-colors ${
                isPeak
                  ? "bg-accent"
                  : isZero
                    ? "bg-muted-foreground/15"
                    : "bg-accent/45 group-hover:bg-accent/80 group-active:bg-accent/80"
              }`}
              style={{ height: `${height}%` }}
              title={`Dia ${d.day} — ${formatBRL(d.receita)}`}
            />
            <div
              className={`pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold z-10 shadow-lg transition-opacity ${
                isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-active:opacity-100"
              }`}
            >
              {formatBRL(d.receita)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ServiceBars({ data }: { data: { name: string; receita: number; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.receita, 0) || 1;
  return (
    <div className="space-y-3.5">
      {data.map((s, i) => {
        const pct = (s.receita / total) * 100;
        return (
          <div key={s.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{s.name}</span>
              <span className="font-semibold shrink-0 tabular-nums">{formatBRL(s.receita)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-9 text-right tabular-nums shrink-0">
                {pct.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBars({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-3.5">
      {data.map((s) => {
        const pct = (s.value / total) * 100;
        return (
          <div key={s.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2 truncate">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
              <span className="font-semibold shrink-0 tabular-nums">{s.value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
