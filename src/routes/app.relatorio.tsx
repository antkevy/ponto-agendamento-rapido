import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, ShoppingBag, Users, DollarSign, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL } from "@/lib/booking";

export const Route = createFileRoute("/app/relatorio")({
  head: () => ({ meta: [{ title: "Relatório — Agendaí" }] }),
  component: Page,
});

type ApptRow = {
  client_name: string;
  client_phone: string;
  employee_id: string | null;
  service_snapshot_name: string;
  service_snapshot_price_cents: number;
  status: string;
  starts_at: string;
};

type ClientSummary = { name: string; phone: string; visits: number; total: number };
type ServiceSummary = { name: string; qtd: number; receita: number };
type EmployeeSummary = { id: string; name: string; photo: string | null; servicos: number; receita: number; especialidade: string };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [offset, setOffset] = useState(0);

  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth() + offset, 1), [today, offset]);
  const monthEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d; }, [monthStart]);
  const monthLabel = monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const { data: raw } = useQuery({
    queryKey: ["relatorio", pro?.id, offset],
    enabled: !!pro?.id,
    queryFn: async () => {
      const proId = pro!.id;

      const [appts, employeesR, empServices, services] = await Promise.all([
        supabase
          .from("appointments")
          .select("client_name, client_phone, employee_id, service_snapshot_name, service_snapshot_price_cents, status, starts_at")
          .eq("professional_id", proId)
          .gte("starts_at", monthStart.toISOString())
          .lt("starts_at", monthEnd.toISOString()),
        supabase.from(db.funcionarios).select("id, name, photo_url").eq("professional_id", proId).eq("is_active", true),
        supabase.from(db.servicosFuncionario).select("employee_id, service_id"),
        supabase.from(db.servicos).select("id, name").eq("professional_id", proId),
      ]);

      return { appts: appts.data ?? [], employees: employeesR.data ?? [], empServices: empServices.data ?? [], services: services.data ?? [] };
    },
  });

  const clients = useMemo<ClientSummary[]>(() => {
    if (!raw) return [];
    const map = new Map<string, ClientSummary>();
    const active = raw.appts.filter((a) => a.status !== "cancelled");
    for (const a of active) {
      const key = `${a.client_name}|${a.client_phone}`;
      const existing = map.get(key);
      if (existing) {
        existing.visits += 1;
        existing.total += a.service_snapshot_price_cents;
      } else {
        map.set(key, { name: a.client_name, phone: a.client_phone, visits: 1, total: a.service_snapshot_price_cents });
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [raw]);

  const services = useMemo<ServiceSummary[]>(() => {
    if (!raw) return [];
    const map = new Map<string, ServiceSummary>();
    const active = raw.appts.filter((a) => a.status !== "cancelled");
    for (const a of active) {
      const existing = map.get(a.service_snapshot_name);
      if (existing) {
        existing.qtd += 1;
        existing.receita += a.service_snapshot_price_cents;
      } else {
        map.set(a.service_snapshot_name, { name: a.service_snapshot_name, qtd: 1, receita: a.service_snapshot_price_cents });
      }
    }
    return [...map.values()].sort((a, b) => b.receita - a.receita);
  }, [raw]);

  const employees = useMemo<EmployeeSummary[]>(() => {
    if (!raw) return [];
    const completed = raw.appts.filter((a) => a.status === "completed" && a.employee_id);
    const empMap = new Map<string, { servicos: number; receita: number; servicoCount: Map<string, number> }>();
    for (const a of completed) {
      const eid = a.employee_id!;
      if (!empMap.has(eid)) empMap.set(eid, { servicos: 0, receita: 0, servicoCount: new Map() });
      const e = empMap.get(eid)!;
      e.servicos += 1;
      e.receita += a.service_snapshot_price_cents;
      e.servicoCount.set(a.service_snapshot_name, (e.servicoCount.get(a.service_snapshot_name) ?? 0) + 1);
    }

    const serviceNames = new Map(raw.services.map((s) => [s.id, s.name]));
    const empSpecMap = new Map<string, string>();
    for (const es of raw.empServices) {
      if (!empSpecMap.has(es.employee_id)) {
        const sName = serviceNames.get(es.service_id);
        if (sName) empSpecMap.set(es.employee_id, sName);
      }
    }

    return raw.employees.map((emp) => {
      const data = empMap.get(emp.id);
      const servicos = data?.servicos ?? 0;
      const receita = data?.receita ?? 0;
      let especialidade = empSpecMap.get(emp.id) ?? "-";
      if (data && data.servicoCount.size > 0) {
        const top = [...data.servicoCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
        especialidade = top;
      }
      return { id: emp.id, name: emp.name, photo: emp.photo_url, servicos, receita, especialidade };
    }).sort((a, b) => b.receita - a.receita);
  }, [raw]);

  return (
    <AppShell title="Relatório">
      {isLoading ? (
        <div className="skeleton h-32" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setOffset((p) => p - 1)} className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"><ChevronLeft className="h-4 w-4" /></button>
              <span className="font-bold capitalize text-lg">{monthLabel}</span>
              <button onClick={() => setOffset((p) => p + 1)} className="p-2 min-h-[40px] min-w-[40px] grid place-items-center rounded-lg hover:bg-muted border border-border"><ChevronRight className="h-4 w-4" /></button>
              {offset !== 0 && <button onClick={() => setOffset(0)} className="text-xs text-accent hover:underline ml-2">Mês atual</button>}
            </div>
          </div>

          <Section icon={Users} title="Top clientes" subtitle="Clientes que mais geraram receita">
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-3 pr-4 font-medium">#</th>
                      <th className="text-left py-3 pr-4 font-medium">Cliente</th>
                      <th className="text-right py-3 pr-4 font-medium">Visitas</th>
                      <th className="text-right py-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c, i) => (
                      <tr key={`${c.name}|${c.phone}`} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4 text-muted-foreground w-8">{i + 1}</td>
                        <td className="py-3 pr-4 font-medium truncate max-w-[200px]">{c.name}</td>
                        <td className="py-3 pr-4 text-right">{c.visits}x</td>
                        <td className="py-3 text-right font-semibold">{formatBRL(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon={ShoppingBag} title="Serviços mais vendidos" subtitle="Desempenho por serviço">
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-3 pr-4 font-medium">#</th>
                      <th className="text-left py-3 pr-4 font-medium">Serviço</th>
                      <th className="text-right py-3 pr-4 font-medium">Qtd</th>
                      <th className="text-right py-3 font-medium">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, i) => (
                      <tr key={s.name} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4 text-muted-foreground w-8">{i + 1}</td>
                        <td className="py-3 pr-4 font-medium truncate max-w-[200px]">{s.name}</td>
                        <td className="py-3 pr-4 text-right">{s.qtd}</td>
                        <td className="py-3 text-right font-semibold">{formatBRL(s.receita)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon={TrendingUp} title="Desempenho da equipe" subtitle="Resultados por funcionário">
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-3 pr-4 font-medium">Funcionário</th>
                      <th className="text-left py-3 pr-4 font-medium">Especialidade</th>
                      <th className="text-right py-3 pr-4 font-medium">Concluídos</th>
                      <th className="text-right py-3 font-medium">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {e.photo ? (
                              <img src={e.photo} alt="" className="h-8 w-8 rounded-full object-cover border border-border" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-xs font-semibold text-muted-foreground">{e.name.charAt(0)}</div>
                            )}
                            <span className="font-medium truncate max-w-[150px]">{e.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground truncate max-w-[150px]">{e.especialidade}</td>
                        <td className="py-3 pr-4 text-right">{e.servicos}</td>
                        <td className="py-3 text-right font-semibold">{formatBRL(e.receita)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </AppShell>
  );
}

function Section({ icon: Icon, title, subtitle, children }: { icon: typeof TrendingUp; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card-elevated p-5 mb-6 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-1">
        <Icon className="h-5 w-5 text-accent" />
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
      {children}
    </section>
  );
}
