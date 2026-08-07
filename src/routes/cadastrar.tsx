import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { AuthLayout, Field } from "./entrar";
import { slugify } from "@/lib/booking";
import { isStrongPassword, passwordStrengthHint } from "@/lib/password";

export const Route = createFileRoute("/cadastrar")({
  head: () => ({
    meta: [
      { title: "Criar conta — Agendaí" },
      { name: "description", content: "Comece a receber agendamentos online em minutos." },
    ],
  }),
  component: SignUp,
});

const inputCls = "ui-field-input";

function SignUp() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(password)) return toast.error(passwordStrengthHint(password));
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/app",
          data: { full_name: ownerName },
        },
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
      void supabase
        .rpc("log_auth_event", { p_kind: "signup_success", p_contact: email.trim().toLowerCase() })
        .then(
          () => {},
          () => {},
        );
      router.navigate({ to: "/app" });
    } catch (err) {
      void supabase
        .rpc("log_auth_event", { p_kind: "signup_failed", p_contact: email.trim().toLowerCase() })
        .then(
          () => {},
          () => {},
        );
      const raw = err instanceof Error ? err.message : "";
      toast.error(
        /already registered/i.test(raw)
          ? "Este email já está cadastrado. Faça login."
          : /rate limit/i.test(raw)
            ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
            : "Não foi possível criar a conta. Tente novamente.",
      );
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
          <input
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Ex.: Barbearia do João"
            className={inputCls}
          />
        </Field>
        <Field label="Seu nome">
          <input
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Seu nome completo"
            className={inputCls}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className={inputCls}
          />
        </Field>
        <Field label="Senha (mínimo 8 caracteres, com letras e números)">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ex.: barbearia2026!"
            className={inputCls}
          />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="ui-ripple ui-btn-primary w-full inline-flex items-center justify-center gap-2 min-h-[56px] px-6 rounded-2xl font-semibold transition-all disabled:opacity-60"
        >
          {loading ? "Criando..." : "Criar minha conta"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground text-center">
        Já tem conta?{" "}
        <Link to="/entrar" className="ui-link">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
