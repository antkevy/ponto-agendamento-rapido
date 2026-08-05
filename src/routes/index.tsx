import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Sparkles,
  CalendarCheck2,
  CalendarDays,
  Users,
  Clock,
  Shield,
  Smartphone,
  MessageCircle,
  Star,
  CircleCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agendaí — Agendamento online para o seu negócio" },
      {
        name: "description",
        content:
          "Organize seus clientes, horários e serviços em um único lugar. Uma plataforma minimalista, rápida e feita para profissionais como você.",
      },
      { property: "og:title", content: "Agendaí — Agendamento online simples" },
      {
        property: "og:description",
        content: "Menos mensagens no WhatsApp, mais horários preenchidos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Agenda inteligente",
    desc: "Horários calculados automaticamente com base na duração de cada serviço. Sem conflitos, sem confusão.",
  },
  {
    icon: Users,
    title: "Vários funcionários",
    desc: "Cadastre sua equipe com serviços e horários próprios. Cada um com sua agenda individual.",
  },
  {
    icon: Clock,
    title: "Horários flexíveis",
    desc: "Configure turnos de manhã, tarde e bloqueios personalizados para férias ou imprevistos.",
  },
  {
    icon: Smartphone,
    title: "Pensado para o celular",
    desc: "Seus clientes agendam pelo celular em segundos, sem baixar app e sem criar conta.",
  },
  {
    icon: Shield,
    title: "Sem duplicidade",
    desc: "Nosso motor de disponibilidade garante que dois clientes nunca marcarão o mesmo horário.",
  },
  {
    icon: MessageCircle,
    title: "Menos WhatsApp",
    desc: "Reduza mensagens repetidas. Compartilhe seu link e receba agendamentos 24h por dia.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Crie sua conta",
    desc: "Cadastre seu negócio, adicione seus serviços e defina seus horários em poucos minutos.",
  },
  {
    n: "2",
    title: "Compartilhe seu link",
    desc: "Envie o link da sua página no WhatsApp, Instagram ou onde seus clientes estiverem.",
  },
  {
    n: "3",
    title: "Receba agendamentos",
    desc: "Seus clientes marcam sozinhos. Você acompanha tudo pelo painel, em qualquer lugar.",
  },
];

const TESTIMONIALS = [
  {
    name: "Marina S.",
    role: "Cabeleireira",
    quote:
      "Antes eu perdia horários por confusão no WhatsApp. Agora meus clientes marcam sozinhos e eu só olho a agenda.",
  },
  {
    name: "Rafael T.",
    role: "Personal trainer",
    quote:
      "Ter cada aluno vendo minha disponibilidade real economiza horas do meu dia. Simples e rápido.",
  },
  {
    name: "Ana P.",
    role: "Estética avançada",
    quote:
      "O visual é bonito e passa profissionalismo. Meus clientes elogiam a experiência de marcar.",
  },
];

const FAQ = [
  {
    q: "Preciso pagar para começar?",
    a: "Não. Você começa gratuitamente e pode explorar todas as funcionalidades essenciais sem informar cartão.",
  },
  {
    q: "Meus clientes precisam criar conta?",
    a: "Não. Eles só precisam do link da sua página. Preenchem nome e WhatsApp para confirmar.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim. A plataforma foi feita pensando primeiro no celular, tanto para você quanto para seus clientes.",
  },
  {
    q: "Posso ter vários funcionários?",
    a: "Sim. Cada funcionário tem serviços, horários e bloqueios individuais, e o cliente escolhe com quem quer marcar.",
  },
];

const CATEGORIES = [
  "Barbearia",
  "Cabeleireiro",
  "Estética",
  "Podologia",
  "Manicure",
  "Personal trainer",
  "Tatuagem",
  "Depilação",
  "Massoterapia",
  "Clínica",
];

const WEEK_DAYS = ["S", "T", "Q", "Q", "S", "S", "D"];
const WEEK_DATES = ["19", "20", "21", "22", "23", "24", "25"];
const TIME_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        mounted && !visible && "opacity-0 translate-y-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PhoneMockup() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto mt-16 sm:mt-20 w-[300px] sm:w-[320px] select-none pointer-events-none"
    >
      <div className="absolute -inset-8 rounded-[3.5rem] bg-gradient-to-b from-accent/30 via-accent/10 to-transparent blur-2xl" />

      <div className="relative rounded-[2.2rem] border border-border bg-card p-2.5 shadow-2xl ring-1 ring-black/5">
        <div className="overflow-hidden rounded-[1.7rem] bg-card">
          {/* status bar */}
          <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-muted-foreground">
            <span className="font-semibold">09:41</span>
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="h-2 w-2 rounded-full bg-warning" />
              <span className="h-2 w-2 rounded-full bg-success" />
            </span>
          </div>

          {/* header */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-bold text-foreground">Barbearia Estilo</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Star className="h-3 w-3 fill-warning text-warning" />
                  4,9 · 320 avaliações
                </p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/12 text-accent">
                <CalendarCheck2 className="h-4.5 w-4.5" />
              </span>
            </div>
          </div>

          {/* service chips */}
          <div className="px-4 flex gap-1.5">
            {["Corte", "Barba", "Corte + Barba"].map((s, i) => (
              <span
                key={s}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  i === 1
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {s}
              </span>
            ))}
          </div>

          {/* mini week */}
          <div className="px-4 pt-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {WEEK_DAYS.map((d, i) => (
                <span key={`${d}${i}`}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {WEEK_DATES.map((d, i) => (
                <span
                  key={d}
                  className={cn(
                    "aspect-square grid place-items-center rounded-full text-[11px] font-semibold",
                    i === 5
                      ? "bg-accent text-accent-foreground shadow-lg shadow-accent/30"
                      : "text-foreground",
                  )}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>

          {/* time slots */}
          <div className="px-4 pt-4 grid grid-cols-3 gap-1.5">
            {TIME_SLOTS.map((t, i) => (
              <span
                key={t}
                className={cn(
                  "rounded-lg border py-1.5 text-center text-[11px] font-medium",
                  i === 3
                    ? "border-accent bg-accent/12 text-accent"
                    : "border-border text-foreground",
                )}
              >
                {t}
              </span>
            ))}
          </div>

          {/* confirm */}
          <div className="px-4 py-4">
            <div className="rounded-xl bg-accent py-2.5 text-center text-[12px] font-bold text-accent-foreground shadow-lg shadow-accent/30">
              Confirmar agendamento
            </div>
          </div>
        </div>
      </div>

      {/* floating: confirmed */}
      <div className="ui-card-glass absolute left-0 sm:-left-16 top-16 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 motion-safe:animate-float">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success">
          <CircleCheck className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[11px] font-bold text-foreground leading-tight">
            Agendamento confirmado
          </span>
          <span className="block text-[10px] text-muted-foreground">Hoje · 14h00 · Corte</span>
        </span>
      </div>

      {/* floating: new booking */}
      <div className="ui-card-glass absolute right-0 sm:-right-14 bottom-8 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 motion-safe:animate-float-delay">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366]/15 text-[#25D366]">
          <MessageCircle className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[11px] font-bold text-foreground leading-tight">
            Novo agendamento
          </span>
          <span className="block text-[10px] text-muted-foreground">Marina · agora · 10:30</span>
        </span>
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              className="w-10 h-10 rounded-full grid place-items-center text-white shadow-md"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, oklch(0.62 0.17 250), oklch(0.55 0.18 250))",
              }}
            >
              <CalendarCheck2 className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="text-2xl font-bold tracking-tight text-foreground">Agendaí</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#recursos" className="hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">
              Como funciona
            </a>
            <a href="#depoimentos" className="hover:text-foreground transition-colors">
              Depoimentos
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              Perguntas
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/entrar"
              className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Entrar
            </Link>
            <ThemeToggle />
            <Link
              to="/cadastrar"
              className="btn-pill-solid inline-flex items-center text-sm sm:text-base"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-page-gradient">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
          <div className="animate-fade-in-up inline-flex">
            <span className="badge-pill">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-semibold">Novo</span> · Confirmações
                automáticas por WhatsApp
              </span>
            </span>
          </div>

          <h1 className="mt-8 text-5xl sm:text-6xl lg:text-7xl font-sans font-black tracking-tight text-foreground leading-[1.02]">
            Gerencie seus agendamentos{" "}
            <span style={{ color: "oklch(0.62 0.19 250)" }}>de forma simples.</span>
          </h1>

          <p className="mt-6 sm:mt-8 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Organize seus clientes, horários e serviços em um único lugar. Uma plataforma
            minimalista, rápida e feita para profissionais como você.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/cadastrar"
              className="btn-gradient inline-flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              Agendar agora
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/entrar"
              className="btn-pill-outline inline-flex items-center w-full sm:w-auto justify-center"
            >
              Conhecer plataforma
            </Link>
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {["Sem cartão de crédito", "Configuração em 2 min", "Cancele quando quiser"].map(
              (item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <Check
                    className="h-4 w-4"
                    style={{ color: "oklch(0.6 0.15 155)" }}
                    strokeWidth={3}
                  />
                  {item}
                </li>
              ),
            )}
          </ul>

          <PhoneMockup />
        </div>
      </section>

      {/* Categories marquee */}
      <section className="border-y border-border bg-card/60">
        <div className="relative overflow-hidden py-5 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="flex w-max items-center gap-8 whitespace-nowrap motion-safe:animate-marquee text-sm font-medium text-muted-foreground">
            {[...CATEGORIES, ...CATEGORIES].map((c, i) => (
              <span key={i} className="inline-flex items-center gap-8">
                {c}
                <Sparkles className="h-3.5 w-3.5 text-accent/40" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border bg-background">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            ["+2 mil", "Profissionais"],
            ["+80 mil", "Agendamentos"],
            ["4,9/5", "Avaliação média"],
            ["24h", "Sua agenda online"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">{n}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal>
            <div className="max-w-2xl">
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: "oklch(0.55 0.18 250)" }}
              >
                Recursos
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
                Tudo que você precisa para{" "}
                <span style={{ color: "oklch(0.62 0.19 250)" }}>lotar sua agenda.</span>
              </h2>
              <p className="mt-4 text-muted-foreground text-lg">
                Uma plataforma pensada para quem vive de agenda cheia — sem complicar.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <Reveal key={title} delay={(i % 3) * 90}>
                <div className="card-elevated p-6 hover:-translate-y-0.5 hover:shadow-lg transition-all">
                  <div
                    className="w-11 h-11 rounded-xl grid place-items-center mb-4"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, oklch(0.95 0.03 250), oklch(0.92 0.04 250))",
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: "oklch(0.55 0.18 250)" }}
                      strokeWidth={2.25}
                    />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-20 sm:py-28 bg-section-soft">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center">
          <Reveal>
            <p
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: "oklch(0.55 0.18 250)" }}
            >
              Como funciona
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
              Comece em <span style={{ color: "oklch(0.62 0.19 250)" }}>3 passos.</span>
            </h2>
          </Reveal>
          <div className="relative mt-14 grid gap-8 md:grid-cols-3 text-left">
            <div className="hidden md:block absolute top-6 left-[16%] right-[16%] border-t-2 border-dashed border-border" />
            {STEPS.map(({ n, title, desc }, i) => (
              <Reveal key={n} delay={i * 110}>
                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-full grid place-items-center text-white font-black text-lg shadow-md"
                    style={{
                      backgroundImage:
                        "linear-gradient(180deg, oklch(0.62 0.17 250), oklch(0.55 0.18 250))",
                    }}
                  >
                    {n}
                  </div>
                  <h3 className="mt-5 text-xl font-bold tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="depoimentos" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto">
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: "oklch(0.55 0.18 250)" }}
              >
                Depoimentos
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
                Profissionais que{" "}
                <span style={{ color: "oklch(0.62 0.19 250)" }}>respiram melhor.</span>
              </h2>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={(i % 3) * 90}>
                <div className="card-elevated p-6 flex flex-col">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star
                        key={j}
                        className="h-4 w-4 fill-current"
                        style={{ color: "oklch(0.75 0.15 80)" }}
                      />
                    ))}
                  </div>
                  <p className="text-foreground leading-relaxed flex-1">"{t.quote}"</p>
                  <div className="mt-5 pt-4 border-t border-border">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28 bg-section-soft-reverse">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <Reveal>
            <div className="text-center">
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: "oklch(0.55 0.18 250)" }}
              >
                Perguntas frequentes
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
                Tudo claro <span style={{ color: "oklch(0.62 0.19 250)" }}>antes de começar.</span>
              </h2>
            </div>
          </Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="card-elevated p-5 group">
                  <summary className="cursor-pointer font-semibold text-foreground list-none flex items-center justify-between">
                    {f.q}
                    <span className="ml-4 text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-muted-foreground leading-relaxed">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <Reveal>
            <div
              className="rounded-3xl p-10 sm:p-16 text-center text-white shadow-2xl"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.45 0.14 245))",
              }}
            >
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Pronto para uma agenda que trabalha por você?
              </h2>
              <p className="mt-4 text-white/85 text-lg max-w-xl mx-auto">
                Crie sua conta em menos de dois minutos e compartilhe seu link ainda hoje.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
                <Link
                  to="/cadastrar"
                  className="inline-flex items-center gap-2 bg-white text-[#0F172A] font-semibold px-7 py-3.5 rounded-full hover:bg-white/95 hover:text-[#0F172A] transition-colors"
                >
                  Criar minha conta grátis
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/meus-agendamentos"
                  search={{ pro: undefined }}
                  className="inline-flex items-center text-white/90 hover:text-white text-sm underline underline-offset-4"
                >
                  Sou cliente, quero consultar meu agendamento
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-bold text-foreground text-base">Agendaí</span>
          <span>© {new Date().getFullYear()} — feito com carinho no Brasil.</span>
        </div>
      </footer>
    </div>
  );
}
