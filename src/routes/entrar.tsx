import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowRight,
  Check,
  Lock,
  Mail,
  ShieldCheck,
  CalendarCheck2,
  Headphones,
} from "lucide-react";
import { UIButton, UICard, UIInput, UIPasswordInput, UITitle } from "@/components/ui-kit";
import authBg from "@/assets/auth-bg.jpg";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — Agendaí" },
      {
        name: "description",
        content: "Acesse seu painel Agendaí e gerencie agendamentos, serviços e horários.",
      },
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
  const [recovering, setRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("agendai_recovering", "1");
        setRecovering(true);
      }
    });
    if (sessionStorage.getItem("agendai_recovering") === "1") setRecovering(true);
    return () => subscription.subscription.unsubscribe();
  }, []);

  function finishRecovery() {
    sessionStorage.removeItem("agendai_recovering");
    setRecovering(false);
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) return toast.error("Não foi possível atualizar a senha. Tente novamente.");
    await supabase.auth.signOut();
    finishRecovery();
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha atualizada! Faça login com a nova senha.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      void supabase
        .rpc("log_auth_event", { p_kind: "login_failed", p_contact: email.trim().toLowerCase() })
        .then(
          () => {},
          () => {},
        );
      return toast.error("Email ou senha inválidos.");
    }
    toast.success("Bem-vindo de volta!");
    router.navigate({ to: "/app" });
  }

  async function onForgot() {
    if (!email) return toast.error("Digite seu email para receber o link de recuperação.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/entrar`,
    });
    if (error) return toast.error("Não foi possível enviar o link. Verifique o email digitado.");
    toast.success("Enviamos um link de recuperação para o seu email.");
  }

  return (
    <AuthLayout
      title="Bem-vindo de volta."
      accent="Entre e continue."
      subtitle="Acesse seu painel para gerenciar agendamentos, serviços e horários."
    >
      {recovering ? (
        <form onSubmit={onResetPassword} className="space-y-3">
          <UIPasswordInput
            label="Nova senha"
            icon={Lock}
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo de 6 caracteres"
          />
          <UIPasswordInput
            label="Confirmar nova senha"
            icon={Lock}
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
          />
          <UIButton type="submit" size="lg" fullWidth disabled={resetLoading}>
            {resetLoading ? "Salvando..." : "Salvar nova senha"}
          </UIButton>
          <button
            type="button"
            onClick={() => {
              void supabase.auth.signOut().then(finishRecovery);
            }}
            className="ui-link text-sm w-full text-center"
          >
            Voltar ao login
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={onSubmit} className="space-y-3">
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
              {loading ? (
                "Entrando..."
              ) : (
                <>
                  Entrar <ArrowRight className="h-5 w-5" />
                </>
              )}
            </UIButton>
          </form>

          <p className="mt-4 text-sm text-muted-foreground text-center">
            Ainda não possui conta?{" "}
            <Link to="/cadastrar" className="ui-link">
              Cadastre-se gratuitamente
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
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
      <div
        className="ui-auth-bg"
        style={{ backgroundImage: `url(${authBg})` }}
        aria-hidden="true"
      />
      <div className="ui-auth-overlay" aria-hidden="true" />

      <div className="relative">
        <header className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors max-sm:hidden"
            >
              Voltar ao início
            </Link>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 sm:px-8 pt-1 pb-8">
          <UICard glass className="mt-3 p-5 sm:p-6 animate-ui-scale-in">
            <UITitle size="lg" accent={accent}>
              {title}
            </UITitle>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
            <div className="mt-4">{children}</div>
          </UICard>

          <ul className="mt-5 grid grid-cols-3 gap-2 text-center">
            {BENEFITS.map((b, i) => (
              <li
                key={b.label}
                className="ui-stagger flex flex-col items-center gap-1"
                style={{ ["--i" as string]: i + 1 }}
              >
                <span className="ui-icon-bubble h-9 w-9 grid place-items-center rounded-xl">
                  <b.icon className="h-4 w-4" />
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
