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
import { Pencil, Trash2, Plus, Clock, Upload, X } from "lucide-react";


export const Route = createFileRoute("/app/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Agendaí" }] }),
  component: Page,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null; image_url: string | null; is_active: boolean };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [view, setView] = useState<ViewMode>("list");


  const { data: services } = useQuery({
    queryKey: ["services", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from(db.servicos).select("*").eq("professional_id", pro!.id).order("created_at");
      if (error) throw error;
      return data as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ image, ...s }: Partial<Service> & { image?: File }) => {
      if (!pro) throw new Error();
      let image_url = s.image_url ?? null;
      let serviceId = s.id ?? crypto.randomUUID();
      if (image) {
        const ext = image.name.split(".").pop();
        const path = `${pro.user_id}/services/${serviceId}.${ext}`;
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
      if (s.id) {
        const { error } = await supabase.from(db.servicos).update({ name: s.name!, duration_minutes: s.duration_minutes!, price_cents: s.price_cents ?? 0, description: s.description ?? null, image_url, is_active: s.is_active ?? true }).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.servicos).insert({ id: serviceId, professional_id: pro.id, name: s.name!, duration_minutes: s.duration_minutes!, price_cents: s.price_cents ?? 0, description: s.description ?? null, image_url });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); setEditing(null); toast.success("Serviço salvo!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(db.servicos).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("Removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Serviços">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <button onClick={() => setEditing({ duration_minutes: 30 })} className="btn-brand inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Novo serviço
            </button>
            <ViewToggle value={view} onChange={setView} />
          </div>
          {(services ?? []).length === 0 && <p className="text-muted-foreground text-sm">Nenhum serviço ainda. Crie o primeiro para começar a receber agendamentos.</p>}
          {view === "list" ? (
            <div className="grid gap-3">
              {(services ?? []).map((s) => (
                <div key={s.id} className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    {s.image_url && <img src={s.image_url} alt={s.name} className="h-14 w-14 rounded-lg object-cover shrink-0 aspect-square" />}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-sm text-muted-foreground">{s.duration_minutes} min · {formatBRL(s.price_cents)}</p>
                      {s.description && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{s.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditing(s)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este serviço?")) remove.mutate(s.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(services ?? []).map((s) => (
                <div key={s.id} className="card-elevated p-4 flex flex-col gap-2">
                  {s.image_url && <img src={s.image_url} alt={s.name} className="w-full aspect-square rounded-lg object-cover" />}
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min</p>
                  <p className="text-lg font-black tracking-tight">{formatBRL(s.price_cents)}</p>
                  {s.description && <p className="text-sm text-muted-foreground line-clamp-3">{s.description}</p>}
                  <div className="flex gap-2 mt-auto pt-2">
                    <button onClick={() => setEditing(s)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 flex-1 justify-center"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm("Excluir este serviço?")) remove.mutate(s.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}


          {editing && (
            <Modal onClose={() => setEditing(null)}>
              <ServiceForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} />
            </Modal>
          )}
        </>
      )}
    </AppShell>
  );
}

function ServiceForm({ initial, onSubmit, saving }: { initial: Partial<Service>; onSubmit: (s: Partial<Service> & { image?: File }) => void; saving: boolean }) {
  const [name, setName] = useState(initial.name ?? "");
  const [duration, setDuration] = useState(initial.duration_minutes ?? 30);
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
    <form onSubmit={(e) => { e.preventDefault(); const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100); onSubmit({ id: initial.id, name, duration_minutes: duration, price_cents: cents, description: description || null, image_url: initial.image_url, image: imageFile ?? undefined }); }} className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-foreground">{initial.id ? "Editar" : "Novo"} serviço</h2>

      <div>
        <span className="text-sm font-medium">Foto (opcional)</span>
        {preview ? (
          <div className="relative mt-1 w-full h-36 rounded-lg overflow-hidden border border-border">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button type="button" onClick={clearImage} className="absolute top-2 right-2 bg-background/80 rounded-full p-1"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full mt-1 min-h-[44px] rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
            <Upload className="h-4 w-4" /> Escolher foto
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-1">Recomendado: 600×600 px</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Corte de cabelo" className={inputCls} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-sm font-medium">Duração (min)</span>
          <input required type="number" inputMode="numeric" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} placeholder="30" className={inputCls} /></label>
        <label className="block"><span className="text-sm font-medium">Preço (R$)</span>
          <input inputMode="decimal" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} placeholder="0,00" className={inputCls} /></label>
      </div>
      <label className="block"><span className="text-sm font-medium">Descrição (opcional)</span>
        <textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o serviço..." className={inputCls} /></label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

const inputCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid sm:place-items-center animate-fade-in-up" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-2xl p-6 h-full sm:h-auto sm:my-8 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
        <button onClick={onClose} className="btn-outline-brand w-full mt-3">Cancelar</button>
      </div>
    </div>
  );
}
