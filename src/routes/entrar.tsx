import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
    <AuthLayout title="Entrar" subtitle="Acesse seu painel Agendaí">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <input type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Senha">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <button type="submit" disabled={loading} className="btn-brand w-full disabled:opacity-60">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground text-center">
        Ainda não tem conta?{" "}
        <Link to="/cadastrar" className="text-accent font-semibold hover:underline">Cadastre-se grátis</Link>
      </p>
    </AuthLayout>
  );
}

const inputCls =
  "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent transition";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground">
        <Link to="/" className="font-display text-3xl">Agendaí</Link>
        <div>
          <p className="font-display text-3xl leading-snug max-w-md">"Meus clientes marcam sozinhos. Voltei a ter fim de semana."</p>
          <p className="mt-4 text-sm opacity-80">— Marina, salão de beleza em Curitiba</p>
        </div>
        <span className="text-xs opacity-70">© {new Date().getFullYear()} Agendaí</span>
      </div>
      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-in-up">
          <Link to="/" className="lg:hidden block font-display text-2xl text-primary mb-8 text-center">Agendaí</Link>
          <h1 className="font-display text-3xl text-primary">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
