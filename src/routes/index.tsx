import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles, CalendarCheck2 } from "lucide-react";

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

function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-full grid place-items-center text-white shadow-md"
              style={{ backgroundImage: "linear-gradient(180deg, oklch(0.62 0.17 250), oklch(0.55 0.18 250))" }}>
              <CalendarCheck2 className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="text-2xl font-bold tracking-tight text-foreground">Agendaí</span>
          </Link>
          <Link to="/cadastrar" className="btn-pill-solid inline-flex items-center text-sm sm:text-base">
            Começar grátis
          </Link>
        </div>
      </header>

      {/* Hero with soft gradient */}
      <section
        className="relative"
        style={{
          backgroundImage:
            "linear-gradient(180deg, oklch(0.97 0.02 250) 0%, oklch(0.99 0.008 250) 55%, #ffffff 100%)",
        }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-14 pb-24 sm:pt-20 sm:pb-28 text-center">
          <div className="animate-fade-in-up inline-flex">
            <span className="badge-pill">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-muted-foreground">
                <span className="text-foreground font-semibold">Novo</span> · Confirmações automáticas por WhatsApp
              </span>
            </span>
          </div>

          <h1 className="mt-8 text-5xl sm:text-6xl lg:text-7xl font-sans font-black tracking-tight text-foreground leading-[1.02]"
              style={{ fontFamily: "var(--font-sans)" }}>
            Gerencie seus agendamentos{" "}
            <span style={{ color: "oklch(0.62 0.19 250)" }}>de forma simples.</span>
          </h1>

          <p className="mt-6 sm:mt-8 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Organize seus clientes, horários e serviços em um único lugar. Uma plataforma
            minimalista, rápida e feita para profissionais como você.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/cadastrar" className="btn-gradient inline-flex items-center gap-2 w-full sm:w-auto justify-center">
              Agendar agora
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link to="/entrar" className="btn-pill-outline inline-flex items-center w-full sm:w-auto justify-center">
              Conhecer plataforma
            </Link>
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {[
              "Sem cartão de crédito",
              "Configuração em 2 min",
              "Cancele quando quiser",
            ].map((item) => (
              <li key={item} className="inline-flex items-center gap-2">
                <Check className="h-4 w-4" style={{ color: "oklch(0.6 0.15 155)" }} strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
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
