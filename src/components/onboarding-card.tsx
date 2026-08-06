import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { useAuth } from "@/hooks/use-auth";
import { slugify } from "@/lib/booking";

export function OnboardingCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const baseSlug = slugify(businessName) || "meu-negocio";
      let slug = baseSlug;
      for (let i = 0; i < 8; i++) {
        const { error } = await supabase.from(db.profissionais).insert({
          user_id: user.id,
          slug,
          business_name: businessName.trim(),
        });
        if (!error) {
          toast.success("Perfil criado!");
          qc.invalidateQueries({ queryKey: ["my-professional"] });
          return;
        }
        if (error.code === "23505") {
          slug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
          continue;
        }
        throw error;
      }
      throw new Error("Não foi possível gerar um endereço único.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-elevated p-6 max-w-lg animate-fade-in-up">
      <h2 className="text-2xl font-black tracking-tight text-foreground">
        Vamos configurar seu negócio
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Como se chama seu negócio? Isso vai aparecer na sua página pública.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <input
          required
          autoFocus
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Ex.: Barbearia do João"
          className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" disabled={loading} className="btn-brand w-full disabled:opacity-60">
          {loading ? "Criando..." : "Criar meu perfil"}
        </button>
      </form>
    </div>
  );
}
