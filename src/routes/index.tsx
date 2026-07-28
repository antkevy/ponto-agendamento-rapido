import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck2, Clock3, Smartphone, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agendaí — Agendamento online para o seu negócio" },
      {
        name: "description",
        content:
          "Sua agenda online, sempre aberta. Deixe seus clientes marcarem horário sozinhos, 24h por dia — sem WhatsApp, sem confusão.",
      },
      { property: "og:title", content: "Agendaí — Agendamento online simples" },
      {
        property: "og:description",
        content: "Menos mensagens no WhatsApp, mais horários preenchidos.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="font-display text-2xl text-primary">Agendaí</span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link to="/entrar" className="text-sm font-medium text-foreground hover:text-accent transition-colors px-3 py-2">
              Entrar
            </Link>
            <Link to="/cadastrar" className="btn-brand text-sm">
              Criar conta grátis
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Feito no Brasil
          </span>
          <h1 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-display font-semibold text-primary leading-[1.05]">
            Sua agenda online,<br />sempre aberta.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            O Agendaí deixa seus clientes marcarem horário sozinhos, a qualquer hora.
            Chega de trocar mensagem no WhatsApp para confirmar disponibilidade.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link to="/cadastrar" className="btn-brand inline-flex items-center justify-center">
              Começar de graça
            </Link>
            <Link to="/meus-agendamentos" className="btn-outline-brand inline-flex items-center justify-center">
              Consultar meu agendamento
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={CalendarCheck2} title="Sem conflitos" text="Horários se atualizam em tempo real. Impossível marcar dois clientes ao mesmo tempo." />
          <Feature icon={Clock3} title="Aberto 24h" text="Sua página pública recebe agendamentos enquanto você trabalha, dorme ou descansa." />
          <Feature icon={Smartphone} title="Feito para o celular" text="Interface pensada pro dedo — botões grandes, tudo rápido, funciona em qualquer aparelho." />
          <Feature icon={ShieldCheck} title="Sua marca, sua página" text="Nome, logo e cor do seu negócio na página que o cliente enxerga." />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-display text-primary text-lg">Agendaí</span>
          <span>© {new Date().getFullYear()} — feito com carinho no Brasil.</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof CalendarCheck2; title: string; text: string }) {
  return (
    <div className="animate-fade-in-up">
      <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground grid place-items-center">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}
