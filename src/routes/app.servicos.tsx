import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL, WEEKDAYS_PT } from "@/lib/booking";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { ImageUpload } from "@/components/image-upload";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pencil, Trash2, Plus, Clock, Upload, X, Power, User } from "lucide-react";

export const Route = createFileRoute("/app/servicos")({
  head: () => ({ meta: [{ title: "Serviços — Agendaí" }] }),
  component: Page,
});

type Pro = NonNullable<NonNullable<ReturnType<typeof useMyProfessional>>["data"]>;

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
};
type Plano = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_active: boolean;
};
type Produto = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_active: boolean;
};
type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };
type HorarioRow = { id: string; weekday: number; start_time: string; end_time: string };
type Employee = { id: string; name: string; photo_url: string | null; is_active: boolean };
type EmployeeService = { id: string; name: string };
type EmployeeAvailRow = { id: string; weekday: number; start_time: string; end_time: string };
type EmployeeBlockRow = { id: string; starts_at: string; ends_at: string; reason: string | null };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();

  return (
    <AppShell title="Serviços">
      {isLoading ? (
        <div className="skeleton h-32" />
      ) : !pro ? (
        <OnboardingCard />
      ) : (
        <Tabs defaultValue="servicos" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="servicos">Serviços</TabsTrigger>
            <TabsTrigger value="planos">Planos</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          </TabsList>

          <TabsContent value="servicos" className="space-y-4">
            <ServicosTab pro={pro} />
          </TabsContent>
          <TabsContent value="planos" className="space-y-4">
            <PlanosTab pro={pro} />
          </TabsContent>
          <TabsContent value="produtos" className="space-y-4">
            <ProdutosTab pro={pro} />
          </TabsContent>
          <TabsContent value="bloqueios" className="space-y-4">
            <BloqueiosTab pro={pro} />
          </TabsContent>
          <TabsContent value="horarios" className="space-y-4">
            <HorariosTab pro={pro} />
          </TabsContent>
          <TabsContent value="funcionarios" className="space-y-4">
            <FuncionariosTab pro={pro} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function ServicosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  const { data: services } = useQuery({
    queryKey: ["services", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.servicos)
        .select("*")
        .eq("professional_id", pro.id)
        .order("created_at");
      if (error) throw error;
      return data as Service[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ image, ...s }: Partial<Service> & { image?: File }) => {
      let image_url = s.image_url ?? null;
      const serviceId = s.id ?? crypto.randomUUID();
      if (image) {
        const ext = image.name.split(".").pop();
        const path = `${pro.user_id}/services/${serviceId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(path, image, {
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
        const { error } = await supabase
          .from(db.servicos)
          .update({
            name: s.name!,
            duration_minutes: s.duration_minutes!,
            price_cents: s.price_cents ?? 0,
            description: s.description ?? null,
            image_url,
            is_active: s.is_active ?? true,
          })
          .eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.servicos).insert({
          id: serviceId,
          professional_id: pro.id,
          name: s.name!,
          duration_minutes: s.duration_minutes!,
          price_cents: s.price_cents ?? 0,
          description: s.description ?? null,
          image_url,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      setEditing(null);
      toast.success("Serviço salvo!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.servicos).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("Removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <button
          onClick={() => setEditing({ duration_minutes: 30 })}
          className="btn-brand inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Novo serviço
        </button>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {(services ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum serviço ainda. Crie o primeiro para começar a receber agendamentos.
        </p>
      )}
      {view === "list" ? (
        <div className="grid gap-3">
          {(services ?? []).map((s) => (
            <div
              key={s.id}
              className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                {s.image_url && (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="h-14 w-14 rounded-lg object-cover shrink-0 aspect-square"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.duration_minutes} min · {formatBRL(s.price_cents)}
                  </p>
                  {s.description && (
                    <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(s)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este serviço?")) remove.mutate(s.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(services ?? []).map((s) => (
            <div key={s.id} className="card-elevated p-4 flex flex-col gap-2">
              {s.image_url && (
                <img
                  src={s.image_url}
                  alt={s.name}
                  className="w-full aspect-square rounded-lg object-cover"
                />
              )}
              <p className="font-semibold truncate">{s.name}</p>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min
              </p>
              <p className="text-lg font-black tracking-tight">{formatBRL(s.price_cents)}</p>
              {s.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{s.description}</p>
              )}
              <div className="flex gap-2 mt-auto pt-2">
                <button
                  onClick={() => setEditing(s)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 flex-1 justify-center"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este serviço?")) remove.mutate(s.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
  );
}

function PlanosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Plano> | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  const { data: planos } = useQuery({
    queryKey: ["planos", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.planos)
        .select("*")
        .eq("professional_id", pro.id)
        .order("created_at");
      if (error) throw error;
      return data as Plano[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ image, ...p }: Partial<Plano> & { image?: File }) => {
      let image_url = p.image_url ?? null;
      const planoId = p.id ?? crypto.randomUUID();
      if (image) {
        const ext = image.name.split(".").pop();
        const path = `${pro.user_id}/planos/${planoId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(path, image, {
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
        const { error } = await supabase
          .from(db.planos)
          .update({
            name: p.name!,
            price_cents: p.price_cents ?? 0,
            description: p.description ?? null,
            image_url,
            is_active: p.is_active ?? true,
          })
          .eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.planos).insert({
          id: planoId,
          professional_id: pro.id,
          name: p.name!,
          price_cents: p.price_cents ?? 0,
          description: p.description ?? null,
          image_url,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planos"] });
      setEditing(null);
      toast.success("Plano salvo!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.planos).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planos"] });
      toast.success("Removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <button onClick={() => setEditing({})} className="btn-brand inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo plano
        </button>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {(planos ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum plano ainda. Crie o primeiro para oferecer assinaturas ou pacotes.
        </p>
      )}
      {view === "list" ? (
        <div className="grid gap-3">
          {(planos ?? []).map((p) => (
            <div
              key={p.id}
              className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-14 w-14 rounded-lg object-cover shrink-0 aspect-square"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBRL(p.price_cents)}</p>
                  {p.description && (
                    <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(p)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este plano?")) remove.mutate(p.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(planos ?? []).map((p) => (
            <div key={p.id} className="card-elevated p-4 flex flex-col gap-2">
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="w-full aspect-square rounded-lg object-cover"
                />
              )}
              <p className="font-semibold truncate">{p.name}</p>
              <p className="text-lg font-black tracking-tight">{formatBRL(p.price_cents)}</p>
              {p.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>
              )}
              <div className="flex gap-2 mt-auto pt-2">
                <button
                  onClick={() => setEditing(p)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 flex-1 justify-center"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este plano?")) remove.mutate(p.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
  );
}

function ProdutosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Produto> | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  const { data: produtos } = useQuery({
    queryKey: ["produtos", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.produtos)
        .select("*")
        .eq("professional_id", pro.id)
        .order("created_at");
      if (error) throw error;
      return data as Produto[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ image, ...p }: Partial<Produto> & { image?: File }) => {
      let image_url = p.image_url ?? null;
      const produtoId = p.id ?? crypto.randomUUID();
      if (image) {
        const ext = image.name.split(".").pop();
        const path = `${pro.user_id}/produtos/${produtoId}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("brand-assets")
          .upload(path, image, {
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
        const { error } = await supabase
          .from(db.produtos)
          .update({
            name: p.name!,
            price_cents: p.price_cents ?? 0,
            description: p.description ?? null,
            image_url,
            is_active: p.is_active ?? true,
          })
          .eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(db.produtos).insert({
          id: produtoId,
          professional_id: pro.id,
          name: p.name!,
          price_cents: p.price_cents ?? 0,
          description: p.description ?? null,
          image_url,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setEditing(null);
      toast.success("Produto salvo!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.produtos).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <button onClick={() => setEditing({})} className="btn-brand inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo produto
        </button>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {(produtos ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum produto ainda. Cadastre itens para vender no seu estabelecimento.
        </p>
      )}
      {view === "list" ? (
        <div className="grid gap-3">
          {(produtos ?? []).map((p) => (
            <div
              key={p.id}
              className="card-elevated p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-center gap-4 min-w-0">
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-14 w-14 rounded-lg object-cover shrink-0 aspect-square"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBRL(p.price_cents)}</p>
                  {p.description && (
                    <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(p)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este produto?")) remove.mutate(p.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(produtos ?? []).map((p) => (
            <div key={p.id} className="card-elevated p-4 flex flex-col gap-2">
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="w-full aspect-square rounded-lg object-cover"
                />
              )}
              <p className="font-semibold truncate">{p.name}</p>
              <p className="text-lg font-black tracking-tight">{formatBRL(p.price_cents)}</p>
              {p.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>
              )}
              <div className="flex gap-2 mt-auto pt-2">
                <button
                  onClick={() => setEditing(p)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 flex-1 justify-center"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Excluir este produto?")) remove.mutate(p.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <ProdutoForm initial={editing} onSubmit={(v) => save.mutate(v)} saving={save.isPending} />
        </Modal>
      )}
    </>
  );
}

function BloqueiosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: blocks } = useQuery({
    queryKey: ["blocks", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueios)
        .select("*")
        .eq("professional_id", pro.id)
        .order("starts_at");
      if (error) throw error;
      return data as Block[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { starts_at: string; ends_at: string; reason: string | null }) => {
      const { error } = await supabase.from(db.bloqueios).insert({ professional_id: pro.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocks"] });
      setShowForm(false);
      toast.success("Bloqueio adicionado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.bloqueios).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blocks"] }),
  });

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Bloqueie períodos em que você não estará disponível (férias, feriados, imprevistos).
      </p>
      <button
        onClick={() => setShowForm((v) => !v)}
        className="btn-brand inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" /> Novo bloqueio
      </button>
      {showForm && <BlockForm onSubmit={(v) => add.mutate(v)} saving={add.isPending} />}
      <ul className="space-y-2">
        {(blocks ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum bloqueio ativo.</li>
        )}
        {(blocks ?? []).map((b) => (
          <li key={b.id} className="card-elevated p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {new Date(b.starts_at).toLocaleString("pt-BR")} →{" "}
                {new Date(b.ends_at).toLocaleString("pt-BR")}
              </p>
              {b.reason && <p className="text-sm text-muted-foreground truncate">{b.reason}</p>}
            </div>
            <button
              onClick={() => remove.mutate(b.id)}
              className="text-destructive shrink-0 p-2 min-h-[44px] min-w-[44px] grid place-items-center"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function HorariosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["availability", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.horarios)
        .select("*")
        .eq("professional_id", pro.id)
        .order("weekday")
        .order("start_time");
      if (error) throw error;
      return data as HorarioRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { weekday: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from(db.horarios).insert({ professional_id: pro.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability"] });
      toast.success("Horário adicionado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.horarios).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Defina faixas separadas para manhã e tarde. Adicione mais faixas por dia se precisar de mais
        divisões (ex: noite).
      </p>
      {WEEKDAYS_PT.map((label, wd) => {
        const dayRows = (rows ?? []).filter((r) => r.weekday === wd);
        const morning = dayRows.filter((r) => Number(r.start_time.slice(0, 2)) < 12);
        const afternoon = dayRows.filter((r) => Number(r.start_time.slice(0, 2)) >= 12);
        return (
          <div key={wd} className="card-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black tracking-tight text-foreground">{label}</h3>
              {dayRows.length === 0 && (
                <span className="text-xs text-muted-foreground">Fechado</span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PeriodBlock
                label="Manhã"
                defaultStart="08:00"
                defaultEnd="12:00"
                rows={morning}
                onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })}
                onRemove={(id) => remove.mutate(id)}
              />
              <PeriodBlock
                label="Tarde"
                defaultStart="13:00"
                defaultEnd="18:00"
                rows={afternoon}
                onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })}
                onRemove={(id) => remove.mutate(id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FuncionariosTab({ pro }: { pro: Pro }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<ViewMode>("list");

  const { data: employees } = useQuery({
    queryKey: ["employees", pro.id],
    enabled: !!pro.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.funcionarios)
        .select("id, name, photo_url, is_active")
        .eq("professional_id", pro.id)
        .order("created_at");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; photo_url: string | null }) => {
      const { error } = await supabase
        .from(db.funcionarios)
        .insert({ professional_id: pro.id, name: v.name, photo_url: v.photo_url });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setCreating(false);
      toast.success("Funcionário adicionado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (e: Employee) => {
      const { error } = await supabase
        .from(db.funcionarios)
        .update({ is_active: !e.is_active })
        .eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.funcionarios).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Cadastre as pessoas que atendem no seu negócio. Cada funcionário tem seus próprios serviços,
        horários e bloqueios de agenda.
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setCreating(true)}
          className="btn-brand inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Novo funcionário
        </button>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "list" ? (
        <div className="grid gap-3">
          {(employees ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum funcionário ainda.</p>
          )}
          {(employees ?? []).map((e) => (
            <div
              key={e.id}
              className={`card-elevated p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${!e.is_active ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full grid place-items-center bg-secondary shrink-0">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.is_active ? "Ativo" : "Inativo"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(e)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                <button
                  onClick={() => toggle.mutate(e)}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"
                  title={e.is_active ? "Desativar" : "Ativar"}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(`Excluir ${e.name}? Os agendamentos passados dele serão preservados.`)
                    )
                      remove.mutate(e.id);
                  }}
                  className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(employees ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm col-span-full">Nenhum funcionário ainda.</p>
          )}
          {(employees ?? []).map((e) => (
            <div
              key={e.id}
              className={`card-elevated p-4 flex flex-col items-center text-center gap-2 ${!e.is_active ? "opacity-60" : ""}`}
            >
              {e.photo_url ? (
                <img
                  src={e.photo_url}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-20 w-20 rounded-full grid place-items-center bg-secondary">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <p className="font-semibold truncate w-full">{e.name}</p>
              <p className="text-xs text-muted-foreground">{e.is_active ? "Ativo" : "Inativo"}</p>
              <div className="flex gap-1 mt-1 flex-wrap justify-center">
                <button
                  onClick={() => setEditing(e)}
                  className="btn-outline-brand !py-1.5 !px-2 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => toggle.mutate(e)}
                  className="btn-outline-brand !py-1.5 !px-2 text-xs"
                  title={e.is_active ? "Desativar" : "Ativar"}
                >
                  <Power className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir ${e.name}?`)) remove.mutate(e.id);
                  }}
                  className="btn-outline-brand !py-1.5 !px-2 text-xs text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal onClose={() => setCreating(false)}>
          <NewEmployeeForm onSubmit={(v) => create.mutate(v)} saving={create.isPending} />
        </Modal>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <EmployeeEditor employee={editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}

function PeriodBlock({
  label,
  defaultStart,
  defaultEnd,
  rows,
  onAdd,
  onRemove,
}: {
  label: string;
  defaultStart: string;
  defaultEnd: string;
  rows: HorarioRow[];
  onAdd: (start: string, end: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  return (
    <div className="rounded-xl border border-border/70 bg-surface/60 p-4 transition-colors hover:border-accent/40">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground min-h-[36px]"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        )}
      </div>

      {rows.length === 0 && !open ? (
        <p className="text-xs text-muted-foreground italic">Sem horário</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-all hover:border-accent/50 hover:shadow-md"
            >
              <span className="font-mono font-semibold tracking-tight">
                {r.start_time.slice(0, 5)} <span className="text-muted-foreground">–</span>{" "}
                {r.end_time.slice(0, 5)}
              </span>
              <button
                onClick={() => onRemove(r.id)}
                className="rounded-md p-1 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground min-h-[36px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground min-h-[36px] focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={() => {
              onAdd(start + ":00", end + ":00");
              setOpen(false);
              setStart(defaultStart);
              setEnd(defaultEnd);
            }}
            className="btn-pill-solid !py-1 !px-4 text-sm !min-h-[36px]"
          >
            Salvar
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground text-sm min-h-[36px] px-2 hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function BlockForm({
  onSubmit,
  saving,
}: {
  onSubmit: (v: { starts_at: string; ends_at: string; reason: string | null }) => void;
  saving: boolean;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!start || !end) return;
        onSubmit({
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
          reason: reason || null,
        });
      }}
      className="card-elevated p-4 grid gap-3 sm:grid-cols-2"
    >
      <label className="block">
        <span className="text-sm font-medium">Início</span>
        <input
          required
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Data e hora de início"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Fim</span>
        <input
          required
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder="Data e hora de fim"
          className={inputCls}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium">Motivo (opcional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Férias, feriado..."
          className={inputCls}
        />
      </label>
      <button disabled={saving} className="btn-brand sm:col-span-2 disabled:opacity-60">
        {saving ? "Salvando..." : "Adicionar bloqueio"}
      </button>
    </form>
  );
}

function ServiceForm({
  initial,
  onSubmit,
  saving,
}: {
  initial: Partial<Service>;
  onSubmit: (s: Partial<Service> & { image?: File }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [duration, setDuration] = useState(initial.duration_minutes ?? 30);
  const [priceReais, setPriceReais] = useState(
    ((initial.price_cents ?? 0) / 100).toString().replace(".", ","),
  );
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100);
        onSubmit({
          id: initial.id,
          name,
          duration_minutes: duration,
          price_cents: cents,
          description: description || null,
          image_url: initial.image_url,
          image: imageFile ?? undefined,
        });
      }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-black tracking-tight text-foreground">
        {initial.id ? "Editar" : "Novo"} serviço
      </h2>

      <div>
        <span className="text-sm font-medium">Foto (opcional)</span>
        {preview ? (
          <div className="relative mt-1 w-full h-36 rounded-lg overflow-hidden border border-border">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-2 right-2 bg-background/80 rounded-full p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full mt-1 min-h-[44px] rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" /> Escolher foto
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-1">Recomendado: 600×600 px</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Corte de cabelo"
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Duração (min)</span>
          <input
            required
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            placeholder="30"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Preço (R$)</span>
          <input
            inputMode="decimal"
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
            placeholder="0,00"
            className={inputCls}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Descrição (opcional)</span>
        <textarea
          rows={3}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o serviço..."
          className={inputCls}
        />
      </label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function PlanoForm({
  initial,
  onSubmit,
  saving,
}: {
  initial: Partial<Plano>;
  onSubmit: (p: Partial<Plano> & { image?: File }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [priceReais, setPriceReais] = useState(
    ((initial.price_cents ?? 0) / 100).toString().replace(".", ","),
  );
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100);
        onSubmit({
          id: initial.id,
          name,
          price_cents: cents,
          description: description || null,
          image_url: initial.image_url,
          image: imageFile ?? undefined,
        });
      }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-black tracking-tight text-foreground">
        {initial.id ? "Editar" : "Novo"} plano
      </h2>

      <div>
        <span className="text-sm font-medium">Imagem (opcional)</span>
        {preview ? (
          <div className="relative mt-1 w-full h-36 rounded-lg overflow-hidden border border-border">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-2 right-2 bg-background/80 rounded-full p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full mt-1 min-h-[44px] rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" /> Escolher imagem
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-1">Recomendado: 600×600 px</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Plano Mensal"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Preço (R$)</span>
        <input
          inputMode="decimal"
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          placeholder="0,00"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Descrição (opcional)</span>
        <textarea
          rows={4}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o que inclui neste plano..."
          className={inputCls}
        />
      </label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function ProdutoForm({
  initial,
  onSubmit,
  saving,
}: {
  initial: Partial<Produto>;
  onSubmit: (p: Partial<Produto> & { image?: File }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [priceReais, setPriceReais] = useState(
    ((initial.price_cents ?? 0) / 100).toString().replace(".", ","),
  );
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(priceReais.replace(",", ".") || "0") * 100);
        onSubmit({
          id: initial.id,
          name,
          price_cents: cents,
          description: description || null,
          image_url: initial.image_url,
          image: imageFile ?? undefined,
        });
      }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-black tracking-tight text-foreground">
        {initial.id ? "Editar" : "Novo"} produto
      </h2>

      <div>
        <span className="text-sm font-medium">Foto (opcional)</span>
        {preview ? (
          <div className="relative mt-1 w-full h-36 rounded-lg overflow-hidden border border-border">
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-2 right-2 bg-background/80 rounded-full p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full mt-1 min-h-[44px] rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" /> Escolher foto
          </button>
        )}
        <p className="text-xs text-muted-foreground mt-1">Recomendado: 600×600 px</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Shampoo profissional"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Preço (R$)</span>
        <input
          inputMode="decimal"
          value={priceReais}
          onChange={(e) => setPriceReais(e.target.value)}
          placeholder="0,00"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Descrição do produto (opcional)</span>
        <textarea
          rows={4}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o produto, tamanho, marca..."
          className={inputCls}
        />
      </label>
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function NewEmployeeForm({
  onSubmit,
  saving,
}: {
  onSubmit: (v: { name: string; photo_url: string | null }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim(), photo_url: photo.trim() || null });
      }}
      className="space-y-4"
    >
      <h2 className="text-2xl font-black tracking-tight text-foreground">Novo funcionário</h2>
      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do funcionário"
          className={inputCls}
        />
      </label>
      <ImageUpload
        value={photo}
        onChange={setPhoto}
        label="Foto (opcional)"
        shape="circle"
        folder="employees"
      />
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">
        {saving ? "Salvando..." : "Adicionar"}
      </button>
    </form>
  );
}

function EmployeeEditor({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [tab, setTab] = useState<"data" | "services" | "hours" | "blocks">("data");
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-foreground">{employee.name}</h2>
      <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
        {[
          ["data", "Dados"],
          ["services", "Serviços"],
          ["hours", "Horários"],
          ["blocks", "Bloqueios"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            data-selected={tab === k || undefined}
            className="px-3 py-2 text-sm font-medium text-muted-foreground data-[selected]:text-primary data-[selected]:border-b-2 data-[selected]:border-accent -mb-px"
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "data" && <DataTab employee={employee} onSaved={onClose} />}
      {tab === "services" && <EmployeeServicesTab employee={employee} />}
      {tab === "hours" && <EmployeeHoursTab employee={employee} />}
      {tab === "blocks" && <EmployeeBlocksTab employee={employee} />}
    </div>
  );
}

function DataTab({ employee, onSaved }: { employee: Employee; onSaved: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(employee.name);
  const [photo, setPhoto] = useState(employee.photo_url ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from(db.funcionarios)
        .update({ name: name.trim(), photo_url: photo.trim() || null })
        .eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Salvo!");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <label className="block">
        <span className="text-sm font-medium">Nome</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do funcionário"
          className={inputCls}
        />
      </label>
      <ImageUpload
        value={photo}
        onChange={setPhoto}
        label="Foto"
        shape="circle"
        folder="employees"
      />

      <button disabled={save.isPending} className="btn-brand w-full disabled:opacity-60">
        {save.isPending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function EmployeeServicesTab({ employee }: { employee: Employee }) {
  const { data: pro } = useMyProfessional();
  const qc = useQueryClient();
  const { data: services } = useQuery({
    queryKey: ["services-for-emp", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.servicos)
        .select("id, name")
        .eq("professional_id", pro!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as EmployeeService[];
    },
  });
  const { data: linked } = useQuery({
    queryKey: ["employee-services", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.servicosFuncionario)
        .select("service_id")
        .eq("employee_id", employee.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: { service_id: string }) => r.service_id));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ serviceId, checked }: { serviceId: string; checked: boolean }) => {
      if (checked) {
        const { error } = await supabase
          .from(db.servicosFuncionario)
          .insert({ employee_id: employee.id, service_id: serviceId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(db.servicosFuncionario)
          .delete()
          .eq("employee_id", employee.id)
          .eq("service_id", serviceId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-services", employee.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        Selecione quais serviços {employee.name} realiza.
      </p>
      {(services ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre serviços primeiro em Serviços.</p>
      ) : (
        <ul className="space-y-2">
          {services!.map((s) => {
            const checked = linked?.has(s.id) ?? false;
            return (
              <li key={s.id}>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle.mutate({ serviceId: s.id, checked: e.target.checked })}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmployeeHoursTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["employee-availability", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.disponibilidadeFuncionario)
        .select("id, weekday, start_time, end_time")
        .eq("employee_id", employee.id)
        .order("weekday")
        .order("start_time");
      if (error) throw error;
      return data as EmployeeAvailRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { weekday: number; start_time: string; end_time: string }) => {
      const { error } = await supabase
        .from(db.disponibilidadeFuncionario)
        .insert({ employee_id: employee.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-availability", employee.id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.disponibilidadeFuncionario).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-availability", employee.id] }),
  });

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      <p className="text-sm text-muted-foreground">
        Se deixar vazio, será usado o horário geral do negócio.
      </p>
      {WEEKDAYS_PT.map((label, wd) => {
        const day = (rows ?? []).filter((r) => r.weekday === wd);
        return (
          <div key={wd} className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">{label}</h4>
              <QuickAdd onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })} />
            </div>
            {day.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {day.map((r) => (
                  <li
                    key={r.id}
                    className="inline-flex items-center gap-2 bg-secondary rounded-lg px-2 py-1 text-xs"
                  >
                    <span className="font-mono">
                      {r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}
                    </span>
                    <button onClick={() => remove.mutate(r.id)} className="text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmployeeBlocksTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const { data: blocks } = useQuery({
    queryKey: ["employee-blocks", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueiosFuncionario)
        .select("id, starts_at, ends_at, reason")
        .eq("employee_id", employee.id)
        .order("starts_at");
      if (error) throw error;
      return data as EmployeeBlockRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error("Preencha início e fim.");
      const { error } = await supabase.from(db.bloqueiosFuncionario).insert({
        employee_id: employee.id,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-blocks", employee.id] });
      setStart("");
      setEnd("");
      setReason("");
      toast.success("Bloqueio adicionado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(db.bloqueiosFuncionario).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-blocks", employee.id] }),
  });

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg"
      >
        <label className="block col-span-1">
          <span className="text-xs font-medium">Início</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="Data e hora de início"
            className={inputCls + " !min-h-[38px] text-sm"}
          />
        </label>
        <label className="block col-span-1">
          <span className="text-xs font-medium">Fim</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="Data e hora de fim"
            className={inputCls + " !min-h-[38px] text-sm"}
          />
        </label>
        <label className="block col-span-2">
          <span className="text-xs font-medium">Motivo (opcional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Férias, feriado..."
            className={inputCls + " !min-h-[38px] text-sm"}
          />
        </label>
        <button disabled={add.isPending} className="btn-brand col-span-2 text-sm">
          {add.isPending ? "..." : "Adicionar bloqueio"}
        </button>
      </form>
      <ul className="space-y-2">
        {(blocks ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum bloqueio.</li>
        )}
        {(blocks ?? []).map((b) => (
          <li
            key={b.id}
            className="border border-border rounded-lg p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {new Date(b.starts_at).toLocaleString("pt-BR")} →{" "}
                {new Date(b.ends_at).toLocaleString("pt-BR")}
              </p>
              {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
            </div>
            <button onClick={() => remove.mutate(b.id)} className="text-destructive shrink-0">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (s: string, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-accent text-xs font-semibold">
        + Adicionar
      </button>
    );
  return (
    <div className="flex items-center gap-1">
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="border border-border rounded px-1 py-0.5 text-xs"
      />
      <span className="text-xs">–</span>
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="border border-border rounded px-1 py-0.5 text-xs"
      />
      <button
        onClick={() => {
          onAdd(start + ":00", end + ":00");
          setOpen(false);
        }}
        className="btn-brand !py-0.5 !px-2 text-xs !min-h-0"
      >
        OK
      </button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground text-xs">
        ×
      </button>
    </div>
  );
}

const inputCls =
  "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 grid sm:place-items-center animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="bg-background w-full sm:max-w-md sm:rounded-2xl p-6 h-full sm:h-auto sm:my-8 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button onClick={onClose} className="btn-outline-brand w-full mt-3">
          Cancelar
        </button>
      </div>
    </div>
  );
}
