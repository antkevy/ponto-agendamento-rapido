import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ShoppingBag,
  Users,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL, zonedDateKey, zonedMonthBounds, zonedTodayKey } from "@/lib/booking";
import { optimizedImageUrl } from "@/lib/image";
import { CardTable, DataTableHead, DataTableRow, DataTableCell } from "@/components/ui/data-table";

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
type EmployeeSummary = {
  id: string;
  name: string;
  photo: string | null;
  servicos: number;
  receita: number;
  especialidade: string;
};

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const timeZone = pro?.timezone ?? null;
  const [offset, setOffset] = useState(0);

  const todayKey = useMemo(() => zonedTodayKey(timeZone), [timeZone]);
  const monthBounds = useMemo(() => {
    const [year, month] = todayKey.split("-").map(Number);
    const total = year * 12 + (month - 1) + offset;
    return zonedMonthBounds(Math.floor(total / 12), (total % 12) + 1, timeZone);
  }, [todayKey, offset, timeZone]);
  const monthStart = monthBounds.start;
  const monthEnd = monthBounds.end;
  const [labelYear, labelMonth] = zonedDateKey(monthStart, timeZone).split("-").map(Number);
  const monthLabel = new Date(labelYear, labelMonth - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const { data: raw, isError } = useQuery({
    queryKey: ["relatorio", pro?.id, offset, timeZone],
    enabled: !!pro?.id,
    queryFn: async () => {
      const proId = pro!.id;

      // PostgREST limita a 1000 linhas por padrão: paginar para não truncar o mês.
      const apptsData: ApptRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from(db.agendamentos)
          .select(
            "client_name, client_phone, employee_id, service_snapshot_name, service_snapshot_price_cents, status, starts_at",
          )
          .eq("professional_id", proId)
          .gte("starts_at", monthStart.toISOString())
          .lt("starts_at", monthEnd.toISOString())
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as ApptRow[];
        apptsData.push(...page);
        if (page.length < PAGE) break;
      }

      const [employeesR, servicesR] = await Promise.all([
        supabase
          .from(db.funcionarios)
          .select("id, name, photo_url")
          .eq("professional_id", proId)
          .eq("is_active", true),
        supabase.from(db.servicos).select("id, name").eq("professional_id", proId),
      ]);
      for (const r of [employeesR, servicesR]) {
        if (r.error) throw r.error;
      }

      // servicos_funcionario não tem professional_id: filtra pelos funcionários
      // deste negócio em vez de trazer vínculos de todos os tenants.
      const employeeIds = (employeesR.data ?? []).map((e) => e.id);
      let empServicesData: { employee_id: string; service_id: string }[] = [];
      if (employeeIds.length > 0) {
        const { data, error } = await supabase
          .from(db.servicosFuncionario)
          .select("employee_id, service_id")
          .in("employee_id", employeeIds);
        if (error) throw error;
        empServicesData = (data ?? []) as { employee_id: string; service_id: string }[];
      }

      return {
        appts: apptsData,
        employees: employeesR.data ?? [],
        empServices: empServicesData,
        services: servicesR.data ?? [],
      };
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
        map.set(key, {
          name: a.client_name,
          phone: a.client_phone,
          visits: 1,
          total: a.service_snapshot_price_cents,
        });
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
        map.set(a.service_snapshot_name, {
          name: a.service_snapshot_name,
          qtd: 1,
          receita: a.service_snapshot_price_cents,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.receita - a.receita);
  }, [raw]);

  const employees = useMemo<EmployeeSummary[]>(() => {
    if (!raw) return [];
    // Mesma métrica das tabelas de clientes e serviços: não-cancelados.
    const attributed = raw.appts.filter((a) => a.status !== "cancelled" && a.employee_id);
    const empMap = new Map<
      string,
      { servicos: number; receita: number; servicoCount: Map<string, number> }
    >();
    for (const a of attributed) {
      const eid = a.employee_id!;
      if (!empMap.has(eid)) empMap.set(eid, { servicos: 0, receita: 0, servicoCount: new Map() });
      const e = empMap.get(eid)!;
      e.servicos += 1;
      e.receita += a.service_snapshot_price_cents;
      e.servicoCount.set(
        a.service_snapshot_name,
        (e.servicoCount.get(a.service_snapshot_name) ?? 0) + 1,
      );
    }

    const serviceNames = new Map(raw.services.map((s) => [s.id, s.name]));
    const empSpecMap = new Map<string, string>();
    for (const es of raw.empServices) {
      if (!empSpecMap.has(es.employee_id)) {
        const sName = serviceNames.get(es.service_id);
        if (sName) empSpecMap.set(es.employee_id, sName);
      }
    }

    return raw.employees
      .map((emp) => {
        const data = empMap.get(emp.id);
        const servicos = data?.servicos ?? 0;
        const receita = data?.receita ?? 0;
        let especialidade = empSpecMap.get(emp.id) ?? "-";
        if (data && data.servicoCount.size > 0) {
          const top = [...data.servicoCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
          especialidade = top;
        }
        return {
          id: emp.id,
          name: emp.name,
          photo: emp.photo_url,
          servicos,
          receita,
          especialidade,
        };
      })
      .sort((a, b) => b.receita - a.receita);
  }, [raw]);

  return (
    <AppShell title="Relatório">
      {isLoading ? (
        <div className="skeleton h-32" role="status" aria-label="Carregando relatório" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset((p) => p - 1)}
                aria-label="Mês anterior"
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg hover:bg-muted border border-border"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold capitalize text-lg">{monthLabel}</span>
              <button
                type="button"
                onClick={() => setOffset((p) => p + 1)}
                aria-label="Próximo mês"
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-lg hover:bg-muted border border-border"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {offset !== 0 && (
                <button
                  type="button"
                  onClick={() => setOffset(0)}
                  className="min-h-[44px] px-2 text-xs text-accent hover:underline ml-2"
                >
                  Mês atual
                </button>
              )}
            </div>
          </div>

          {isError && (
            <div role="alert" className="card-elevated p-4 mb-6 text-sm text-destructive">
              Não foi possível carregar o relatório. Verifique sua conexão e tente novamente.
            </div>
          )}

          <Section icon={Users} title="Top clientes" subtitle="Clientes que mais geraram receita">
            {isError ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Dados indisponíveis no momento.
              </p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum dado no período.
              </p>
            ) : (
              <CardTable>
                <thead className="bg-muted/50 [&_tr]:border-b [&_tr]:border-border/60">
                  <tr>
                    <DataTableHead className="w-8">#</DataTableHead>
                    <DataTableHead>Cliente</DataTableHead>
                    <DataTableHead className="text-right">Visitas</DataTableHead>
                    <DataTableHead className="text-right">Total</DataTableHead>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <DataTableRow key={`${c.name}|${c.phone}`}>
                      <DataTableCell className="text-muted-foreground w-8">{i + 1}</DataTableCell>
                      <DataTableCell className="font-medium truncate max-w-[200px]">
                        {c.name}
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        {`${Math.round(c.visits)}x`}
                      </DataTableCell>
                      <DataTableCell className="text-right font-semibold">
                        {formatBRL(Math.round(c.total))}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </CardTable>
            )}
          </Section>

          <Section
            icon={ShoppingBag}
            title="Serviços mais vendidos"
            subtitle="Desempenho por serviço"
          >
            {isError ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Dados indisponíveis no momento.
              </p>
            ) : services.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum dado no período.
              </p>
            ) : (
              <CardTable>
                <thead className="bg-muted/50 [&_tr]:border-b [&_tr]:border-border/60">
                  <tr>
                    <DataTableHead className="w-8">#</DataTableHead>
                    <DataTableHead>Serviço</DataTableHead>
                    <DataTableHead className="text-right">Qtd</DataTableHead>
                    <DataTableHead className="text-right">Receita</DataTableHead>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <DataTableRow key={s.name}>
                      <DataTableCell className="text-muted-foreground w-8">{i + 1}</DataTableCell>
                      <DataTableCell className="font-medium truncate max-w-[200px]">
                        {s.name}
                      </DataTableCell>
                      <DataTableCell className="text-right">{s.qtd}</DataTableCell>
                      <DataTableCell className="text-right font-semibold">
                        {formatBRL(Math.round(s.receita))}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </CardTable>
            )}
          </Section>

          <Section
            icon={TrendingUp}
            title="Desempenho da equipe"
            subtitle="Agendamentos não cancelados por funcionário"
          >
            {isError ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Dados indisponíveis no momento.
              </p>
            ) : employees.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum dado no período.
              </p>
            ) : (
              <CardTable>
                <thead className="bg-muted/50 [&_tr]:border-b [&_tr]:border-border/60">
                  <tr>
                    <DataTableHead>Funcionário</DataTableHead>
                    <DataTableHead>Especialidade</DataTableHead>
                    <DataTableHead className="text-right">Concluídos</DataTableHead>
                    <DataTableHead className="text-right">Receita</DataTableHead>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <DataTableRow key={e.id}>
                      <DataTableCell>
                        <div className="flex items-center gap-2">
                          {e.photo ? (
                            <img
                              src={optimizedImageUrl(e.photo, 64) ?? e.photo}
                              alt=""
                              width={32}
                              height={32}
                              loading="lazy"
                              decoding="async"
                              className="h-8 w-8 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-xs font-semibold text-muted-foreground">
                              {e.name.charAt(0)}
                            </div>
                          )}
                          <span className="font-medium truncate max-w-[150px]">{e.name}</span>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground truncate max-w-[150px]">
                        {e.especialidade}
                      </DataTableCell>
                      <DataTableCell className="text-right">{e.servicos}</DataTableCell>
                      <DataTableCell className="text-right font-semibold">
                        {formatBRL(Math.round(e.receita))}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </CardTable>
            )}
          </Section>
        </>
      )}
    </AppShell>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof TrendingUp;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
