import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/booking";
import { Calendar, DollarSign, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OnboardingCard } from "@/components/onboarding-card";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Painel — Agendaí" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: pro, isLoading } = useMyProfessional();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const [today, upcoming, month] = await Promise.all([
        supabase.from("appointments").select("id, starts_at, client_name, service_snapshot_name, status").eq("professional_id", pro!.id).gte("starts_at", startOfToday.toISOString()).lt("starts_at", endOfToday.toISOString()).order("starts_at"),
        supabase.from("appointments").select("id, starts_at, client_name, service_snapshot_name, status").eq("professional_id", pro!.id).eq("status", "confirmed").gte("starts_at", endOfToday.toISOString()).order("starts_at").limit(5),
        supabase.from("appointments").select("id, service_snapshot_price_cents, status").eq("professional_id", pro!.id).gte("starts_at", startOfMonth.toISOString()).lt("starts_at", endOfMonth.toISOString()),
      ]);
      const monthRevenue = (month.data ?? []).filter((a) => a.status !== "cancelled").reduce((sum, a) => sum + a.service_snapshot_price_cents, 0);
      const monthCount = (month.data ?? []).filter((a) => a.status !== "cancelled").length;
      return { today: today.data ?? [], upcoming: upcoming.data ?? [], monthRevenue, monthCount };
    },
  });

  return (
    <AppShell title="Painel">
      {isLoading ? (
        <div className="skeleton h-32" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-primary text-primary-foreground">
            <div>
              <p className="text-xs opacity-80">Sua página pública</p>
              <p className="font-mono text-sm break-all">/p/{pro.slug}</p>
            </div>
            <a
              href={`/p/${pro.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-background text-primary font-semibold rounded-lg px-4 py-2 min-h-[44px] hover:bg-secondary transition"
            >
              <ExternalLink className="h-4 w-4" /> Ver página
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Calendar} label="Hoje" value={String(stats?.today.length ?? 0)} hint="agendamentos" />
            <StatCard icon={CheckCircle2} label="Este mês" value={String(stats?.monthCount ?? 0)} hint="atendimentos" />
            <StatCard icon={DollarSign} label="Receita do mês" value={formatBRL(stats?.monthRevenue ?? 0)} hint="estimada" />
          </div>

          <section className="mt-8 card-elevated p-5">
            <h2 className="text-xl font-semibold text-primary mb-4">Agendamentos de hoje</h2>
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
            <h2 className="text-xl font-semibold text-primary mb-4">Próximos agendamentos</h2>
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
      <p className="mt-2 text-3xl font-semibold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
