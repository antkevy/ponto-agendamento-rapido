import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { slugify } from "@/lib/booking";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhoneBR, onlyDigits } from "@/lib/phone";
import { ImageUpload } from "@/components/image-upload";
import { ExternalLink } from "lucide-react";
import { AppearanceSettings } from "@/components/appearance-settings";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Agendaí" }] }),
  component: Page,
});

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [form, setForm] = useState({ business_name: "", slug: "", description: "", address: "", phone: "", logo_url: "", lat: "", lng: "", msg_confirmed: "", msg_cancelled: "" });

  useEffect(() => {
    if (pro) setForm({
      business_name: pro.business_name,
      slug: pro.slug,
      description: pro.description ?? "",
      address: pro.address ?? "",
      phone: onlyDigits(pro.phone ?? ""),
      logo_url: pro.logo_url ?? "",
      lat: pro.lat?.toString() ?? "",
      lng: pro.lng?.toString() ?? "",
      msg_confirmed: pro.msg_confirmed ?? "",
      msg_cancelled: pro.msg_cancelled ?? "",
    });
  }, [pro]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.phone && !isValidPhoneBR(form.phone)) throw new Error("Telefone incompleto. Use (XX) XXXXX-XXXX.");
      const slug = slugify(form.slug) || slugify(form.business_name);
      const lat = form.lat ? parseFloat(form.lat) : null;
      const lng = form.lng ? parseFloat(form.lng) : null;
      if ((lat && !lng) || (!lat && lng)) throw new Error("Preencha latitude e longitude, ou deixe ambos vazios.");
      const { error } = await supabase.from(db.profissionais).update({
        business_name: form.business_name.trim(),
        slug,
        description: form.description || null,
        address: form.address || null,
        phone: form.phone || null,
        logo_url: form.logo_url || null,
        lat,
        lng,
        msg_confirmed: form.msg_confirmed.trim() || null,
        msg_cancelled: form.msg_cancelled.trim() || null,
      }).eq("id", pro!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo!"); qc.invalidateQueries({ queryKey: ["my-professional"] }); },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Este endereço já está em uso." : e.message),
  });

  return (
    <AppShell title="Configurações">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="max-w-2xl space-y-6">

          <div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 rounded-2xl text-white shadow-[0_20px_60px_-30px_oklch(0.55_0.18_250_/_0.4)]"
            style={{ backgroundImage: "linear-gradient(135deg, oklch(0.55 0.18 250) 0%, oklch(0.45 0.14 245) 100%)" }}
          >
            <div className="min-w-0">
              <p className="text-xs opacity-80">Sua página pública</p>
              <p className="font-mono text-sm break-all">/p/{form.slug || pro.slug}</p>
            </div>
            <a
              href={`/p/${form.slug || pro.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-[#0F172A] font-semibold rounded-full px-5 py-2.5 min-h-[44px] hover:bg-white/90 hover:text-[#0F172A] transition shrink-0"
            >
              <ExternalLink className="h-4 w-4" /> Ver página
            </a>
          </div>

          <div className="card-elevated p-6 space-y-5">
            <h3 className="text-lg font-bold tracking-tight">Perfil do negócio</h3>
            <F label="Nome do negócio">
              <input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Ex.: Barbearia do João" className={cls} />
            </F>
            <F label="Descrição">
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cls} placeholder="Fale um pouco sobre seu negócio..." />
            </F>
            <ImageUpload
              value={form.logo_url}
              onChange={(v) => setForm({ ...form, logo_url: v })}
              label="Logo do negócio"
              shape="circle"
              folder="logos"
            />
          </div>

          <div className="card-elevated p-6 space-y-5">
            <h3 className="text-lg font-bold tracking-tight">Endereço público</h3>
            <p className="text-xs text-muted-foreground -mt-3">URL que seus clientes usam para agendar.</p>
            <F label="Slug" hint={`agendai.com.br/p/${form.slug || "seu-negocio"}`}>
              <input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="meu-negocio" className={cls} />
            </F>
          </div>

          <div className="card-elevated p-6 space-y-5">
            <h3 className="text-lg font-bold tracking-tight">Localização</h3>
            <F label="Endereço físico">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro..." className={cls} />
            </F>
          </div>

          <div className="card-elevated p-6 space-y-5">
            <h3 className="text-lg font-bold tracking-tight">Contato</h3>
            <F label="Telefone de contato">
              <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} className={cls} />
            </F>
          </div>

          <div className="card-elevated p-6 space-y-5">
            <h3 className="text-lg font-bold tracking-tight">Mensagens do WhatsApp</h3>
            <p className="text-xs text-muted-foreground -mt-3">Use <code className="text-accent">{`{nome}`}</code>, <code className="text-accent">{`{negocio}`}</code>, <code className="text-accent">{`{servico}`}</code>, <code className="text-accent">{`{valor}`}</code>, <code className="text-accent">{`{data}`}</code>, <code className="text-accent">{`{horario}`}</code> para personalizar.</p>
            <F label="Confirmado"><textarea rows={4} value={form.msg_confirmed} onChange={(e) => setForm({ ...form, msg_confirmed: e.target.value })} className={cls} placeholder={"Ola {nome}! Seu agendamento na {negocio} esta confirmado!\n\nData: {data}\nHorario: {horario}\nServico: {servico}\nValor: {valor}"} /></F>
            <F label="Cancelado"><textarea rows={4} value={form.msg_cancelled} onChange={(e) => setForm({ ...form, msg_cancelled: e.target.value })} className={cls} placeholder={"Ola {nome}! Notamos que voce cancelou seu agendamento na {negocio}.\n\nSe precisar de ajuda ou quiser remarcar, e so nos chamar!"} /></F>
          </div>

          <button disabled={save.isPending} className="btn-brand disabled:opacity-60">{save.isPending ? "Salvando..." : "Salvar alterações"}</button>

          <div className="pt-2"><AppearanceSettings /></div>
        </form>
      )}
    </AppShell>
  );
}

const cls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium">{label}</span>{children}{hint && <span className="text-xs text-muted-foreground mt-1 block font-mono">{hint}</span>}</label>;
}
