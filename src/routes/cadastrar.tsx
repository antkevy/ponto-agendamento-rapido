import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { AuthLayout, Field } from "./entrar";
import { slugify } from "@/lib/booking";

export const Route = createFileRoute("/cadastrar")({
  head: () => ({ meta: [{ title: "Criar conta — Agendaí" }, { name: "description", content: "Comece a receber agendamentos online em minutos." }] }),
  component: SignUp,
});

const inputCls =
  "w-full min-h-[48px] px-4 py-3 rounded-xl border border-border bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition";


function SignUp() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Senha precisa ter ao menos 6 caracteres.");
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/app", data: { full_name: ownerName } },
      });
      if (error) throw error;
      const user = data.user;
      if (!user) throw new Error("Não foi possível criar a conta.");

      // Try to create the professional profile (may need active session)
      const baseSlug = slugify(businessName) || "meu-negocio";
      let slug = baseSlug;
      for (let i = 0; i < 8; i++) {
        const { error: insErr } = await supabase.from(db.profissionais).insert({
          user_id: user.id,
          slug,
          business_name: businessName.trim(),
          owner_name: ownerName.trim() || null,
        });
        if (!insErr) break;
        if (insErr.code === "23505") {
          slug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
          continue;
        }
        // Session may not be ready yet if email confirmation is on; ignore silently — dashboard will handle it.
        break;
      }

      toast.success("Conta criada! Bem-vindo ao Agendaí.");
      router.navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Comece grátis."
      accent="Em 2 minutos."
      subtitle="Crie sua conta e receba agendamentos online sem precisar responder mensagem por mensagem."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nome do seu negócio">
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex.: Barbearia do João" className={inputCls} />
        </Field>
        <Field label="Seu nome">
          <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Seu nome completo" className={inputCls} />
        </Field>
        <Field label="Email">
          <input type="email" required inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} />
        </Field>
        <Field label="Senha (mínimo 6 caracteres)">
          <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className={inputCls} />
        </Field>
        <button type="submit" disabled={loading} className="btn-gradient w-full inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? "Criando..." : "Criar minha conta"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground text-center">
        Já tem conta?{" "}
        <Link to="/entrar" className="font-semibold hover:underline" style={{ color: "oklch(0.55 0.18 250)" }}>Entrar</Link>
      </p>
    </AuthLayout>
  );
}

