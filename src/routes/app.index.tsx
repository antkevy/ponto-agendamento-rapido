import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { AppShell } from "@/components/app-shell";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/booking";
import { Calendar, DollarSign, CheckCircle2, TrendingUp, ChevronLeft, ChevronRight, Percent } from "lucide-react";
import { OnboardingCard } from "@/components/onboarding-card";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Painel — Agendaí" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: pro, isLoading } = useMyProfessional();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
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

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", pro?.id, monthOffset],
    enabled: !!pro?.id,
    queryFn: async () => {
      const proId = pro!.id;

      const [current, previous, todayAppts, upcoming] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, starts_at, service_snapshot_name, service_snapshot_price_cents, status")
          .eq("professional_id", proId)
          .gte("starts_at", monthStart.toISOString())
          .lt("starts_at", monthEnd.toISOString()),
        supabase
          .from("appointments")
          .select("id, starts_at, service_snapshot_name, service_snapshot_price_cents, status")
          .eq("professional_id", proId)
          .gte("starts_at", prevMonthStart.toISOString())
          .lt("starts_at", prevMonthEnd.toISOString()),
        supabase
          .from("appointments")
          .select("id, starts_at, client_name, service_snapshot_name, status")
          .eq("professional_id", proId)
          .gte("starts_at", today.toISOString())
          .lt("starts_at", new Date(today.getTime() + 86400000).toISOString())
          .order("starts_at"),
        supabase
          .from("appointments")
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
      allCurrent.filter((a) => a.status !== "cancelled").forEach((a) => {
        const day = a.starts_at.slice(0, 10);
        dailyRevenue[day] = (dailyRevenue[day] ?? 0) + a.service_snapshot_price_cents;
      });

      const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
        const key = d.toISOString().slice(0, 10);
        return { day: i + 1, receita: dailyRevenue[key] ?? 0 };
      });

      const serviceRevenue: Record<string, { receita: number; count: number }> = {};
      allCurrent.filter((a) => a.status !== "cancelled").forEach((a) => {
        const name = a.service_snapshot_name;
        if (!serviceRevenue[name]) serviceRevenue[name] = { receita: 0, count: 0 };
        serviceRevenue[name].receita += a.service_snapshot_price_cents;
        serviceRevenue[name].count += 1;
      });
      const serviceData = Object.entries(serviceRevenue)
        .map(([name, v]) => ({ name, receita: v.receita, count: v.count }))
        .sort((a, b) => b.receita - a.receita);

      const statusData = [
        { name: "Confirmados", value: confirmed.length, color: "var(--color-accent, #0284C7)" },
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

  const COLORS = ["#0284C7", "#16A34A", "#DC2626", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

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
              <button onClick={() => setMonthOffset((p) => p - 1)} className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"><ChevronLeft className="h-4 w-4" /></button>
              <span className="font-bold capitalize text-lg">{monthLabel}</span>
              <button onClick={() => setMonthOffset((p) => p + 1)} className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"><ChevronRight className="h-4 w-4" /></button>
              {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} className="text-xs text-accent hover:underline ml-2">Voltar ao mês atual</button>}
            </div>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Calendar} label="Hoje" value={String(stats?.today.length ?? 0)} hint="agendamentos" />
            <StatCard icon={CheckCircle2} label="Atendimentos" value={String(stats?.monthCount ?? 0)} hint="no mês" />
            <StatCard icon={DollarSign} label="Receita" value={formatBRL(stats?.totalRevenue ?? 0)} hint="confirmado + concluído" />
            <StatCard icon={TrendingUp} label="Ticket médio" value={formatBRL(stats?.avgTicket ?? 0)} hint="por concluído" />
          </div>

          {stats && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">Receita diária</h3>
                {stats.dailyData.every((d) => d.receita === 0) ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #E2E8F0)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground, #94A3B8)" tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground, #94A3B8)" tickLine={false} tickFormatter={(v: number) => `R${(v / 100).toFixed(0)}`} />
                      <Tooltip
                        formatter={(v: number) => [formatBRL(v), "Receita"]}
                        labelFormatter={(l: number) => `Dia ${l}`}
                        contentStyle={{ borderRadius: "12px", border: "1px solid var(--color-border, #E2E8F0)", background: "var(--color-background, #FFF)", fontSize: "13px" }}
                      />
                      <Bar dataKey="receita" fill="oklch(0.55 0.18 250)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">Receita por serviço</h3>
                {stats.serviceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado no período.</p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={stats.serviceData} dataKey="receita" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {stats.serviceData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [formatBRL(v), "Receita"]}
                          contentStyle={{ borderRadius: "12px", border: "1px solid var(--color-border, #E2E8F0)", background: "var(--color-background, #FFF)", fontSize: "13px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="shrink-0 space-y-1.5 text-sm w-full sm:w-auto">
                      {stats.serviceData.map((s, i) => (
                        <div key={s.name} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="truncate max-w-[120px]">{s.name}</span>
                          <span className="font-semibold ml-auto">{formatBRL(s.receita)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {stats && (stats.prevRevenue > 0 || stats.prevCount > 0) && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="card-elevated p-5">
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">Comparação com mês anterior</h3>
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
                <h3 className="text-lg font-bold tracking-tight text-foreground mb-4">Status dos agendamentos</h3>
                {stats.statusData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado no período.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={stats.statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                          {stats.statusData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "1px solid var(--color-border, #E2E8F0)", background: "var(--color-background, #FFF)", fontSize: "13px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="shrink-0 space-y-2 text-sm">
                      {stats.statusData.map((s, i) => (
                        <div key={s.name} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span>{s.name}</span>
                          <span className="font-semibold">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <section className="mt-6 card-elevated p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground mb-4">Agendamentos de hoje</h2>
            {(stats?.today.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum agendamento hoje.</p>
            ) : (
              <ul className="divide-y divide-border">
                {stats!.today.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.client_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{a.service_snapshot_name}</p>
                    </div>
                    <span className="text-sm font-mono shrink-0">{new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 card-elevated p-5">
            <h2 className="text-xl font-black tracking-tight text-foreground mb-4">Próximos agendamentos</h2>
            {(stats?.upcoming.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nada agendado ainda. <Link to="/app/agendamentos" className="text-accent hover:underline">Ver todos</Link></p>
            ) : (
              <ul className="divide-y divide-border">
                {stats!.upcoming.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.client_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{a.service_snapshot_name}</p>
                    </div>
                    <span className="text-sm shrink-0">{new Date(a.starts_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
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

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Calendar; label: string; value: string; hint: string }) {
  return (
    <div className="card-elevated p-5 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function ComparisonBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold mt-1 ${isUp ? "text-success" : "text-destructive"}`}>
      {isUp ? "+" : ""}{pct.toFixed(1)}%
      <Percent className="h-3 w-3" />
    </span>
  );
}
