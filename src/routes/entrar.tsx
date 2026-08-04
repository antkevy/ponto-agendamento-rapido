import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRight, Check, Lock, Mail, ShieldCheck, CalendarCheck2, Headphones } from "lucide-react";
import { UIButton, UICard, UIInput, UIPasswordInput, UITitle } from "@/components/ui-kit";
import authBg from "@/assets/auth-bg.jpg";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — Agendaí" },
      { name: "description", content: "Acesse seu painel Agendaí e gerencie agendamentos, serviços e horários." },
      { property: "og:title", content: "Entrar no Agendaí" },
      { property: "og:description", content: "Acesse seu painel e gerencie sua agenda online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    router.navigate({ to: "/app" });
  }

  async function onForgot() {
    if (!email) return toast.error("Digite seu email para receber o link de recuperação.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/entrar`,
    });
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de recuperação para o seu email.");
  }

  function social(provider: "google" | "apple") {
    toast.info(
      provider === "google"
        ? "Login com Google ainda não está habilitado nesta conta."
        : "Login com Apple ainda não está habilitado nesta conta.",
    );
  }

  return (
    <AuthLayout title="Bem-vindo de volta." accent="Entre e continue." subtitle="Acesse seu painel para gerenciar agendamentos, serviços e horários.">
      <form onSubmit={onSubmit} className="space-y-4">
        <UIInput
          label="E-mail"
          icon={Mail}
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />
        <UIPasswordInput
          label="Senha"
          icon={Lock}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Sua senha"
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded-[5px] accent-[var(--btn-color)]"
            />
            Lembrar de mim
          </label>
          <button type="button" onClick={onForgot} className="ui-link text-sm">
            Esqueci minha senha
          </button>
        </div>

        <UIButton type="submit" size="lg" fullWidth disabled={loading}>
          {loading ? "Entrando..." : (<>Entrar <ArrowRight className="h-5 w-5" /></>)}
        </UIButton>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou continue com
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <UIButton type="button" variant="outline" onClick={() => social("google")}>
          <GoogleGlyph /> Google
        </UIButton>
        <UIButton type="button" variant="outline" onClick={() => social("apple")}>
          <AppleGlyph /> Apple
        </UIButton>
      </div>

      <p className="mt-6 text-sm text-muted-foreground text-center">
        Ainda não possui conta?{" "}
        <Link to="/cadastrar" className="ui-link">Cadastre-se gratuitamente</Link>
      </p>
    </AuthLayout>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0A12 12 0 0 0 1.2 6.6l4 3.1c1-2.9 3.7-4.9 6.8-4.9Z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.8c0-2.6 2.1-3.9 2.2-4-1.2-1.8-3.1-2-3.8-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3 0 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.2-1.2 3.1-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9Zm-2.6-7.2c.7-.9 1.2-2.1 1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3.1-1.5Z" />
    </svg>
  );
}

const BENEFITS = [
  { icon: ShieldCheck, label: "Sem cartão" },
  { icon: CalendarCheck2, label: "Cancele quando quiser" },
  { icon: Headphones, label: "Suporte em português" },
];

export function AuthLayout({
  title,
  accent,
  subtitle,
  children,
}: {
  title: string;
  accent?: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="ui-auth-bg" style={{ backgroundImage: `url(${authBg})` }} aria-hidden="true" />
      <div className="ui-auth-overlay" aria-hidden="true" />

      <div className="relative">
        <header className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors max-sm:hidden">
              Voltar ao início
            </Link>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 sm:px-8 pt-2 pb-16">
          <UICard glass className="mt-4 p-6 sm:p-8 animate-ui-scale-in">
            <UITitle size="lg" accent={accent}>{title}</UITitle>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </UICard>

          <ul className="mt-7 grid grid-cols-3 gap-2 text-center">
            {BENEFITS.map((b, i) => (
              <li key={b.label} className="ui-stagger flex flex-col items-center gap-2" style={{ ["--i" as string]: i + 1 }}>
                <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
                  <b.icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
                  {b.label}
                </span>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-foreground mb-2">{label}</span>
      {children}
    </label>
  );
}
