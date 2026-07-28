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
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Agendaí" }] }),
  component: Page,
});

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [form, setForm] = useState({ business_name: "", slug: "", description: "", address: "", phone: "", logo_url: "" });

  useEffect(() => {
    if (pro) setForm({
      business_name: pro.business_name,
      slug: pro.slug,
      description: pro.description ?? "",
      address: pro.address ?? "",
      phone: onlyDigits(pro.phone ?? ""),
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
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="card-elevated p-6 space-y-5 max-w-2xl">
          <F label="Nome do negócio">
            <input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Ex.: Barbearia do João" className={cls} />
          </F>
          <F label="Endereço público" hint={`agendai.com.br/p/${form.slug || "seu-negocio"}`}>
            <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="meu-negocio" className={cls} />
          </F>
          <F label="Descrição">
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cls} placeholder="Fale um pouco sobre seu negócio..." />
          </F>
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Endereço físico" hint="Aparece na página de agendamento com link para o Google Maps"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro..." className={cls} /></F>
            <F label="Telefone de contato"><PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} className={cls} /></F>
          </div>
          <ImageUpload
            value={form.logo_url}
            onChange={(v) => setForm({ ...form, logo_url: v })}
            label="Logo do negócio"
            shape="circle"
            folder="logos"
          />
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
