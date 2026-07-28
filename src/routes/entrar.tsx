import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/entrar")({
  head: () => ({ meta: [{ title: "Entrar — Agendaí" }, { name: "description", content: "Acesse seu painel Agendaí." }] }),
  component: SignIn,
});

function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <AuthLayout
      title="Bem-vindo de volta."
      accent="Entre e continue."
      subtitle="Acesse seu painel para gerenciar agendamentos, serviços e horários."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <input type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} />
        </Field>
        <Field label="Senha">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" className={inputCls} />
        </Field>
        <button type="submit" disabled={loading} className="btn-gradient w-full inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? "Entrando..." : (<>Entrar <ArrowRight className="h-5 w-5" /></>)}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground text-center">
        Ainda não tem conta?{" "}
        <Link to="/cadastrar" className="font-semibold hover:underline" style={{ color: "oklch(0.55 0.18 250)" }}>Cadastre-se grátis</Link>
      </p>
    </AuthLayout>
  );
}

const inputCls =
  "w-full min-h-[48px] px-4 py-3 rounded-xl border border-border bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition";

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
    <div className="min-h-screen bg-page-gradient">
      <header className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
        <BrandLogo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Voltar ao início
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 sm:px-8 pt-6 pb-20">
        <div className="animate-fade-in-up">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-[1.05]">
            {title}
            {accent && (
              <>
                {" "}
                <span style={{ color: "oklch(0.55 0.18 250)" }}>{accent}</span>
              </>
            )}
          </h1>
          <p className="mt-3 text-base text-muted-foreground">{subtitle}</p>

          <div className="mt-8 bg-card dark:bg-slate-800 border border-border rounded-2xl p-6 sm:p-8 shadow-[0_20px_60px_-30px_oklch(0.55_0.18_250_/_0.25)]">
            {children}
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {["Sem cartão", "Cancele quando quiser", "Suporte em português"].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" style={{ color: "oklch(0.6 0.15 155)" }} strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-foreground dark:text-slate-100 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
