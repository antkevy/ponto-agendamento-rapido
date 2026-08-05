import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { useBookingTheme } from "@/hooks/use-booking-theme";
import type { ProfessionalTheme } from "@/lib/appearance";
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  ArrowLeft,
  ArrowRight,
  User,
  X,
  MessageCircle,
  BadgeCheck,
  Sparkles,
  Tag,
  ShieldCheck,
  CalendarCheck2,
  Calendar as CalendarIcon,
  Mail,
  Pencil,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  UIBadge,
  UIButton,
  UICard,
  UICardHeader,
  UIInput,
  UITextarea,
  UINotice,
  UISummaryRow,
} from "@/components/ui-kit";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";

/** Diferenciais genéricos exibidos na página pública (sem tema de segmento). */
const BENEFITS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: CalendarCheck2,
    title: "Agendamento online",
    text: "Reserve em poucos cliques, 24h por dia",
  },
  { icon: Clock, title: "Horários reais", text: "Só aparece o que está mesmo disponível" },
  { icon: BadgeCheck, title: "Confirmação na hora", text: "Você recebe o resumo do seu horário" },
  { icon: ShieldCheck, title: "Seus dados seguros", text: "Usamos suas informações só no contato" },
];

/** Dados públicos de um profissional carregados pelo /p/:slug. */
type PublicPro = {
  id: string;
  slug: string;
  business_name: string;
  logo_url: string | null;
  brand_color: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  theme_colors: ProfessionalTheme | null;
};

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const cols =
      "id, slug, business_name, logo_url, brand_color, description, address, phone, lat, lng, timezone";
    // theme_colors só existe depois de aplicar a migração
    // 20260803100000_add_professional_theme_colors. Se a coluna ainda não
    // existir no banco, cai no fallback (página segue funcional, cores padrão).
    const { data, error } = await supabase
      .from(db.profissionais)
      .select(`${cols}, theme_colors`)
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) {
      const fb = await supabase
        .from(db.profissionais)
        .select(cols)
        .eq("slug", params.slug)
        .maybeSingle();
      if (fb.error) throw fb.error;
      if (!fb.data) throw notFound();
      return { pro: { ...fb.data, theme_colors: null } };
    }
    if (!data) throw notFound();
    return { pro: data as PublicPro };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Página não encontrada — Agendaí" },
          { name: "robots", content: "noindex" },
        ],
      };
    const p = loaderData.pro;
    return {
      meta: [
        { title: `Agendar com ${p.business_name} — Agendaí` },
        {
          name: "description",
          content:
            p.description || `Agende seu horário com ${p.business_name} online, 24h por dia.`,
        },
        { property: "og:title", content: `Agendar com ${p.business_name}` },
        {
          property: "og:description",
          content: p.description || `Marque seu horário online com ${p.business_name}.`,
        },
      ],
    };
  },
  component: BookingPage,
});

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
};
type Employee = { id: string; name: string; photo_url: string | null; is_active: boolean };

type Step = "landing" | "service" | "employee" | "when" | "form" | "done";

function BookingPage() {
  const { pro } = Route.useLoaderData();
  const rootRef = useRef<HTMLDivElement>(null);
  const brand = useBookingTheme(rootRef, pro.brand_color, pro.theme_colors);

  const [step, setStep] = useState<Step>("landing");
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [serviceView, setServiceView] = useState<ViewMode>("list");
  const [detailService, setDetailService] = useState<Service | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [when, setWhen] = useState<Date | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const { data: planos, isLoading: loadingPlanos } = useQuery({
    queryKey: ["public-planos", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.planos)
        .select("*")
        .eq("professional_id", pro.id)
        .eq("is_active", true)
        .order("price_cents");
      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        description: string | null;
        price_cents: number;
        image_url: string | null;
      }>;
    },
  });

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ["public-services", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.servicos)
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
        .from(db.funcionarios)
        .select("id, name, photo_url, is_active")
        .eq("professional_id", pro.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const ids = (emps ?? []).map((e) => e.id);
      if (ids.length === 0)
        return {
          employees: [] as Employee[],
          links: [] as Array<{ employee_id: string; service_id: string }>,
        };
      const { data: links, error: linkErr } = await supabase
        .from(db.servicosFuncionario)
        .select("employee_id, service_id")
        .in("employee_id", ids);
      if (linkErr) throw linkErr;
      return {
        employees: emps as Employee[],
        links: (links ?? []) as Array<{ employee_id: string; service_id: string }>,
      };
    },
  });

  const eligibleEmployees = useMemo(() => {
    if (!employeesData || selectedServices.length === 0) return [] as Employee[];
    const serviceIds = new Set(selectedServices.map((s) => s.id));
    const linked = new Set(
      employeesData.links.filter((l) => serviceIds.has(l.service_id)).map((l) => l.employee_id),
    );
    return employeesData.employees.filter((e) => linked.has(e.id));
  }, [employeesData, selectedServices]);

  const hasAnyEmployees = (employeesData?.employees.length ?? 0) > 0;

  function toggleService(s: Service) {
    setSelectedServices((prev) =>
      prev.some((x) => x.id === s.id) ? prev.filter((x) => x.id !== s.id) : [...prev, s],
    );
  }

  function proceedFromServices() {
    setEmployee(null);
    setWhen(null);
    if (hasAnyEmployees) setStep("employee");
    else setStep("when");
  }

  function goBack() {
    if (step === "form") setStep("when");
    else if (step === "when") setStep(hasAnyEmployees ? "employee" : "service");
    else if (step === "employee") setStep("service");
    else if (step === "service") setStep("landing");
    else if (step === "done") {
      setSelectedServices([]);
      setEmployee(null);
      setWhen(null);
      setConfirmedId(null);
      setStep("landing");
    }
  }

  return (
    <div
      ref={rootRef}
      className="booking-page min-h-screen bg-booking-gradient"
      style={{ ["--brand" as string]: brand } as React.CSSProperties}
    >
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          backgroundColor: "color-mix(in oklab, var(--header-color) 88%, transparent)",
          borderColor: "color-mix(in oklab, var(--border) 70%, transparent)",
          backdropFilter: "blur(18px) saturate(140%)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3.5">
          {pro.logo_url ? (
            <img
              src={pro.logo_url}
              alt=""
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl object-cover border border-border shrink-0"
            />
          ) : (
            <div
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl grid place-items-center text-xl font-black text-brand-foreground shrink-0 shadow-md"
              style={{ backgroundColor: brand }}
            >
              {pro.business_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight text-foreground truncate leading-tight">
              {pro.business_name}
            </h1>
            {pro.description && (
              <p className="text-xs sm:text-sm mt-0.5 line-clamp-1 flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 ui-icon-color" />
                <span className="ui-accent-text font-medium truncate">{pro.description}</span>
              </p>
            )}
            {pro.address && (
              <a
                href={
                  pro.lat && pro.lng
                    ? `https://www.google.com/maps?q=${pro.lat},${pro.lng}`
                    : `https://www.google.com/maps/search/${encodeURIComponent(pro.address)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 hover:text-accent transition-colors max-w-full"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{pro.address}</span>
              </a>
            )}
          </div>
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {step !== "landing" && step !== "service" && step !== "done" && (
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        )}

        {step === "landing" && (
          <section className="space-y-8 sm:space-y-10">
            {/* Hero */}
            <div
              className="ui-card relative overflow-hidden animate-ui-scale-in"
              style={{ borderRadius: "1.75rem" }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--accent) 22%, transparent) 0%, transparent 60%)",
                }}
              />
              <div className="relative p-6 sm:p-10">
                <UIBadge icon={CalendarCheck2}>Agendamento fácil e rápido</UIBadge>
                <h2 className="mt-5 text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] text-foreground">
                  Seu tempo é <span className="ui-accent-text">importante.</span>
                  <br />
                  Na {pro.business_name}, cuidamos dele.
                </h2>
                <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg">
                  Escolha o serviço, o horário e pronto: seu agendamento fica confirmado em poucos
                  cliques, com toda praticidade e segurança.
                </p>
                <UIButton
                  size="lg"
                  className="mt-7 w-full sm:w-auto"
                  icon={CalendarCheck2}
                  onClick={() => setStep("service")}
                >
                  Agendar agora <ArrowRight className="h-5 w-5" />
                </UIButton>
                <p className="mt-6 text-xs sm:text-sm text-muted-foreground inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 ui-icon-color" /> Ambiente seguro e atendimento de
                  qualidade
                </p>
              </div>
            </div>

            {/* Diferenciais */}
            <div>
              <h3 className="text-center text-lg sm:text-2xl font-black tracking-tight text-foreground">
                Por que agendar com a gente?
              </h3>
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {BENEFITS.map((b, i) => (
                  <div
                    key={b.title}
                    className="ui-card p-4 sm:p-5 text-center ui-stagger"
                    style={{ ["--i" as string]: i }}
                  >
                    <span className="ui-icon-bubble mx-auto h-11 w-11 grid place-items-center rounded-full">
                      <b.icon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 font-bold text-sm text-foreground">{b.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Planos */}
            {loadingPlanos ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1].map((i) => (
                  <div key={i} className="skeleton h-48" />
                ))}
              </div>
            ) : planos && planos.length > 0 ? (
              <div>
                <h3 className="text-lg sm:text-2xl font-black tracking-tight text-foreground mb-5 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 ui-icon-color" /> Nossos planos
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {planos.map((p, i) => (
                    <div
                      key={p.id}
                      className="ui-card p-5 flex flex-col gap-3 transition-transform hover:-translate-y-0.5 ui-stagger"
                      style={{ ["--i" as string]: i }}
                    >
                      {p.image_url && (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          className="w-full aspect-video rounded-xl object-cover"
                        />
                      )}
                      <p className="font-bold text-lg">{p.name}</p>
                      <p className="text-2xl font-black tracking-tight ui-accent-text">
                        {formatBRL(p.price_cents)}
                      </p>
                      {p.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {p.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* CTA final */}
            <div className="ui-card p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <span className="ui-icon-bubble h-14 w-14 grid place-items-center rounded-2xl shrink-0">
                <CalendarCheck2 className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground">Garanta o melhor horário</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Agende online 24h por dia, sem precisar ligar ou esperar resposta.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <UIButton onClick={() => setStep("service")} icon={ArrowRight}>
                  Agendar
                </UIButton>
                <a
                  href={`/meus-agendamentos?pro=${encodeURIComponent(pro.slug)}`}
                  className="ui-btn-outline ui-ripple inline-flex items-center justify-center gap-2 font-semibold rounded-2xl min-h-[48px] px-5 text-sm transition-all"
                >
                  <CalendarCheck2 className="h-4 w-4" /> Meus agendamentos
                </a>
              </div>
            </div>
          </section>
        )}

        {step === "service" && (
          <section className="animate-ui-slide-up space-y-4">
            <div className="ui-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                    1. Escolha os serviços
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Selecione um ou mais serviços para continuar.
                  </p>
                </div>
                {(services ?? []).length > 0 && (
                  <ViewToggle value={serviceView} onChange={setServiceView} />
                )}
              </div>
            </div>

            {loadingServices ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-24" />
                ))}
              </div>
            ) : (services ?? []).length === 0 ? (
              <div className="ui-card p-6 text-sm text-muted-foreground text-center">
                Este profissional ainda não cadastrou serviços.
              </div>
            ) : (
              <>
                {serviceView === "list" ? (
                  <ul className="space-y-3">
                    {services!.map((s, i) => {
                      const selected = selectedServices.some((x) => x.id === s.id);
                      return (
                        <li key={s.id} className="ui-stagger" style={{ ["--i" as string]: i }}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleService(s)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleService(s);
                              }
                            }}
                            data-selected={selected || undefined}
                            className="ui-card ui-ripple w-full text-left cursor-pointer p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99] data-[selected]:border-accent data-[selected]:ring-2 data-[selected]:ring-accent/30"
                          >
                            <div className="flex items-center gap-3.5">
                              {s.image_url ? (
                                <img
                                  src={s.image_url}
                                  alt={s.name}
                                  loading="lazy"
                                  className="h-16 w-16 rounded-2xl object-cover shrink-0 aspect-square border border-border"
                                />
                              ) : (
                                <span className="ui-icon-bubble h-16 w-16 grid place-items-center rounded-2xl shrink-0">
                                  <Tag className="h-6 w-6" />
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {selected && (
                                    <CheckCircle2 className="h-5 w-5 ui-accent-text shrink-0" />
                                  )}
                                  <p className="font-bold text-foreground truncate">{s.name}</p>
                                </div>
                                {s.description && (
                                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                                    {s.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min
                                  </span>
                                  <span className="font-black tracking-tight ui-accent-text">
                                    {formatBRL(s.price_cents)}
                                  </span>
                                </div>
                              </div>
                              <UIButton
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailService(s);
                                }}
                                className="!min-h-[38px] !px-3 text-xs shrink-0"
                              >
                                Ver mais
                              </UIButton>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                    {services!.map((s, i) => {
                      const selected = selectedServices.some((x) => x.id === s.id);
                      return (
                        <li key={s.id} className="ui-stagger" style={{ ["--i" as string]: i }}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleService(s)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleService(s);
                              }
                            }}
                            data-selected={selected || undefined}
                            className="ui-card ui-ripple w-full h-full text-left cursor-pointer p-3.5 transition-all hover:-translate-y-0.5 active:scale-[0.99] flex flex-col gap-2 data-[selected]:border-accent data-[selected]:ring-2 data-[selected]:ring-accent/30"
                          >
                            {s.image_url ? (
                              <img
                                src={s.image_url}
                                alt={s.name}
                                loading="lazy"
                                className="w-full aspect-square rounded-xl object-cover"
                              />
                            ) : (
                              <span className="ui-icon-bubble w-full aspect-square grid place-items-center rounded-xl">
                                <Tag className="h-7 w-7" />
                              </span>
                            )}
                            <div className="flex items-center gap-1.5">
                              {selected && (
                                <CheckCircle2 className="h-4 w-4 ui-accent-text shrink-0" />
                              )}
                              <p className="font-bold truncate text-sm">{s.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {s.duration_minutes} min
                            </p>
                            <p className="text-lg font-black tracking-tight ui-accent-text">
                              {formatBRL(s.price_cents)}
                            </p>
                            <UIButton
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailService(s);
                              }}
                              className="!min-h-[36px] w-full text-xs mt-auto"
                            >
                              Ver mais
                            </UIButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="ui-card p-4 sm:p-5 space-y-3 sticky bottom-3 z-20">
                  {selectedServices.length === 0 ? (
                    <div
                      className="rounded-2xl border border-dashed p-4 text-center"
                      style={{ borderColor: "color-mix(in oklab, var(--border) 90%, transparent)" }}
                    >
                      <p className="text-sm text-muted-foreground">Nenhum serviço selecionado</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Adicione serviços para continuar
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-sm flex-wrap">
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{selectedServices.length}</strong>{" "}
                        serviço(s) · {selectedServices.reduce((a, s) => a + s.duration_minutes, 0)}{" "}
                        min
                      </span>
                      <span className="text-lg font-black tracking-tight ui-accent-text">
                        {formatBRL(selectedServices.reduce((a, s) => a + s.price_cents, 0))}
                      </span>
                    </div>
                  )}
                  <UIButton
                    size="lg"
                    fullWidth
                    icon={CalendarCheck2}
                    disabled={selectedServices.length === 0}
                    onClick={proceedFromServices}
                  >
                    Continuar <ArrowRight className="h-5 w-5" />
                  </UIButton>
                </div>

                <div className="ui-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border overflow-hidden">
                  {BENEFITS.map((b) => (
                    <div key={b.title} className="p-4 text-center">
                      <b.icon className="h-5 w-5 mx-auto ui-icon-color" />
                      <p className="mt-2 text-xs font-bold text-foreground">{b.title}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        {b.text}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {step === "employee" && selectedServices.length > 0 && (
          <section className="animate-fade-in-up">
            <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">
              2. Escolha o profissional
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedServices.map((s) => s.name).join(" + ")} ·{" "}
              {selectedServices.reduce((a, s) => a + s.duration_minutes, 0)} min
            </p>
            {eligibleEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum profissional disponível para esses serviços no momento.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {eligibleEmployees.map((emp) => (
                  <li key={emp.id}>
                    <button
                      onClick={() => {
                        setEmployee(emp);
                        setStep("when");
                      }}
                      className="w-full text-left card-elevated p-4 hover:border-accent transition-all hover:-translate-y-0.5 flex items-center gap-3"
                    >
                      {emp.photo_url ? (
                        <img
                          src={emp.photo_url}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover border border-border shrink-0"
                        />
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

        {step === "when" && selectedServices.length > 0 && (
          <WhenStep
            pro={pro}
            selectedServices={selectedServices}
            employee={employee}
            onPick={(d) => {
              setWhen(d);
              setStep("form");
            }}
            brand={brand}
          />
        )}

        {step === "form" && selectedServices.length > 0 && when && (
          <FormStep
            pro={pro}
            selectedServices={selectedServices}
            employee={employee}
            when={when}
            brand={brand}
            onDone={(id) => {
              setConfirmedId(id);
              setStep("done");
            }}
          />
        )}

        {step === "done" && selectedServices.length > 0 && when && confirmedId && (
          <DoneStep
            pro={pro}
            selectedServices={selectedServices}
            employee={employee}
            when={when}
            onReset={() => {
              setSelectedServices([]);
              setEmployee(null);
              setWhen(null);
              setConfirmedId(null);
              setStep("service");
            }}
          />
        )}

        {detailService && (
          <div
            className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4 animate-fade-in-up"
            onClick={() => setDetailService(null)}
          >
            <div
              className="bg-background w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {detailService.image_url && (
                <img
                  src={detailService.image_url}
                  alt={detailService.name}
                  className="w-full aspect-square object-cover"
                />
              )}
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-bold tracking-tight">{detailService.name}</h3>
                  <button
                    onClick={() => setDetailService(null)}
                    className="p-1 rounded-md hover:bg-muted shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" /> {detailService.duration_minutes} minutos
                  </span>
                  <span className="text-xl font-black text-primary">
                    {formatBRL(detailService.price_cents)}
                  </span>
                </div>
                {detailService.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {detailService.description}
                  </p>
                )}
                <button
                  onClick={() => {
                    toggleService(detailService);
                    setDetailService(null);
                  }}
                  className="btn-gradient w-full"
                >
                  {selectedServices.some((x) => x.id === detailService.id)
                    ? "Remover serviço"
                    : "Adicionar este serviço"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        Agendamento por{" "}
        <a href="/" className="ui-link font-bold text-sm">
          Agendaí
        </a>
      </footer>

      {pro.phone && <WhatsAppFloat phone={pro.phone} />}
    </div>
  );
}

function WhatsAppFloat({ phone }: { phone: string }) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return (
    <a
      href={`https://wa.me/${full}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full grid place-items-center text-white shadow-lg hover:scale-110 transition-transform animate-fade-in-up"
      style={{ backgroundColor: "#25D366" }}
      aria-label="Fale conosco pelo WhatsApp"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}

function WhenStep({
  pro,
  selectedServices,
  employee,
  onPick,
  brand,
}: {
  pro: { id: string };
  selectedServices: Service[];
  employee: Employee | null;
  onPick: (d: Date) => void;
  brand: string;
}) {
  const combinedDuration = useMemo(
    () => selectedServices.reduce((a, s) => a + s.duration_minutes, 0),
    [selectedServices],
  );
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Professional-wide availability (fallback when employee has none).
  const { data: proAvail } = useQuery({
    queryKey: ["public-avail", pro.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.horarios)
        .select("*")
        .eq("professional_id", pro.id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const { data: empAvail } = useQuery({
    queryKey: ["public-emp-avail", employee?.id],
    enabled: !!employee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.disponibilidadeFuncionario)
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
  const rangeEnd = useMemo(() => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [monthStart]);

  const { data: proBlocks } = useQuery({
    queryKey: ["public-blocks", pro.id, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueios)
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
        .from(db.bloqueiosFuncionario)
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
      const from = new Date(selectedDay!);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      if (employee) {
        const { data, error } = await supabase.rpc("get_employee_busy_slots", {
          _employee_id: employee.id,
          _from: from.toISOString(),
          _to: to.toISOString(),
        });
        if (error) throw error;
        return (data as BusySlot[]) ?? [];
      }
      const { data, error } = await supabase.rpc("get_busy_slots", {
        _professional_id: pro.id,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return (data as BusySlot[]) ?? [];
    },
  });

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const startWeekday = first.getDay();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    const end = new Date(monthStart);
    end.setMonth(end.getMonth() + 1);
    for (let d = new Date(first); d < end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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
      serviceDurationMinutes: combinedDuration,
      availability: avail,
      blocks: combinedBlocks,
      busy,
    });
  }, [selectedDay, avail, proBlocks, empBlocks, busy, combinedDuration, employee, combinedBlocks]);

  return (
    <section className="animate-fade-in-up">
      <h2 className="text-xl font-bold tracking-tight text-foreground mb-4">
        {employee ? "3" : "2"}. Escolha data e horário
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {selectedServices.map((s) => s.name).join(" + ")} · {combinedDuration} min
        {employee ? ` · com ${employee.name}` : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="card-elevated p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                const d = new Date(monthStart);
                d.setMonth(d.getMonth() - 1);
                if (d >= new Date(today.getFullYear(), today.getMonth(), 1)) setMonthStart(d);
              }}
              className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold capitalize">
              {monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <button
              onClick={() => {
                const d = new Date(monthStart);
                d.setMonth(d.getMonth() + 1);
                setMonthStart(d);
              }}
              className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {WEEKDAYS_PT_SHORT.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysGrid.map((d, i) => {
              if (!d) return <div key={i} />;
              const past = d < today;
              const canSelect = !past && dayHasAvailability(d);
              const selected = selectedDay && d.toDateString() === selectedDay.toDateString();
              const isToday = d.toDateString() === today.toDateString();
              return (
                <button
                  key={i}
                  disabled={!canSelect}
                  onClick={() => setSelectedDay(d)}
                  data-selected={selected || undefined}
                  data-today={isToday || undefined}
                  className="h-10 w-full rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 hover:text-accent transition-colors data-[today]:ring-1 data-[today]:ring-accent/40 data-[selected]:!bg-accent data-[selected]:!text-accent-foreground data-[selected]:ring-0"
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="animate-fade-in-up lg:min-h-[320px]">
          {selectedDay ? (
            <div className="card-elevated p-4 h-full">
              <h3 className="font-semibold mb-3 capitalize">
                Horários · {formatLongDate(selectedDay)}
              </h3>
              {loadingBusy ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="skeleton h-11" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="h-full grid place-items-center text-center py-10">
                  <p className="text-sm text-muted-foreground">
                    Nenhum horário livre nesse dia. Tente outro.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {[
                    { label: "Manhã", from: 6, to: 12 },
                    { label: "Tarde", from: 12, to: 18 },
                    { label: "Noite", from: 18, to: 24 },
                  ].map(({ label, from, to }) => {
                    const periodSlots = slots.filter((s) => {
                      const h = s.getHours();
                      return h >= from && h < to;
                    });
                    if (periodSlots.length === 0) return null;
                    return (
                      <div key={label}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="h-px w-4 bg-border" />
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {label}
                          </h4>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {periodSlots.map((s) => (
                            <button
                              key={s.toISOString()}
                              onClick={() => onPick(s)}
                              className="chip"
                            >
                              {formatTime(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="card-elevated p-4 h-full grid place-items-center text-center">
              <div>
                <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Selecione uma data no calendário para ver os horários disponíveis.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FormStep({
  pro,
  selectedServices,
  employee,
  when,
  onDone,
  brand,
}: {
  pro: { id: string; business_name: string; address?: string | null };
  selectedServices: Service[];
  employee: Employee | null;
  when: Date;
  onDone: (id: string) => void;
  brand: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const combinedPrice = useMemo(
    () => selectedServices.reduce((a, s) => a + s.price_cents, 0),
    [selectedServices],
  );
  const combinedDuration = useMemo(
    () => selectedServices.reduce((a, s) => a + s.duration_minutes, 0),
    [selectedServices],
  );
  const combinedName = useMemo(
    () => selectedServices.map((s) => s.name).join(" + "),
    [selectedServices],
  );
  const cover = selectedServices.find((s) => s.image_url)?.image_url ?? null;

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe seu nome.");
      if (!isValidPhoneBR(phone))
        throw new Error("Informe um WhatsApp válido no formato (XX) XXXXX-XXXX.");
      const ends = new Date(when.getTime() + combinedDuration * 60 * 1000);
      const appointmentId = crypto.randomUUID();
      const { error } = await supabase.from(db.agendamentos).insert({
        id: appointmentId,
        professional_id: pro.id,
        service_id: selectedServices[0].id,
        employee_id: employee?.id ?? null,
        starts_at: when.toISOString(),
        ends_at: ends.toISOString(),
        client_name: name.trim(),
        client_phone: phone,
        client_email: email.trim() || null,
        notes: notes.trim() || null,
        service_snapshot_name: combinedName,
        service_snapshot_price_cents: combinedPrice,
      });
      if (error) throw error;
      return appointmentId;
    },
    onSuccess: (id) => onDone(id),
    onError: (e: Error) => {
      const msg =
        e.message.includes("no_overlap_confirmed") || e.message.includes("exclusion")
          ? "Esse horário acabou de ser reservado. Escolha outro."
          : e.message;
      toast.error(msg);
    },
  });

  return (
    <section className="space-y-6">
      <header className="text-center animate-ui-slide-up">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] ui-accent-text mb-2">
          Último passo
        </p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
          Confirmar agendamento
        </h2>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 ui-icon-color" /> Ambiente seguro · dados usados só para o
          agendamento
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Resumo do agendamento */}
        <div className="lg:sticky lg:top-6">
          <UICard className="overflow-hidden ui-stagger">
            <div className="h-1.5" style={{ background: "var(--brand)" }} />
            <div className="p-5 sm:p-6">
              <UICardHeader icon={CalendarCheck2} title="Resumo do agendamento" />

              <div className="flex items-center gap-4 pb-5 mb-5 border-b border-border">
                {cover ? (
                  <img
                    src={cover}
                    alt={combinedName}
                    loading="lazy"
                    className="h-14 w-14 rounded-2xl object-cover shrink-0 border border-border"
                  />
                ) : (
                  <span className="ui-icon-bubble h-14 w-14 grid place-items-center rounded-2xl shrink-0">
                    <Tag className="h-6 w-6" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-foreground leading-tight">{combinedName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {combinedDuration} min de duração
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <UISummaryRow icon={CalendarIcon}>
                  <span className="first-letter:uppercase">{formatLongDate(when)}</span>
                </UISummaryRow>
                <UISummaryRow icon={Clock}>{formatTime(when)}</UISummaryRow>
                {employee && <UISummaryRow icon={User}>com {employee.name}</UISummaryRow>}
                <UISummaryRow icon={MapPin} sub={pro.address || undefined}>
                  {pro.business_name}
                </UISummaryRow>
              </div>

              <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                <span
                  className="text-2xl font-black tracking-tight"
                  style={{ color: "var(--brand)" }}
                >
                  {formatBRL(combinedPrice)}
                </span>
              </div>
            </div>
          </UICard>
        </div>

        {/* Seus dados */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-5"
        >
          <UICard className="p-5 sm:p-6 ui-stagger">
            <UICardHeader icon={User} title="Seus dados" />
            <div className="space-y-4">
              <UIInput
                label="Nome completo"
                icon={User}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Seu nome completo"
              />
              <label className="block">
                <span className="block text-sm font-semibold text-foreground mb-2">WhatsApp</span>
                <span className="ui-field">
                  <MessageCircle className="ui-field-icon" />
                  <PhoneInput value={phone} onChange={setPhone} className="ui-field-input pl-11" />
                </span>
              </label>
              <UIInput
                label="E-mail (opcional)"
                icon={Mail}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
              <UITextarea
                label="Observação (opcional)"
                icon={Pencil}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alguma preferência ou observação?"
              />
            </div>

            <div className="mt-5">
              <UINotice icon={ShieldCheck} title="Importante">
                Você poderá cancelar ou reagendar até 24 horas antes do horário marcado.
              </UINotice>
            </div>
          </UICard>

          <UIButton
            type="submit"
            size="lg"
            fullWidth
            disabled={create.isPending}
            icon={CalendarCheck2}
          >
            {create.isPending ? "Confirmando..." : "Confirmar agendamento"}
          </UIButton>

          <p className="text-center text-xs text-muted-foreground inline-flex items-start gap-1.5 justify-center w-full">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              Ao confirmar, você concorda com nossos <span className="ui-link">Termos de Uso</span>{" "}
              e <span className="ui-link">Política de Privacidade</span>.
            </span>
          </p>
        </form>
      </div>
    </section>
  );
}

function DoneStep({
  pro,
  selectedServices,
  employee,
  when,
  onReset,
}: {
  pro: { business_name: string; slug: string };
  selectedServices: Service[];
  employee: Employee | null;
  when: Date;
  onReset: () => void;
}) {
  const combinedName = useMemo(
    () => selectedServices.map((s) => s.name).join(" + "),
    [selectedServices],
  );
  const combinedPrice = useMemo(
    () => selectedServices.reduce((a, s) => a + s.price_cents, 0),
    [selectedServices],
  );
  return (
    <section className="text-center py-8 animate-fade-in-up">
      <div className="mx-auto w-20 h-20 rounded-full bg-success/10 grid place-items-center animate-check-in">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h2 className="mt-6 text-3xl font-black tracking-tight text-foreground">
        Agendamento confirmado!
      </h2>
      <p className="mt-2 text-muted-foreground">{pro.business_name} está te esperando.</p>
      <div className="mt-6 card-elevated p-4 max-w-sm mx-auto text-left space-y-1">
        <p className="font-semibold">{combinedName}</p>
        <p className="text-sm text-muted-foreground">{formatBRL(combinedPrice)}</p>
        <p className="text-sm text-muted-foreground capitalize">{formatLongDate(when)}</p>
        <p className="text-sm text-muted-foreground">às {formatTime(when)}</p>
        {employee && <p className="text-sm text-muted-foreground">com {employee.name}</p>}
      </div>
      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2">
        <button onClick={onReset} className="btn-gradient inline-flex items-center justify-center">
          Fazer outro agendamento
        </button>
        <a
          href={`/meus-agendamentos?pro=${encodeURIComponent(pro.slug)}`}
          className="btn-pill-outline inline-flex items-center justify-center"
        >
          Ver meus agendamentos
        </a>
      </div>
    </section>
  );
}

const cls =
  "w-full min-h-[48px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
