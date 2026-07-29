import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL } from "@/lib/booking";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { Pencil, Trash2, Plus, Upload, X } from "lucide-react";
import { Modal } from "./app.servicos";

export const Route = createFileRoute("/app/planos")({
  head: () => ({ meta: [{ title: "Planos — Agendaí" }] }),
  component: Page,
});

type Plano = { id: string; name: string; description: string | null; price_cents: number; image_url: string | null; is_active: boolean };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Plano> | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  const { data: planos } = useQuery({
    queryKey: ["planos", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from(db.planos).select("*").eq("professional_id", pro!.id).order("created_at");
      if (error) throw error;
      return data as Plano[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ image, ...p }: Partial<Plano> & { image?: File }) => {
      if (!pro) throw new Error();
      let image_url = p.image_url ?? null;
      let planoId = p.id ?? crypto.randomUUID();
      if (image) {
        const ext = image.name.split(".").pop();
        const path = `${pro.user_id}/planos/${planoId}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("brand-assets").upload(path, image, {
          upsert: true,
          contentType: image.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
        });
        if (uploadError) throw uploadError;
        const { data: signed, error: signErr } = await supabase.storage
          .from("brand-assets")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (signErr) throw signErr;
        image_url = signed.signedUrl;
      }
      if (p.id) {
        const { error } = await supabase.from(db.planos).update({ name: p.name!, price_cents: p.price_cents ?? 0, description: p.description ?? null, image_url, is_active: p.is_active ?? true }).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.planos).insert({ id: planoId, professional_id: pro.id, name: p.name!, price_cents: p.price_cents ?? 0, description: p.description ?? null, image_url });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planos"] }); setEditing(null); toast.success("Plano salvo!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(db.planos).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planos"] }); toast.success("Removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Planos">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <button onClick={() => setEditing({})} className="btn-brand inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Novo plano
            </button>
            <ViewToggle value={view} onChange={setView} />
          </div>
          {(planos ?? []).length === 0 && <p className="text-muted-foreground text-sm">Nenhum plano ainda. Crie o primeiro para oferecer assinaturas ou pacotes.</p>}
          {view === "list" ? (
            <div className="grid gap-3">
              {(planos ?? []).map((p) => (
                <div key={p.id} className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    {p.image_url && <img src={p.image_url} alt={p.name} className="h-14 w-14 rounded-lg object-cover shrink-0 aspect-square" />}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{formatBRL(p.price_cents)}</p>
                      {p.description && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditing(p)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este plano?")) remove.mutate(p.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(planos ?? []).map((p) => (
                <div key={p.id} className="card-elevated p-4 flex flex-col gap-2">
                  {p.image_url && <img src={p.image_url} alt={p.name} className="w-full aspect-square rounded-lg object-cover" />}
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-lg font-black tracking-tight">{formatBRL(p.price_cents)}</p>
                  {p.description && <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>}
                  <div className="flex gap-2 mt-auto pt-2">
                    <button onClick={() => setEditing(p)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 flex-1 justify-center"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este plano?")) remove.mutate(p.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editing && (
            <Modal onClose={() => setEditing(null)}>
              <PlanoForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} />
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}

function PlanoForm({ initial, onSubmit, saving }: { initial: Partial<Plano>; onSubmit: (p: Partial<Plano> & { image?: File }) => void; saving: boolean }) {
  const [name, setName] = useState(initial.name ?? "");
  const [priceReais, setPriceReais] = useState(((initial.price_cents ?? 0) / 100).toString().replace(".", ","));
  const [description, setDescription] = useState(initial.description ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(initial.image_url ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setPreview("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100); onSubmit({ id: initial.id, name, price_cents: cents, description: description || null, image_url: initial.image_url, image: imageFile ?? undefined }); }} className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-foreground">{initial.id ? "Editar" : "Novo"} plano</h2>

      <div>
        <span className="text-sm font-medium">Imagem (opcional)</span>
        {preview ? (
          <div className="relative mt-1 w-full h-36 rounded-lg overflow-hidden border border-border">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button type="button" onClick={clearImage} className="absolute top-2 right-2 bg-background/80 rounded-full p-1"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full mt-1 min-h-[44px] rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
            <Upload className="h-4 w-4" /> Escolher imagem
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-1">Recomendado: 600×600 px</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Plano Mensal" className={inputCls} /></label>
      <label className="block"><span className="text-sm font-medium">Preço (R$)</span>
        <input inputMode="decimal" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} placeholder="0,00" className={inputCls} /></label>
      <label className="block"><span className="text-sm font-medium">Descrição (opcional)</span>
        <textarea rows={4} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o que inclui neste plano..." className={inputCls} /></label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

const inputCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";
