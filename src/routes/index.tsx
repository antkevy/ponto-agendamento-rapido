import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { Reveal } from "@/components/reveal";
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
      { property: "og:url", content: "https://agendai-br.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://agendai-br.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Agendaí",
              url: "https://agendai-br.lovable.app/",
              description:
                "Plataforma brasileira de agendamento online para profissionais e pequenos negócios.",
            },
            {
              "@type": "WebSite",
              name: "Agendaí",
              url: "https://agendai-br.lovable.app/",
              inLanguage: "pt-BR",
            },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
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

function BookingPreview() {
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-accent/25 via-accent/10 to-transparent blur-3xl" />

      <div className="relative rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Terça-feira
            </p>
            <p className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              18 de novembro
            </p>
          </div>
          <span className="badge-pill shrink-0 text-xs">Corte + Barba · 45 min</span>
        </div>

        <div className="mt-6">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
            {WEEK_DAYS.map((d, i) => (
              <span key={`${d}${i}`}>{d}</span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {WEEK_DATES.map((d, i) => (
              <span
                key={d}
                className={cn(
                  "aspect-square grid place-items-center rounded-full text-xs font-semibold",
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

        <div className="mt-6 grid grid-cols-3 gap-2">
          {TIME_SLOTS.map((t, i) => (
            <span
              key={t}
              className={cn(
                "rounded-xl border py-2.5 text-center text-sm font-medium",
                i === 3
                  ? "border-accent bg-accent text-accent-foreground shadow-md shadow-accent/25"
                  : "border-border text-foreground",
              )}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-accent py-3 text-center text-sm font-bold text-accent-foreground shadow-lg shadow-accent/30">
          Confirmar 10:30
        </div>
      </div>

      {/* floating: confirmed */}
      <div className="ui-card-glass absolute -left-3 sm:-left-8 top-10 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 motion-safe:animate-float">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success">
          <CircleCheck className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[11px] font-bold text-foreground leading-tight">
            Agendado
          </span>
          <span className="block text-[10px] text-muted-foreground">Hoje · 14h00 · Corte</span>
        </span>
      </div>

      {/* floating: new booking */}
      <div className="ui-card-glass absolute -right-3 sm:-right-8 bottom-10 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 motion-safe:animate-float-delay">
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
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-16 sm:pt-20 sm:pb-24 grid gap-12 lg:gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="text-center lg:text-left">
            <div className="animate-fade-in-up inline-flex">
              <span className="badge-pill">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-muted-foreground">
                  <span className="text-foreground font-semibold">Novo</span> · Confirmações
                  automáticas por WhatsApp
                </span>
              </span>
            </div>

            <h1 className="mt-8 text-5xl sm:text-6xl font-sans font-black tracking-tight text-foreground leading-[1.02]">
              Gerencie seus agendamentos{" "}
              <span style={{ color: "oklch(0.62 0.19 250)" }}>de forma simples.</span>
            </h1>

            <p className="mt-6 sm:mt-8 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
              Organize seus clientes, horários e serviços em um único lugar. Uma plataforma
              minimalista, rápida e feita para profissionais como você.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
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

            <ul className="mt-10 flex flex-wrap items-center lg:justify-start justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
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
          </div>

          <BookingPreview />
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
            ["+15 mil", "Clientes atendidos"],
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
              <span className="badge-pill text-xs">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                  Recursos
                </span>
              </span>
              <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
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
                <div className="group relative h-full overflow-hidden card-elevated p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <span
                    className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: "oklch(0.62 0.19 250 / 0.18)" }}
                  />
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-accent to-transparent transition-transform duration-500 group-hover:scale-x-100" />
                  <div className="relative flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-2xl grid place-items-center ring-1 ring-inset ring-border/60 transition-transform duration-300 group-hover:scale-105"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, oklch(0.95 0.03 250), oklch(0.9 0.05 250))",
                      }}
                    >
                      <Icon
                        className="h-5 w-5"
                        style={{ color: "oklch(0.45 0.16 250)" }}
                        strokeWidth={2.25}
                      />
                    </div>
                    <span className="text-xs font-black tabular-nums text-muted-foreground/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="relative mt-5 text-lg font-bold tracking-tight text-foreground">
                    {title}
                  </h3>
                  <p className="relative mt-2 text-sm text-muted-foreground leading-relaxed">
                    {desc}
                  </p>
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
            <span className="badge-pill text-xs">
              <CalendarCheck2 className="h-3.5 w-3.5 text-accent" />
              <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                Como funciona
              </span>
            </span>
            <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
              Comece em <span style={{ color: "oklch(0.62 0.19 250)" }}>3 passos.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-lg mx-auto">
              Do cadastro ao primeiro cliente marcado em menos de cinco minutos.
            </p>
          </Reveal>
          <div className="relative mt-14 grid gap-5 md:grid-cols-3 text-left">
            <div className="hidden md:block absolute top-16 left-[16%] right-[16%] border-t-2 border-dashed border-border" />
            {STEPS.map(({ n, title, desc }, i) => (
              <Reveal key={n} delay={i * 110}>
                <div className="group relative h-full card-elevated p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full grid place-items-center text-white font-black text-lg shadow-md ring-4 ring-background transition-transform duration-300 group-hover:scale-105"
                      style={{
                        backgroundImage:
                          "linear-gradient(180deg, oklch(0.62 0.17 250), oklch(0.55 0.18 250))",
                      }}
                    >
                      {n}
                    </div>
                    {i < STEPS.length - 1 && (
                      <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-1" />
                    )}
                  </div>
                  <h3 className="mt-5 text-xl font-bold tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{desc}</p>
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
              <span className="badge-pill text-xs">
                <MessageCircle className="h-3.5 w-3.5 text-accent" />
                <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                  Perguntas frequentes
                </span>
              </span>
              <h2 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
                Tudo claro <span style={{ color: "oklch(0.62 0.19 250)" }}>antes de começar.</span>
              </h2>
            </div>
          </Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="card-elevated group overflow-hidden p-0 transition-all duration-300 hover:shadow-lg open:shadow-lg">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-foreground transition-colors group-hover:text-accent">
                    <span className="flex items-center gap-3">
                      <span className="h-6 w-1 rounded-full bg-border transition-colors group-open:bg-accent" />
                      {f.q}
                    </span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-lg leading-none text-muted-foreground transition-all duration-300 group-open:rotate-45 group-open:border-accent group-open:bg-accent group-open:text-accent-foreground">
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 pl-9 text-muted-foreground leading-relaxed">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Ainda com dúvidas?{" "}
              <Link
                to="/cadastrar"
                className="font-semibold text-foreground underline underline-offset-4"
              >
                Crie sua conta e teste grátis
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <Reveal>
            <div
              className="relative overflow-hidden rounded-3xl p-10 sm:p-16 text-center text-white shadow-2xl"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.45 0.14 245))",
              }}
            >
              <span className="pointer-events-none absolute -top-24 -left-16 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
              <span className="pointer-events-none absolute -bottom-24 -right-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ring-1 ring-inset ring-white/25">
                  <Sparkles className="h-3.5 w-3.5" />
                  Comece hoje
                </span>
                <h2 className="mt-6 text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                  Pronto para uma agenda que trabalha por você?
                </h2>
                <p className="mt-4 text-white/85 text-lg max-w-xl mx-auto">
                  Crie sua conta em menos de dois minutos e compartilhe seu link ainda hoje.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <Link
                    to="/cadastrar"
                    className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-semibold text-[#0F172A] shadow-lg transition-all hover:bg-white/95 hover:text-[#0F172A] hover:shadow-xl active:scale-[0.98]"
                  >
                    Criar minha conta grátis
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    to="/meus-agendamentos"
                    search={{ pro: undefined }}
                    className="inline-flex items-center rounded-full px-5 py-3 text-sm text-white/90 ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Sou cliente, quero consultar meu agendamento
                  </Link>
                </div>
                <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/80">
                  {["Sem cartão de crédito", "Cancele quando quiser", "Suporte em português"].map(
                    (item) => (
                      <li key={item} className="inline-flex items-center gap-2">
                        <Check className="h-4 w-4" strokeWidth={3} />
                        {item}
                      </li>
                    ),
                  )}
                </ul>
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
