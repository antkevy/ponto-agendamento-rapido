import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  computeSlots,
  formatBRL,
  formatLongDate,
  formatTime,
  WEEKDAYS_PT_SHORT,
  type AvailabilityRow,
  type Block,
  type BusySlot,
} from "@/lib/booking";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhoneBR } from "@/lib/phone";
import { CheckCircle2, ChevronLeft, ChevronRight, MapPin, Clock, ArrowLeft, User } from "lucide-react";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const { data: pro, error } = await supabase.from("professionals").select("*").eq("slug", params.slug).maybeSingle();
    if (error) throw error;
    if (!pro) throw notFound();
    return { pro };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Página não encontrada — Agendaí" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.pro;
    return {
      meta: [
        { title: `Agendar com ${p.business_name} — Agendaí` },
        { name: "description", content: p.description || `Agende seu horário com ${p.business_name} online, 24h por dia.` },
        { property: "og:title", content: `Agendar com ${p.business_name}` },
        { property: "og:description", content: p.description || `Marque seu horário online com ${p.business_name}.` },
      ],
    };
  },
  component: BookingPage,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null; is_active: boolean };
type Employee = { id: string; name: string; photo_url: string | null; is_active: boolean };

type Step = "service" | "employee" | "when" | "form" | "done";

function BookingPage() {
  const { pro } = Route.useLoaderData();
  const brand = pro.brand_color || "#0284C7";

  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [when, setWhen] = useState<Date | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ["public-services", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("professional_id", pro.id)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data as Service[];
    },
  });

  // Load active employees + their service links (used to decide if the employee
  // step is shown and which employees can perform each service).
  const { data: employeesData } = useQuery({
    queryKey: ["public-employees", pro.id],
    queryFn: async () => {
      const { data: emps, error } = await supabase
        .from("employees")
        .select("id, name, photo_url, is_active")
        .eq("professional_id", pro.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const ids = (emps ?? []).map((e) => e.id);
      if (ids.length === 0) return { employees: [] as Employee[], links: [] as Array<{ employee_id: string; service_id: string }> };
      const { data: links, error: linkErr } = await supabase
        .from("employee_services")
        .select("employee_id, service_id")
        .in("employee_id", ids);
      if (linkErr) throw linkErr;
      return { employees: emps as Employee[], links: (links ?? []) as Array<{ employee_id: string; service_id: string }> };
    },
  });

  const eligibleEmployees = useMemo(() => {
    if (!employeesData || !service) return [] as Employee[];
    const linked = new Set(
      employeesData.links.filter((l) => l.service_id === service.id).map((l) => l.employee_id),
    );
    return employeesData.employees.filter((e) => linked.has(e.id));
  }, [employeesData, service]);

  const hasAnyEmployees = (employeesData?.employees.length ?? 0) > 0;

  function handleServicePick(s: Service) {
    setService(s);
    setEmployee(null);
    setWhen(null);
    // If the business has any employees configured, always go through the
    // employee step so the customer knows who will attend them.
    if (hasAnyEmployees) setStep("employee");
    else setStep("when");
  }

  function goBack() {
    if (step === "form") setStep("when");
    else if (step === "when") setStep(hasAnyEmployees ? "employee" : "service");
    else if (step === "employee") setStep("service");
  }

  return (
    <div
      className="min-h-screen"
      style={{
        ["--brand" as string]: brand,
        backgroundImage:
          "linear-gradient(180deg, oklch(0.97 0.02 250) 0%, oklch(0.99 0.008 250) 55%, #ffffff 100%)",
      } as React.CSSProperties}
    >
      <header className="bg-transparent">
        <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 flex items-start gap-4">
          {pro.logo_url ? (
            <img src={pro.logo_url} alt="" className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl object-cover border border-border shrink-0" />
          ) : (
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl grid place-items-center text-2xl font-bold text-white shrink-0 shadow-md" style={{ backgroundColor: brand }}>{pro.business_name.charAt(0).toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate leading-[1.1]">{pro.business_name}</h1>
            {pro.description && <p className="text-sm text-muted-foreground mt-1.5">{pro.description}</p>}
            {pro.address && <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {pro.address}</p>}
          </div>
        </div>
      </header>


      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        {step !== "service" && step !== "done" && (
          <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        )}

        {step === "service" && (
          <section className="animate-fade-in-up">
            <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">1. Escolha o serviço</h2>
            {loadingServices ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>
            ) : (services ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Este profissional ainda não cadastrou serviços.</p>
            ) : (
              <ul className="space-y-3">
                {services!.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => handleServicePick(s)}
                      className="w-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{s.name}</p>
                          {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
                          <p className="text-sm mt-2 inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {s.duration_minutes} minutos</p>
                        </div>
                        <span className="font-semibold text-primary shrink-0">{formatBRL(s.price_cents)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step === "employee" && service && (
          <section className="animate-fade-in-up">
            <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">2. Escolha o profissional</h2>
            <p className="text-sm text-muted-foreground mb-4">{service.name} · {service.duration_minutes} min</p>
            {eligibleEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum profissional disponível para esse serviço no momento.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {eligibleEmployees.map((emp) => (
                  <li key={emp.id}>
                    <button
                      onClick={() => { setEmployee(emp); setStep("when"); }}
                      className="w-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5 flex items-center gap-3"
                    >
                      {emp.photo_url ? (
                        <img src={emp.photo_url} alt="" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-full grid place-items-center bg-secondary shrink-0">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-semibold truncate">{emp.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step === "when" && service && (
          <WhenStep
            pro={pro}
            service={service}
            employee={employee}
            onPick={(d) => { setWhen(d); setStep("form"); }}
            brand={brand}
          />
        )}

        {step === "form" && service && when && (
          <FormStep
            pro={pro}
            service={service}
            employee={employee}
            when={when}
            brand={brand}
            onDone={(id) => { setConfirmedId(id); setStep("done"); }}
          />
        )}

        {step === "done" && service && when && confirmedId && (
          <DoneStep
            pro={pro}
            service={service}
            employee={employee}
            when={when}
            onReset={() => { setService(null); setEmployee(null); setWhen(null); setConfirmedId(null); setStep("service"); }}
          />
        )}
      </main>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        Agendamento por <a href="/" className="font-bold text-sm hover:underline" style={{ color: "oklch(0.55 0.18 250)" }}>Agendaí</a>
      </footer>
    </div>
  );
}

function WhenStep({ pro, service, employee, onPick, brand }: { pro: { id: string }; service: Service; employee: Employee | null; onPick: (d: Date) => void; brand: string }) {
  const [monthStart, setMonthStart] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Professional-wide availability (fallback when employee has none).
  const { data: proAvail } = useQuery({
    queryKey: ["public-avail", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("availability").select("*").eq("professional_id", pro.id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const { data: empAvail } = useQuery({
    queryKey: ["public-emp-avail", employee?.id],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_availability")
        .select("weekday, start_time, end_time")
        .eq("employee_id", employee!.id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const avail: AvailabilityRow[] | undefined = useMemo(() => {
    if (!employee) return proAvail;
    if (!empAvail || !proAvail) return undefined;
    // Use employee's own hours if defined; otherwise fall back to the business.
    return empAvail.length > 0 ? empAvail : proAvail;
  }, [employee, empAvail, proAvail]);

  const rangeStart = monthStart;
  const rangeEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d; }, [monthStart]);

  const { data: proBlocks } = useQuery({
    queryKey: ["public-blocks", pro.id, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("starts_at,ends_at")
        .eq("professional_id", pro.id)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: empBlocks } = useQuery({
    queryKey: ["public-emp-blocks", employee?.id, monthStart.toISOString()],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_blocks")
        .select("starts_at,ends_at")
        .eq("employee_id", employee!.id)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: busy, isLoading: loadingBusy } = useQuery({
    queryKey: ["public-busy", pro.id, employee?.id ?? "none", selectedDay?.toISOString()],
    enabled: !!selectedDay,
    queryFn: async () => {
      const from = new Date(selectedDay!); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      if (employee) {
        const { data, error } = await supabase.rpc("get_employee_busy_slots", { _employee_id: employee.id, _from: from.toISOString(), _to: to.toISOString() });
        if (error) throw error;
        return (data as BusySlot[]) ?? [];
      }
      const { data, error } = await supabase.rpc("get_busy_slots", { _professional_id: pro.id, _from: from.toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return (data as BusySlot[]) ?? [];
    },
  });

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const startWeekday = first.getDay();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    const end = new Date(monthStart); end.setMonth(end.getMonth() + 1);
    for (let d = new Date(first); d < end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const dayHasAvailability = (day: Date) => {
    if (!avail) return false;
    return avail.some((r) => r.weekday === day.getDay());
  };

  const combinedBlocks = useMemo<Block[]>(() => {
    const list: Block[] = [];
    if (proBlocks) list.push(...proBlocks);
    if (employee && empBlocks) list.push(...empBlocks);
    return list;
  }, [proBlocks, empBlocks, employee]);

  const slots = useMemo(() => {
    if (!selectedDay || !avail || !proBlocks || !busy) return [];
    if (employee && !empBlocks) return [];
    return computeSlots({
      day: selectedDay,
      serviceDurationMinutes: service.duration_minutes,
      availability: avail,
      blocks: combinedBlocks,
      busy,
    });
  }, [selectedDay, avail, proBlocks, empBlocks, busy, service.duration_minutes, employee, combinedBlocks]);

  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">{employee ? "3" : "2"}. Escolha data e horário</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {service.name} · {service.duration_minutes} min{employee ? ` · com ${employee.name}` : ""}
      </p>

      <div className="card-elevated p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() - 1); if (d >= new Date(today.getFullYear(), today.getMonth(), 1)) setMonthStart(d); }} className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <span className="font-semibold capitalize">{monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
          <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); setMonthStart(d); }} className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {WEEKDAYS_PT_SHORT.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {daysGrid.map((d, i) => {
            if (!d) return <div key={i} />;
            const past = d < today;
            const canSelect = !past && dayHasAvailability(d);
            const selected = selectedDay && d.toDateString() === selectedDay.toDateString();
            return (
              <button
                key={i}
                disabled={!canSelect}
                onClick={() => setSelectedDay(d)}
                data-selected={selected || undefined}
                className="aspect-square rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted transition-colors data-[selected]:text-white"
                style={selected ? { backgroundColor: brand } : undefined}
              >{d.getDate()}</button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="animate-fade-in-up">
          <h3 className="font-semibold mb-3 capitalize">{formatLongDate(selectedDay)}</h3>
          {loadingBusy ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-11" />)}</div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário livre nesse dia. Tente outro.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((s) => (
                <button key={s.toISOString()} onClick={() => onPick(s)} className="chip">
                  {formatTime(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FormStep({ pro, service, employee, when, onDone, brand }: { pro: { id: string }; service: Service; employee: Employee | null; when: Date; onDone: (id: string) => void; brand: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe seu nome.");
      if (!isValidPhoneBR(phone)) throw new Error("Informe um WhatsApp válido no formato (XX) XXXXX-XXXX.");
      const ends = new Date(when.getTime() + service.duration_minutes * 60 * 1000);
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          professional_id: pro.id,
          service_id: service.id,
          employee_id: employee?.id ?? null,
          starts_at: when.toISOString(),
          ends_at: ends.toISOString(),
          client_name: name.trim(),
          client_phone: phone,
          client_email: email.trim() || null,
          notes: notes.trim() || null,
          service_snapshot_name: service.name,
          service_snapshot_price_cents: service.price_cents,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => onDone(id),
    onError: (e: Error) => {
      const msg = e.message.includes("no_overlap_confirmed") || e.message.includes("exclusion")
        ? "Esse horário acabou de ser reservado. Escolha outro."
        : e.message;
      toast.error(msg);
    },
  });

  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">{employee ? "4" : "3"}. Seus dados</h2>
      <div className="card-elevated p-4 mb-4 text-sm">
        <p><strong>{service.name}</strong> · {formatBRL(service.price_cents)}</p>
        <p className="text-muted-foreground capitalize">{formatLongDate(when)} às {formatTime(when)}</p>
        {employee && <p className="text-muted-foreground mt-1">com {employee.name}</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
        <F label="Nome completo"><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={cls} /></F>
        <F label="WhatsApp"><PhoneInput value={phone} onChange={setPhone} className={cls} /></F>
        <F label="Email (opcional)"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cls} /></F>
        <F label="Observação (opcional)"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={cls} /></F>
        <button disabled={create.isPending} className="btn-gradient w-full inline-flex items-center justify-center disabled:opacity-60">
          {create.isPending ? "Confirmando..." : "Confirmar agendamento"}
        </button>

      </form>
    </section>
  );
}

function DoneStep({ pro, service, employee, when, onReset }: { pro: { business_name: string }; service: Service; employee: Employee | null; when: Date; onReset: () => void }) {
  return (
    <section className="text-center py-8 animate-fade-in-up">
      <div className="mx-auto w-20 h-20 rounded-full bg-success/10 grid place-items-center animate-check-in">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h2 className="mt-6 text-3xl font-black tracking-tight text-foreground">Agendamento confirmado!</h2>
      <p className="mt-2 text-muted-foreground">{pro.business_name} está te esperando.</p>
      <div className="mt-6 card-elevated p-4 max-w-sm mx-auto text-left">
        <p className="font-semibold">{service.name}</p>
        <p className="text-sm text-muted-foreground capitalize mt-1">{formatLongDate(when)}</p>
        <p className="text-sm text-muted-foreground">às {formatTime(when)}</p>
        {employee && <p className="text-sm text-muted-foreground mt-1">com {employee.name}</p>}
      </div>
      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2">
        <button onClick={onReset} className="btn-outline-brand">Fazer outro agendamento</button>
        <a href="/meus-agendamentos" className="btn-outline-brand">Ver meus agendamentos</a>
      </div>
    </section>
  );
}

const cls = "w-full min-h-[48px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
