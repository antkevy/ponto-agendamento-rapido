import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/booking";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhoneBR, onlyDigits } from "@/lib/phone";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Agendaí" }] }),
  component: Page,
});

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [form, setForm] = useState({ business_name: "", slug: "", description: "", address: "", phone: "", brand_color: "#0284C7", logo_url: "" });

  useEffect(() => {
    if (pro) setForm({
      business_name: pro.business_name,
      slug: pro.slug,
      description: pro.description ?? "",
      address: pro.address ?? "",
      phone: onlyDigits(pro.phone ?? ""),
      brand_color: pro.brand_color ?? "#0284C7",
      logo_url: pro.logo_url ?? "",
    });
  }, [pro]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.phone && !isValidPhoneBR(form.phone)) throw new Error("Telefone incompleto. Use (XX) XXXXX-XXXX.");
      const slug = slugify(form.slug) || slugify(form.business_name);
      const { error } = await supabase.from("professionals").update({
        business_name: form.business_name.trim(),
        slug,
        description: form.description || null,
        address: form.address || null,
        phone: form.phone || null,
        brand_color: form.brand_color,
        logo_url: form.logo_url || null,
      }).eq("id", pro!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo!"); qc.invalidateQueries({ queryKey: ["my-professional"] }); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Este endereço já está em uso." : e.message),
  });

  return (
    <AppShell title="Configurações">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="card-elevated p-6 space-y-4 max-w-2xl">
          <F label="Nome do negócio">
            <input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className={cls} />
          </F>
          <F label="Endereço público" hint={`agendai.com.br/p/${form.slug || "seu-negocio"}`}>
            <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={cls} />
          </F>
          <F label="Descrição">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cls} placeholder="Fale um pouco sobre seu negócio..." />
          </F>
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Endereço físico"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={cls} /></F>
            <F label="Telefone de contato"><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} className={cls} /></F>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Cor de destaque">
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} className="h-11 w-16 rounded-lg border border-border cursor-pointer" />
                <input value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} className={cls + " font-mono"} />
              </div>
            </F>
            <F label="Logo (URL)"><input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." className={cls} /></F>
          </div>
          <button disabled={save.isPending} className="btn-brand disabled:opacity-60">{save.isPending ? "Salvando..." : "Salvar alterações"}</button>
        </form>
      )}
    </AppShell>
  );
}

const cls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{children}{hint && <span className="text-xs text-muted-foreground mt-1 block font-mono">{hint}</span>}</label>;
}
