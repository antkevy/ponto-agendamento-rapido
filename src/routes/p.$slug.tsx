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
      const { data, error } = await supabase.from(db.depoimentos).select("*").eq("professional_id", pro.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data as Depoimento[];
    },
  });

  const { data: galeria } = useQuery({
    queryKey: ["public-galeria", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase.from(db.galeria).select("*").eq("professional_id", pro.id).order("sort_order");
      if (error) throw error;
      return data as GaleriaItem[];
    },
  });

  const { data: clientCount } = useQuery({
    queryKey: ["public-client-count", pro.id],
    queryFn: async () => {
      const { count } = await supabase.from(db.agendamentos).eq("professional_id", pro.id).select("*", { count: "exact", head: true });
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
          clientCount={clientCount ?? 0}
          brand={brand}
          onAgendar={() => setStep("service")}
          onSelectService={(s) => { toggleService(s); setStep("service"); }}
          galleryOpen={galleryOpen}
          onGalleryOpen={setGalleryOpen}
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
            {step !== "landing" && step !== "service" && step !== "done" && (
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

function LandingPage({ pro, planos, services, loadingServices, employees, depoimentos, galeria, clientCount, brand, onAgendar, onSelectService, galleryOpen, onGalleryOpen }: {
  pro: any; planos: Plano[]; services: Service[]; loadingServices: boolean;
  employees: Employee[]; depoimentos: Depoimento[]; galeria: GaleriaItem[];
  clientCount: number; brand: string; onAgendar: () => void;
  onSelectService: (s: Service) => void; galleryOpen: GaleriaItem | null; onGalleryOpen: (i: GaleriaItem | null) => void;
}) {
  const rating = Number(pro.rating) || 5;

  return (
    <div className="animate-fade-in-up">
      <HeroSection pro={pro} clientCount={clientCount} rating={rating} brand={brand} onAgendar={onAgendar} />
      {pro.story && <AboutSection pro={pro} brand={brand} />}
      {planos.length > 0 && <PlanosSection planos={planos} brand={brand} />}
      {services.length > 0 && <ServicesPreviewSection services={services} loading={loadingServices} brand={brand} onSelect={onSelectService} />}
      {employees.length > 0 && <ProfessionalsSection employees={employees} />}
      <HowItWorksSection />
      {depoimentos.length > 0 && <TestimonialsSection depoimentos={depoimentos} />}
      {galeria.length > 0 && <GallerySection galeria={galeria} brand={brand} onOpen={onGalleryOpen} />}
      {(pro.lat || pro.address) && <LocationSection pro={pro} />}
      {(pro.phone || pro.instagram || pro.facebook || pro.email) && <ContactSection pro={pro} />}
      <CTASection onAgendar={onAgendar} brand={brand} />
      <FooterSection pro={pro} />
      {galleryOpen && <GalleryLightbox item={galleryOpen} onClose={() => onGalleryOpen(null)} />}
      {pro.phone && <WhatsAppFloat phone={pro.phone} />}
      <ThemeToggle className="fixed top-4 right-4 z-40" />
    </div>
  );
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-2xl sm:text-3xl font-black tracking-tight text-foreground ${className}`}>{children}</h2>;
}

function HeroSection({ pro, clientCount, rating, brand, onAgendar }: any) {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-accent/5" />
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 50%, ${brand}15 0%, transparent 60%)` }} />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center gap-4">
              {pro.logo_url ? (
                <img src={pro.logo_url} alt={pro.business_name} className="h-16 w-16 rounded-2xl object-cover border-2 border-border shadow-lg" />
              ) : (
                <div className="h-16 w-16 rounded-2xl grid place-items-center text-2xl font-bold text-white shadow-lg" style={{ backgroundColor: brand }}>{pro.business_name.charAt(0).toUpperCase()}</div>
              )}
              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.05]">{pro.business_name}</h1>
                {pro.owner_name && <p className="text-base text-muted-foreground mt-1">{pro.owner_name}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StarRating rating={rating} size="md" />
              <span className="text-sm text-muted-foreground">{rating.toFixed(1)}</span>
              {clientCount > 0 && (
                <span className="text-sm text-muted-foreground flex items-center gap-1 ml-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> {clientCount}+ cliente{clientCount !== 1 ? "s" : ""} atendido{clientCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {pro.description && <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl">{pro.description}</p>}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {pro.opening_hours_display && (
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {pro.opening_hours_display}</span>
              )}
              {pro.address && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {pro.address}</span>
              )}
            </div>
            <button onClick={onAgendar} className="inline-flex items-center gap-2 text-lg px-8 py-4 rounded-xl font-bold text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all" style={{ backgroundColor: brand }}>
              Agendar agora <ArrowLeft className="h-5 w-5 rotate-180" />
            </button>
          </div>
          <div className="hidden lg:flex items-center justify-center animate-fade-in-up">
            <div className="relative">
              <div className="w-80 h-80 rounded-3xl overflow-hidden shadow-2xl border border-border" style={{ background: `linear-gradient(135deg, ${brand}20, ${brand}40)` }}>
                {pro.logo_url ? (
                  <img src={pro.logo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center">
                    <div className="text-8xl font-black text-white/30">{pro.business_name.charAt(0).toUpperCase()}</div>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-2xl bg-background border border-border shadow-lg p-4 flex flex-col items-center justify-center">
                <Sparkles className="h-6 w-6" style={{ color: brand }} />
                <p className="text-xs font-semibold mt-1">Premium</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutSection({ pro, brand }: any) {
  return (
    <section className="py-20 sm:py-28 bg-surface/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <SectionTitle>Sobre nós</SectionTitle>
          <div className="w-20 h-1 rounded-full mx-auto" style={{ backgroundColor: brand }} />
          <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-line">{pro.story}</p>
          <div className="grid sm:grid-cols-3 gap-6 mt-12">
            {[
              { icon: Target, label: "Missão", text: "Oferecer o melhor atendimento com qualidade e respeito." },
              { icon: ShieldCheck, label: "Diferencial", text: "Profissionais qualificados e ambiente acolhedor." },
              { icon: Sparkles, label: "Qualidade", text: "Padrão de excelência em cada serviço prestado." },
            ].map(({ icon: Icon, label, text }) => (
              <div key={label} className="card-elevated p-6 text-center space-y-3 hover:-translate-y-1 transition-all">
                <Icon className="h-8 w-8 mx-auto" style={{ color: brand }} />
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanosSection({ planos, brand }: { planos: Plano[]; brand: string }) {
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-12">
          <SectionTitle>Nossos planos</SectionTitle>
          <div className="w-20 h-1 rounded-full mx-auto" style={{ backgroundColor: brand }} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {planos.map((p) => (
            <div key={p.id} className="card-elevated p-6 sm:p-8 flex flex-col gap-4 hover:-translate-y-1 transition-all group text-center">
              {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-40 rounded-xl object-cover" />}
              <p className="text-xl font-bold">{p.name}</p>
              <p className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: brand }}>{formatBRL(p.price_cents)}</p>
              {p.description && <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ServicesPreviewSection({ services, loading, brand, onSelect }: { services: Service[]; loading: boolean; brand: string; onSelect: (s: Service) => void }) {
  return (
    <section className="py-20 sm:py-28 bg-surface/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-12">
          <SectionTitle>Serviços</SectionTitle>
          <div className="w-20 h-1 rounded-full mx-auto" style={{ backgroundColor: brand }} />
        </div>
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-64" />)}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            {services.slice(0, 6).map((s) => (
              <button key={s.id} onClick={() => onSelect(s)} className="card-elevated p-5 flex flex-col gap-3 text-left hover:-translate-y-1 transition-all group">
                {s.image_url ? (
                  <img src={s.image_url} alt={s.name} className="w-full aspect-video rounded-xl object-cover" />
                ) : (
                  <div className="w-full aspect-video rounded-xl bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <p className="font-semibold text-lg">{s.name}</p>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min</span>
                </div>
                <p className="text-xl font-black tracking-tight" style={{ color: brand }}>{formatBRL(s.price_cents)}</p>
                {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
                <span className="btn-outline-brand text-center text-sm !py-2 mt-auto">Selecionar</span>
              </button>
            ))}
          </div>
        )}
        {services.length > 6 && (
          <div className="text-center mt-8">
            <button onClick={() => {}} className="text-sm font-semibold hover:underline" style={{ color: brand }}>Ver todos os serviços</button>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfessionalsSection({ employees }: { employees: Employee[] }) {
  if (employees.length === 0) return null;
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-12">
          <SectionTitle>Nossa equipe</SectionTitle>
          <p className="text-muted-foreground">Conheça os profissionais que farão seu atendimento</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {employees.map((emp) => (
            <div key={emp.id} className="card-elevated p-6 text-center space-y-4 hover:-translate-y-1 transition-all">
              {emp.photo_url ? (
                <img src={emp.photo_url} alt={emp.name} className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-border" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-muted mx-auto border-4 border-border grid place-items-center"><User className="h-8 w-8 text-muted-foreground" /></div>
              )}
              <div>
                <p className="font-semibold text-lg">{emp.name}</p>
                {emp.specialty && <p className="text-sm text-muted-foreground">{emp.specialty}</p>}
                {emp.experience_years != null && emp.experience_years > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{emp.experience_years} anos de experiência</p>
                )}
              </div>
              {emp.bio && <p className="text-sm text-muted-foreground leading-relaxed">{emp.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-20 sm:py-28 bg-surface/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-12">
          <SectionTitle>Como funciona</SectionTitle>
          <p className="text-muted-foreground">Agende seu horário em 4 passos simples</p>
        </div>
        <div className="grid sm:grid-cols-4 gap-6">
          {[
            { icon: Briefcase, step: "1", title: "Escolha", desc: "Escolha o serviço desejado" },
            { icon: User, step: "2", title: "Profissional", desc: "Selecione quem vai atender" },
            { icon: Calendar, step: "3", title: "Data e hora", desc: "Escolha o melhor horário" },
            { icon: CheckCircle2, step: "4", title: "Confirme", desc: "Pronto! Seu horário está garantido" },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="text-center space-y-3 p-6">
              <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto" style={{ backgroundColor: "var(--brand)", opacity: 0.1 }}>
                <Icon className="h-6 w-6" style={{ color: "var(--brand)" }} />
              </div>
              <div className="w-8 h-8 rounded-full grid place-items-center text-sm font-bold text-white mx-auto" style={{ backgroundColor: "var(--brand)" }}>{step}</div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
import { Briefcase } from "lucide-react";

function TestimonialsSection({ depoimentos }: { depoimentos: Depoimento[] }) {
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-12">
          <SectionTitle>O que nossos clientes dizem</SectionTitle>
          <Quote className="h-8 w-8 mx-auto text-muted-foreground/30" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          {depoimentos.map((d) => (
            <div key={d.id} className="card-elevated p-6 space-y-4 hover:-translate-y-1 transition-all">
              <StarRating rating={d.rating} />
              <p className="text-sm text-muted-foreground leading-relaxed italic">"{d.comment}"</p>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                {d.client_photo ? (
                  <img src={d.client_photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted grid place-items-center"><User className="h-4 w-4 text-muted-foreground" /></div>
                )}
                <p className="font-medium text-sm">{d.client_name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ galeria, brand, onOpen }: { galeria: GaleriaItem[]; brand: string; onOpen: (i: GaleriaItem) => void }) {
  const [cat, setCat] = useState<string>("all");
  const categories = ["all", ...new Set(galeria.map((g) => g.category))];
  const filtered = cat === "all" ? galeria : galeria.filter((g) => g.category === cat);

  return (
    <section className="py-20 sm:py-28 bg-surface/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-8">
          <SectionTitle>Galeria</SectionTitle>
          <div className="w-20 h-1 rounded-full mx-auto" style={{ backgroundColor: brand }} />
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`chip !min-h-[36px] text-sm ${cat === c ? "!bg-accent !text-accent-foreground" : ""}`}>
              {c === "all" ? "Todas" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-4xl mx-auto">
          {filtered.map((g) => (
            <button key={g.id} onClick={() => onOpen(g)} className="aspect-square rounded-xl overflow-hidden border border-border group relative">
              <img src={g.image_url} alt={g.caption ?? ""} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors" />
              {g.caption && (
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-foreground/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs font-medium">{g.caption}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function GalleryLightbox({ item, onClose }: { item: GaleriaItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/80 grid place-items-center p-4 animate-fade-in-up" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <img src={item.image_url} alt={item.caption ?? ""} className="w-full rounded-2xl shadow-2xl" />
        {item.caption && <p className="text-white text-sm mt-3 text-center">{item.caption}</p>}
        <button onClick={onClose} className="absolute -top-3 -right-3 bg-background rounded-full p-2 shadow-lg border border-border"><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

function LocationSection({ pro }: any) {
  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-8">
          <SectionTitle>Localização</SectionTitle>
        </div>
        {pro.address && (
          <div className="text-center mb-4">
            <p className="text-muted-foreground flex items-center justify-center gap-2"><MapPin className="h-4 w-4" /> {pro.address}</p>
            <a href={`https://www.google.com/maps/search/${encodeURIComponent(pro.address)}`} target="_blank" rel="noopener noreferrer" className="btn-outline-brand inline-flex items-center gap-2 mt-3">
              <MapPin className="h-4 w-4" /> Como chegar
            </a>
          </div>
        )}
        {(pro.lat && pro.lng) ? (
          <div className="rounded-2xl overflow-hidden border border-border shadow-lg max-w-2xl mx-auto h-72">
            <iframe title="Localização" loading="lazy" className="w-full h-full" src={`https://www.google.com/maps?q=${pro.lat},${pro.lng}&z=15&output=embed`} />
          </div>
        ) : pro.address && (
          <div className="rounded-2xl overflow-hidden border border-border shadow-lg max-w-2xl mx-auto h-72 bg-muted flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Mapa indisponível</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ContactSection({ pro }: any) {
  const whatsDigits = pro.phone?.replace(/\D/g, "");
  const whatsFull = whatsDigits?.startsWith("55") ? whatsDigits : `55${whatsDigits}`;
  return (
    <section className="py-20 sm:py-28 bg-surface/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center space-y-4 mb-8">
          <SectionTitle>Contato</SectionTitle>
          <p className="text-muted-foreground">Estamos disponíveis para atender você</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4 max-w-xl mx-auto">
          {pro.phone && (
            <a href={`https://wa.me/${whatsFull}`} target="_blank" rel="noopener noreferrer" className="btn-outline-brand inline-flex items-center gap-2 !py-3 px-5">
              <MessageCircle className="h-5 w-5" style={{ color: "#25D366" }} /> WhatsApp
            </a>
          )}
          {pro.phone && (
            <a href={`tel:${pro.phone}`} className="btn-outline-brand inline-flex items-center gap-2 !py-3 px-5">
              <Phone className="h-5 w-5" /> Telefone
            </a>
          )}
          {pro.instagram && (
            <a href={`https://instagram.com/${pro.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="btn-outline-brand inline-flex items-center gap-2 !py-3 px-5">
              <Instagram className="h-5 w-5" /> Instagram
            </a>
          )}
          {pro.facebook && (
            <a href={pro.facebook.startsWith("http") ? pro.facebook : `https://facebook.com/${pro.facebook}`} target="_blank" rel="noopener noreferrer" className="btn-outline-brand inline-flex items-center gap-2 !py-3 px-5">
              <Facebook className="h-5 w-5" /> Facebook
            </a>
          )}
          {pro.email && (
            <a href={`mailto:${pro.email}`} className="btn-outline-brand inline-flex items-center gap-2 !py-3 px-5">
              <Mail className="h-5 w-5" /> Email
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function CTASection({ onAgendar, brand }: { onAgendar: () => void; brand: string }) {
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${brand}10, ${brand}20)` }} />
      <div className="relative text-center space-y-6 max-w-xl mx-auto px-4">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.1]">Torne seu atendimento mais simples.</h2>
        <button onClick={onAgendar} className="inline-flex items-center gap-2 text-lg px-10 py-4 rounded-xl font-bold text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all" style={{ backgroundColor: brand }}>
          Agendar Atendimento <ArrowLeft className="h-5 w-5 rotate-180" />
        </button>
      </div>
    </section>
  );
}

function FooterSection({ pro }: any) {
  return (
    <footer className="py-12 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {pro.logo_url ? (
              <img src={pro.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-lg grid place-items-center text-sm font-bold text-white" style={{ backgroundColor: pro.brand_color || "#0284C7" }}>{pro.business_name.charAt(0).toUpperCase()}</div>
            )}
            <span className="font-semibold text-sm">{pro.business_name}</span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {pro.business_name}. Todos os direitos reservados.</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <a href="#" className="hover:underline">Política de Privacidade</a>
            <a href="#" className="hover:underline">Termos de Uso</a>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Agendamento por <a href="/" className="font-bold hover:underline" style={{ color: "oklch(0.55 0.18 250)" }}>Agendaí</a>
        </p>
      </div>
    </footer>
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

function WhatsAppFloat({ phone }: { phone: string }) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return (
    <a href={`https://wa.me/${full}`} target="_blank" rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full grid place-items-center text-white shadow-lg hover:scale-110 transition-transform animate-fade-in-up"
      style={{ backgroundColor: "#25D366" }} aria-label="Fale conosco pelo WhatsApp">
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}

const cls = "w-full min-h-[48px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
