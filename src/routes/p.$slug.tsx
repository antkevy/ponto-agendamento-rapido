import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
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
import {
  CheckCircle2, ChevronLeft, ChevronRight, MapPin, Clock, ArrowLeft, User, X, MessageCircle,
  Star, ChevronDown, Phone, Mail, Instagram, Facebook, Quote, Image as ImageIcon,
  Calendar, Sparkles, ShieldCheck, Target,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const { data: pro, error } = await supabase.from(db.profissionais).select("*").eq("slug", params.slug).maybeSingle();
    if (error) throw error;
    if (!pro) throw notFound();
    return { pro };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Página não encontrada — Agendaí" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.pro;
    return {
      meta: [
        { title: `${p.business_name} — Agende seu horário online` },
        { name: "description", content: p.description || `Agende seu horário com ${p.business_name} online, 24h por dia.` },
        { property: "og:title", content: p.business_name },
        { property: "og:description", content: p.description || `Marque seu horário online com ${p.business_name}.` },
        { property: "og:type", content: "website" },
        { property: "og:image", content: p.logo_url || undefined },
      ],
    };
  },
  component: BookingPage,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null; image_url: string | null; is_active: boolean };
type Employee = { id: string; name: string; photo_url: string | null; specialty: string | null; experience_years: number | null; bio: string | null };
type Plano = { id: string; name: string; description: string | null; price_cents: number; image_url: string | null };
type Depoimento = { id: string; client_name: string; client_photo: string | null; comment: string; rating: number };
type GaleriaItem = { id: string; image_url: string; caption: string | null; category: string };

type Step = "landing" | "service" | "employee" | "when" | "form" | "done";

function BookingPage() {
  const { pro } = Route.useLoaderData();
  const brand = pro.brand_color || "#0284C7";

  const [step, setStep] = useState<Step>("landing");
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [serviceView, setServiceView] = useState<"list" | "grid">("list");
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [when, setWhen] = useState<Date | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState<GaleriaItem | null>(null);

  const { data: planos } = useQuery({
    queryKey: ["public-planos", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.planos).select("*").eq("professional_id", pro.id).eq("is_active", true).order("price_cents");
      if (error) throw error;
      return data as Plano[];
    },
  });

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ["public-services", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.servicos).select("*").eq("professional_id", pro.id).eq("is_active", true).order("created_at");
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: employeesData } = useQuery({
    queryKey: ["public-employees", pro.id],
    queryFn: async () => {
      const { data: emps } = await supabase.from(db.funcionarios).select("id, name, photo_url, specialty, experience_years, bio").eq("professional_id", pro.id).eq("is_active", true).order("name");
      const ids = (emps ?? []).map((e) => e.id);
      if (ids.length === 0) return { employees: [] as Employee[], links: [] as Array<{ employee_id: string; service_id: string }> };
      const { data: links } = await supabase.from(db.servicosFuncionario).select("employee_id, service_id").in("employee_id", ids);
      return { employees: (emps ?? []) as Employee[], links: (links ?? []) as Array<{ employee_id: string; service_id: string }> };
    },
  });

  const { data: depoimentos } = useQuery({
    queryKey: ["public-depoimentos", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.depoimentos).select("*").eq("professional_id", pro.id).eq("is_visible", true).order("rating", { ascending: false }).order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as Depoimento[];
    },
  });

  const { data: galeria } = useQuery({
    queryKey: ["public-galeria", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.galeria).select("*").eq("professional_id", pro.id).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as GaleriaItem[];
    },
  });

  const { data: faq } = useQuery({
    queryKey: ["public-faq", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("faq").select("*").eq("professional_id", pro.id).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; question: string; answer: string }>;
    },
  });

  const { data: clientCount } = useQuery({
    queryKey: ["public-client-count", pro.id],
    queryFn: async () => {
      const { count } = await supabase.from(db.agendamentos).select("*", { count: "exact", head: true }).eq("professional_id", pro.id);
      return count ?? 0;
    },
  });

  const eligibleEmployees = useMemo(() => {
    if (!employeesData || selectedServices.length === 0) return [] as Employee[];
    const serviceIds = new Set(selectedServices.map((s) => s.id));
    const linked = new Set(employeesData.links.filter((l) => serviceIds.has(l.service_id)).map((l) => l.employee_id));
    return employeesData.employees.filter((e) => linked.has(e.id));
  }, [employeesData, selectedServices]);

  const hasAnyEmployees = (employeesData?.employees.length ?? 0) > 0;

  function toggleService(s: Service) {
    setSelectedServices((prev) => prev.some((x) => x.id === s.id) ? prev.filter((x) => x.id !== s.id) : [...prev, s]);
  }

  function proceedFromServices() {
    setEmployee(null); setWhen(null);
    if (hasAnyEmployees) setStep("employee"); else setStep("when");
  }

  function goBack() {
    if (step === "form") setStep("when");
    else if (step === "when") setStep(hasAnyEmployees ? "employee" : "service");
    else if (step === "employee") setStep("service");
    else if (step === "service") setStep("landing");
    else if (step === "done") { setSelectedServices([]); setEmployee(null); setWhen(null); setConfirmedId(null); setStep("landing"); }
  }

  return (
    <div className="min-h-screen bg-background" style={{ "--brand": brand } as React.CSSProperties}>
      {step === "landing" ? (
        <LandingPage
          pro={pro}
          planos={planos ?? []}
          services={services ?? []}
          loadingServices={loadingServices}
          employees={employeesData?.employees ?? []}
          depoimentos={depoimentos ?? []}
          galeria={galeria ?? []}
          faq={faq ?? []}
          clientCount={clientCount ?? 0}
          onAgendar={() => setStep("service")}
          onSelectService={(s) => { toggleService(s as Service); setStep("service"); }}
        />
      ) : (
        <>
          <header className="bg-background border-b border-border">
            <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6 flex items-center gap-4">
              {pro.logo_url ? (
                <img src={pro.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover border border-border shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded-xl grid place-items-center text-lg font-bold text-white shrink-0" style={{ backgroundColor: brand }}>{pro.business_name.charAt(0).toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate text-sm">{pro.business_name}</p>
              </div>
              <ThemeToggle className="shrink-0" />
            </div>
          </header>
          <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
            {step !== "service" && step !== "done" && (
              <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            )}
            {step === "service" && (
              <ServiceStep
                services={services ?? []}
                loading={loadingServices}
                selectedServices={selectedServices}
                serviceView={serviceView}
                onToggle={toggleService}
                onViewChange={setServiceView as (v: "list" | "grid") => void}
                onDetail={setDetailService}
                onProceed={proceedFromServices}
                onBack={() => setStep("landing")}
              />
            )}
            {step === "employee" && selectedServices.length > 0 && (
              <EmployeeStep
                services={selectedServices}
                employees={eligibleEmployees}
                onPick={(emp) => { setEmployee(emp); setStep("when"); }}
              />
            )}
            {step === "when" && selectedServices.length > 0 && (
              <WhenStep pro={pro} selectedServices={selectedServices} employee={employee} onPick={(d) => { setWhen(d); setStep("form"); }} brand={brand} />
            )}
            {step === "form" && selectedServices.length > 0 && when && (
              <FormStep pro={pro} selectedServices={selectedServices} employee={employee} when={when} brand={brand} onDone={(id) => { setConfirmedId(id); setStep("done"); }} />
            )}
            {step === "done" && selectedServices.length > 0 && when && confirmedId && (
              <DoneStep pro={pro} selectedServices={selectedServices} employee={employee} when={when} onReset={() => { setSelectedServices([]); setEmployee(null); setWhen(null); setConfirmedId(null); setStep("landing"); }} />
            )}
            {detailService && (
              <ServiceDetailModal
                service={detailService}
                selected={selectedServices.some((x) => x.id === detailService.id)}
                onToggle={() => { toggleService(detailService); setDetailService(null); }}
                onClose={() => setDetailService(null)}
              />
            )}
          </main>
          <footer className="text-center py-8 text-xs text-muted-foreground">
            Agendamento por <a href="/" className="font-bold text-sm hover:underline" style={{ color: "oklch(0.55 0.18 250)" }}>Agendaí</a>
          </footer>
          {pro.phone && <WhatsAppFloat phone={pro.phone} />}
        </>
      )}
    </div>
  );
}

function ServiceStep({ services, loading, selectedServices, serviceView, onToggle, onViewChange, onDetail, onProceed, onBack }: {
  services: Service[]; loading: boolean; selectedServices: Service[]; serviceView: "list" | "grid";
  onToggle: (s: Service) => void; onViewChange: (v: "list" | "grid") => void; onDetail: (s: Service) => void;
  onProceed: () => void; onBack: () => void;
}) {
  return (
    <section className="animate-fade-in-up">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Voltar</button>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight text-foreground">1. Escolha os serviços</h2>
        {services.length > 0 && (
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            <button onClick={() => onViewChange("list")} data-selected={serviceView === "list" || undefined} className="px-3 py-1 text-xs rounded-md font-medium data-[selected]:bg-accent data-[selected]:text-accent-foreground transition-colors">Lista</button>
            <button onClick={() => onViewChange("grid")} data-selected={serviceView === "grid" || undefined} className="px-3 py-1 text-xs rounded-md font-medium data-[selected]:bg-accent data-[selected]:text-accent-foreground transition-colors">Grid</button>
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este profissional ainda não cadastrou serviços.</p>
      ) : (
        <>
          {serviceView === "list" ? (
            <ul className="space-y-3">
              {services.map((s) => {
                const selected = selectedServices.some((x) => x.id === s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => onToggle(s)} data-selected={selected || undefined}
                      className="w-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5 data-[selected]:border-accent data-[selected]:ring-2 data-[selected]:ring-accent/30">
                      <div className="flex items-start gap-3">
                        {s.image_url && <img src={s.image_url} alt={s.name} className="h-16 w-16 rounded-lg object-cover shrink-0 aspect-square" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {selected && <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />}
                            <p className="font-semibold">{s.name}</p>
                          </div>
                          {s.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-sm text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {s.duration_minutes} min</span>
                            <span className="font-semibold text-primary">{formatBRL(s.price_cents)}</span>
                          </div>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDetail(s); }} className="btn-outline-brand !py-1 !px-2 text-xs shrink-0 mt-1">Ver mais</button>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="grid gap-3 grid-cols-2 lg:grid-cols-3">
              {services.map((s) => {
                const selected = selectedServices.some((x) => x.id === s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => onToggle(s)} data-selected={selected || undefined}
                      className="w-full h-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5 flex flex-col gap-2 data-[selected]:border-accent data-[selected]:ring-2 data-[selected]:ring-accent/30">
                      {s.image_url && <img src={s.image_url} alt={s.name} className="w-full aspect-square rounded-lg object-cover" />}
                      <div className="flex items-center gap-2">
                        {selected && <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />}
                        <p className="font-semibold truncate">{s.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {s.duration_minutes} min</p>
                      <p className="text-lg font-black tracking-tight text-primary">{formatBRL(s.price_cents)}</p>
                      {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDetail(s); }} className="btn-outline-brand !py-1.5 !px-3 text-xs w-full mt-auto">Ver mais</button>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 card-elevated">
            <div className="text-sm">
              {selectedServices.length === 0 ? (
                <span className="text-muted-foreground">Nenhum serviço selecionado</span>
              ) : (
                <span><strong>{selectedServices.length}</strong> serviço(s) · <strong>{formatBRL(selectedServices.reduce((a, s) => a + s.price_cents, 0))}</strong> total · {selectedServices.reduce((a, s) => a + s.duration_minutes, 0)} min</span>
              )}
            </div>
            <button disabled={selectedServices.length === 0} onClick={onProceed} className="btn-brand disabled:opacity-50 w-full sm:w-auto">Continuar</button>
          </div>
        </>
      )}
    </section>
  );
}

function EmployeeStep({ services, employees, onPick }: { services: Service[]; employees: Employee[]; onPick: (e: Employee) => void }) {
  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">2. Escolha o profissional</h2>
      <p className="text-sm text-muted-foreground mb-4">{services.map((s) => s.name).join(" + ")} · {services.reduce((a, s) => a + s.duration_minutes, 0)} min</p>
      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum profissional disponível para esses serviços no momento.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {employees.map((emp) => (
            <li key={emp.id}>
              <button onClick={() => onPick(emp)} className="w-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5 flex items-center gap-3">
                {emp.photo_url ? (
                  <img src={emp.photo_url} alt="" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-full grid place-items-center bg-secondary shrink-0"><User className="h-5 w-5 text-muted-foreground" /></div>
                )}
                <div className="min-w-0">
                  <span className="font-semibold truncate block">{emp.name}</span>
                  {emp.specialty && <span className="text-xs text-muted-foreground">{emp.specialty}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WhenStep({ pro, selectedServices, employee, onPick, brand }: { pro: { id: string }; selectedServices: Service[]; employee: Employee | null; onPick: (d: Date) => void; brand: string }) {
  const combinedDuration = useMemo(() => selectedServices.reduce((a, s) => a + s.duration_minutes, 0), [selectedServices]);
  const [monthStart, setMonthStart] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { data: proAvail } = useQuery({
    queryKey: ["public-avail", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.horarios).select("*").eq("professional_id", pro.id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const { data: empAvail } = useQuery({
    queryKey: ["public-emp-avail", employee?.id],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase.from(db.disponibilidadeFuncionario).select("weekday, start_time, end_time").eq("employee_id", employee!.id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const avail = useMemo(() => {
    if (!employee) return proAvail;
    if (!empAvail || !proAvail) return undefined;
    return empAvail.length > 0 ? empAvail : proAvail;
  }, [employee, empAvail, proAvail]);

  const rangeStart = monthStart;
  const rangeEnd = useMemo(() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); return d; }, [monthStart]);

  const { data: proBlocks } = useQuery({
    queryKey: ["public-blocks", pro.id, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.bloqueios).select("starts_at,ends_at").eq("professional_id", pro.id).lt("starts_at", rangeEnd.toISOString()).gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: empBlocks } = useQuery({
    queryKey: ["public-emp-blocks", employee?.id, monthStart.toISOString()],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase.from(db.bloqueiosFuncionario).select("starts_at,ends_at").eq("employee_id", employee!.id).lt("starts_at", rangeEnd.toISOString()).gt("ends_at", rangeStart.toISOString());
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
        const { data } = await supabase.rpc("get_employee_busy_slots", { _employee_id: employee.id, _from: from.toISOString(), _to: to.toISOString() });
        return (data as BusySlot[]) ?? [];
      }
      const { data } = await supabase.rpc("get_busy_slots", { _professional_id: pro.id, _from: from.toISOString(), _to: to.toISOString() });
      return (data as BusySlot[]) ?? [];
    },
  });

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    const end = new Date(monthStart); end.setMonth(end.getMonth() + 1);
    for (let d = new Date(first); d < end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const dayHasAvailability = (day: Date) => { if (!avail) return false; return avail.some((r) => r.weekday === day.getDay()); };

  const combinedBlocks = useMemo<Block[]>(() => {
    const list: Block[] = []; if (proBlocks) list.push(...proBlocks); if (employee && empBlocks) list.push(...empBlocks); return list;
  }, [proBlocks, empBlocks, employee]);

  const slots = useMemo(() => {
    if (!selectedDay || !avail || !proBlocks || !busy) return [];
    if (employee && !empBlocks) return [];
    return computeSlots({ day: selectedDay, serviceDurationMinutes: combinedDuration, availability: avail, blocks: combinedBlocks, busy });
  }, [selectedDay, avail, proBlocks, empBlocks, busy, combinedDuration, employee, combinedBlocks]);

  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">{employee ? "3" : "2"}. Escolha data e horário</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {selectedServices.map((s) => s.name).join(" + ")} · {combinedDuration} min{employee ? ` · com ${employee.name}` : ""}
      </p>
      <div className="card-elevated p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() - 1); if (d >= new Date(today.getFullYear(), today.getMonth(), 1)) setMonthStart(d); }} className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <span className="font-semibold capitalize">{monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
          <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); setMonthStart(d); }} className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">{WEEKDAYS_PT_SHORT.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {daysGrid.map((d, i) => {
            if (!d) return <div key={i} />;
            const past = d < today;
            const canSelect = !past && dayHasAvailability(d);
            const selected = selectedDay && d.toDateString() === selectedDay.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            return (
              <button key={i} disabled={!canSelect} onClick={() => setSelectedDay(d)}
                data-selected={selected || undefined} data-today={isToday || undefined}
                className="aspect-square rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 hover:text-accent transition-colors data-[today]:ring-1 data-[today]:ring-accent/40 data-[selected]:!bg-accent data-[selected]:!text-accent-foreground data-[selected]:ring-0"
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
            <div className="space-y-4">
              {[{ label: "Manhã", from: 6, to: 12 }, { label: "Tarde", from: 12, to: 18 }, { label: "Noite", from: 18, to: 24 }].map(({ label, from, to }) => {
                const periodSlots = slots.filter((s) => { const h = s.getHours(); return h >= from && h < to; });
                if (periodSlots.length === 0) return null;
                return (
                  <div key={label}>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {periodSlots.map((s) => (
                        <button key={s.toISOString()} onClick={() => onPick(s)} className="chip">{formatTime(s)}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FormStep({ pro, selectedServices, employee, when, brand, onDone }: { pro: { id: string }; selectedServices: Service[]; employee: Employee | null; when: Date; brand: string; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const combinedPrice = useMemo(() => selectedServices.reduce((a, s) => a + s.price_cents, 0), [selectedServices]);
  const combinedDuration = useMemo(() => selectedServices.reduce((a, s) => a + s.duration_minutes, 0), [selectedServices]);
  const combinedName = useMemo(() => selectedServices.map((s) => s.name).join(" + "), [selectedServices]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe seu nome.");
      if (!isValidPhoneBR(phone)) throw new Error("Informe um WhatsApp válido no formato (XX) XXXXX-XXXX.");
      const ends = new Date(when.getTime() + combinedDuration * 60 * 1000);
      const appointmentId = crypto.randomUUID();
      const { error } = await supabase.from(db.agendamentos).insert({
        id: appointmentId, professional_id: pro.id, service_id: selectedServices[0].id,
        employee_id: employee?.id ?? null, starts_at: when.toISOString(), ends_at: ends.toISOString(),
        client_name: name.trim(), client_phone: phone, client_email: email.trim() || null,
        notes: notes.trim() || null, service_snapshot_name: combinedName, service_snapshot_price_cents: combinedPrice,
      });
      if (error) throw error;
      return appointmentId;
    },
    onSuccess: (id) => onDone(id),
    onError: (e: Error) => {
      toast.error(e.message.includes("no_overlap_confirmed") || e.message.includes("exclusion") ? "Esse horário acabou de ser reservado. Escolha outro." : e.message);
    },
  });

  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">{employee ? "4" : "3"}. Seus dados</h2>
      <div className="card-elevated p-4 mb-4 text-sm">
        <p><strong>{combinedName}</strong> · {formatBRL(combinedPrice)}</p>
        <p className="text-muted-foreground capitalize">{formatLongDate(when)} às {formatTime(when)}</p>
        {employee && <p className="text-muted-foreground mt-1">com {employee.name}</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
        <F label="Nome completo"><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Seu nome completo" className={cls} /></F>
        <F label="WhatsApp"><PhoneInput value={phone} onChange={setPhone} className={cls} /></F>
        <F label="Email (opcional)"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={cls} /></F>
        <F label="Observação (opcional)"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguma observação?" className={cls} /></F>
        <button disabled={create.isPending} className="btn-gradient w-full inline-flex items-center justify-center disabled:opacity-60">{create.isPending ? "Confirmando..." : "Confirmar agendamento"}</button>
      </form>
    </section>
  );
}

function DoneStep({ pro, selectedServices, employee, when, onReset }: { pro: { business_name: string }; selectedServices: Service[]; employee: Employee | null; when: Date; onReset: () => void }) {
  const combinedName = useMemo(() => selectedServices.map((s) => s.name).join(" + "), [selectedServices]);
  const combinedPrice = useMemo(() => selectedServices.reduce((a, s) => a + s.price_cents, 0), [selectedServices]);
  return (
    <section className="text-center py-8 animate-fade-in-up">
      <div className="mx-auto w-20 h-20 rounded-full bg-success/10 grid place-items-center animate-check-in"><CheckCircle2 className="h-10 w-10 text-success" /></div>
      <h2 className="mt-6 text-3xl font-black tracking-tight text-foreground">Agendamento confirmado!</h2>
      <p className="mt-2 text-muted-foreground">{pro.business_name} está te esperando.</p>
      <div className="mt-6 card-elevated p-4 max-w-sm mx-auto text-left space-y-1">
        <p className="font-semibold">{combinedName}</p>
        <p className="text-sm text-muted-foreground">{formatBRL(combinedPrice)}</p>
        <p className="text-sm text-muted-foreground capitalize">{formatLongDate(when)}</p>
        <p className="text-sm text-muted-foreground">às {formatTime(when)}</p>
        {employee && <p className="text-sm text-muted-foreground">com {employee.name}</p>}
      </div>
      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2">
        <button onClick={onReset} className="btn-gradient inline-flex items-center justify-center">Fazer outro agendamento</button>
        <a href="/meus-agendamentos" className="btn-pill-outline inline-flex items-center justify-center">Ver meus agendamentos</a>
      </div>
    </section>
  );
}

function ServiceDetailModal({ service, selected, onToggle, onClose }: { service: Service; selected: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4 animate-fade-in-up" onClick={onClose}>
      <div className="bg-background w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {service.image_url && <img src={service.image_url} alt={service.name} className="w-full aspect-square object-cover" />}
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl font-bold tracking-tight">{service.name}</h3>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted shrink-0"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /> {service.duration_minutes} minutos</span>
            <span className="text-xl font-black text-primary">{formatBRL(service.price_cents)}</span>
          </div>
          {service.description && <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>}
          <button onClick={onToggle} className="btn-gradient w-full">{selected ? "Remover serviço" : "Adicionar este serviço"}</button>
        </div>
      </div>
    </div>
  );
}


const cls = "w-full min-h-[48px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
