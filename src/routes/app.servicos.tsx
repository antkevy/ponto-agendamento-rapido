import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { formatBRL, WEEKDAYS_PT } from "@/lib/booking";
import { optimizedImageUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { ViewToggle } from "@/components/view-toggle";
import { CATALOG_VIEWS, type ViewMode } from "@/lib/view-modes";
import { ImageUpload } from "@/components/image-upload";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Pencil,
  Trash2,
  Plus,
  Clock,
  Upload,
  X,
  Power,
  User,
  Check,
  Sparkles,
  Tag,
} from "lucide-react";

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
  const { canEdit } = useUserRole();

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
            <ServicosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="planos" className="space-y-4">
            <PlanosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="produtos" className="space-y-4">
            <ProdutosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="bloqueios" className="space-y-4">
            <BloqueiosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="horarios" className="space-y-4">
            <HorariosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
          <TabsContent value="funcionarios" className="space-y-4">
            <FuncionariosTab pro={pro} readOnly={!canEdit} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

function ServicosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
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
      {readOnly && <ReadOnlyNotice />}
      <CatalogHeader
        countLabel={`${services?.length ?? 0} ${(services?.length ?? 0) === 1 ? "serviço" : "serviços"}`}
        onCreateLabel="Novo serviço"
        onCreate={() => setEditing({ duration_minutes: 30 })}
        view={view}
        onViewChange={setView}
        readOnly={readOnly}
      />
      {(services ?? []).length === 0 ? (
        <CatalogEmpty
          message="Crie o primeiro serviço para começar a receber agendamentos."
          actionLabel="Criar serviço"
          onAction={() => setEditing({ duration_minutes: 30 })}
          readOnly={readOnly}
        />
      ) : view === "list" ? (
        <div className="grid gap-3">
          {(services ?? []).map((s) => (
            <CatalogRow
              key={s.id}
              item={s}
              readOnly={readOnly}
              onEdit={() => setEditing(s)}
              onDelete={() => {
                if (confirm("Excluir este serviço?")) remove.mutate(s.id);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(services ?? []).map((s) => (
            <CatalogCard
              key={s.id}
              item={s}
              readOnly={readOnly}
              onEdit={() => setEditing(s)}
              onDelete={() => {
                if (confirm("Excluir este serviço?")) remove.mutate(s.id);
              }}
            />
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

function PlanosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
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
      {readOnly && <ReadOnlyNotice />}
      <CatalogHeader
        countLabel={`${planos?.length ?? 0} ${(planos?.length ?? 0) === 1 ? "plano" : "planos"}`}
        onCreateLabel="Novo plano"
        onCreate={() => setEditing({})}
        view={view}
        onViewChange={setView}
        readOnly={readOnly}
      />
      {(planos ?? []).length === 0 ? (
        <CatalogEmpty
          message="Crie o primeiro plano para oferecer assinaturas ou pacotes."
          actionLabel="Criar plano"
          onAction={() => setEditing({})}
          readOnly={readOnly}
        />
      ) : view === "list" ? (
        <div className="grid gap-3">
          {(planos ?? []).map((p) => (
            <CatalogRow
              key={p.id}
              item={p}
              readOnly={readOnly}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                if (confirm("Excluir este plano?")) remove.mutate(p.id);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(planos ?? []).map((p) => (
            <CatalogCard
              key={p.id}
              item={p}
              readOnly={readOnly}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                if (confirm("Excluir este plano?")) remove.mutate(p.id);
              }}
            />
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

function ProdutosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
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
      {readOnly && <ReadOnlyNotice />}
      <CatalogHeader
        countLabel={`${produtos?.length ?? 0} ${(produtos?.length ?? 0) === 1 ? "produto" : "produtos"}`}
        onCreateLabel="Novo produto"
        onCreate={() => setEditing({})}
        view={view}
        onViewChange={setView}
        readOnly={readOnly}
      />
      {(produtos ?? []).length === 0 ? (
        <CatalogEmpty
          message="Cadastre itens para vender no seu estabelecimento."
          actionLabel="Criar produto"
          onAction={() => setEditing({})}
          readOnly={readOnly}
        />
      ) : view === "list" ? (
        <div className="grid gap-3">
          {(produtos ?? []).map((p) => (
            <CatalogRow
              key={p.id}
              item={p}
              readOnly={readOnly}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                if (confirm("Excluir este produto?")) remove.mutate(p.id);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(produtos ?? []).map((p) => (
            <CatalogCard
              key={p.id}
              item={p}
              readOnly={readOnly}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                if (confirm("Excluir este produto?")) remove.mutate(p.id);
              }}
            />
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

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  duration_minutes?: number | null;
  is_active: boolean;
};

function ReadOnlyNotice() {
  return (
    <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm">
      Você está em modo somente leitura. Apenas o administrador pode criar ou editar itens.
    </div>
  );
}

function CatalogHeader({
  countLabel,
  onCreateLabel,
  onCreate,
  view,
  onViewChange,
  readOnly,
}: {
  countLabel: string;
  onCreateLabel: string;
  onCreate: () => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="ui-badge">{countLabel}</span>
      <div className="flex items-center gap-2">
        <ViewToggle value={view} onChange={onViewChange} availableViews={CATALOG_VIEWS} />
        {!readOnly && (
          <button onClick={onCreate} className="btn-brand inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> {onCreateLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function CatalogEmpty({
  message,
  actionLabel,
  onAction,
  readOnly,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="card-elevated py-14 px-6 text-center">
      <span className="ui-icon-bubble h-14 w-14 mx-auto grid place-items-center rounded-2xl">
        <Sparkles className="h-6 w-6" />
      </span>
      <p className="font-bold mt-4 text-foreground">Comece por aqui</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
        {message}
      </p>
      {!readOnly && (
        <button onClick={onAction} className="btn-brand inline-flex items-center gap-2 mt-5">
          <Plus className="h-4 w-4" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function CatalogRow({
  item,
  onEdit,
  onDelete,
  readOnly,
}: {
  item: CatalogItem;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "card-elevated p-3 sm:p-4 transition-shadow hover:shadow-md",
        !item.is_active && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {item.image_url ? (
          <img
            src={optimizedImageUrl(item.image_url, 128) ?? item.image_url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 rounded-xl object-cover shrink-0 aspect-square border border-border"
          />
        ) : (
          <span className="h-14 w-14 rounded-xl grid place-items-center shrink-0 bg-secondary text-muted-foreground border border-border">
            <Tag className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate text-foreground">{item.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-sm text-muted-foreground">
            {item.duration_minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 shrink-0" /> {item.duration_minutes} min
              </span>
            )}
            {!item.is_active && (
              <span className="inline-flex items-center gap-1">
                <Power className="h-3.5 w-3.5 shrink-0" /> Inativo
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-lg font-black tracking-tight ui-accent-text">
            {formatBRL(Math.round(item.price_cents))}
          </span>
          <div className="flex gap-1">
            {!readOnly && (
              <>
                <button
                  onClick={onEdit}
                  title="Editar"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={onDelete}
                  title="Excluir"
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogCard({
  item,
  onEdit,
  onDelete,
  readOnly,
}: {
  item: CatalogItem;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="card-elevated overflow-hidden flex flex-col group">
      <div className="relative overflow-hidden">
        {item.image_url ? (
          <img
            src={optimizedImageUrl(item.image_url, 800) ?? item.image_url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="w-full aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="w-full aspect-[4/3] grid place-items-center bg-secondary text-muted-foreground">
            <Tag className="h-8 w-8" />
          </span>
        )}
        {item.duration_minutes != null && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-foreground border border-border">
            <Clock className="h-3 w-3" /> {item.duration_minutes} min
          </span>
        )}
        {!item.is_active && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-muted-foreground border border-border">
            <Power className="h-3 w-3" /> Inativo
          </span>
        )}
      </div>
      <div className="p-3.5 sm:p-4 flex flex-col gap-1.5 flex-1">
        <p className="font-bold truncate text-sm sm:text-base text-foreground">{item.name}</p>
        <p className="text-lg font-black tracking-tight ui-accent-text">
          {formatBRL(Math.round(item.price_cents))}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        {!readOnly && (
          <div className="flex gap-2 mt-auto pt-3">
            <button
              onClick={onEdit}
              className="btn-outline-brand inline-flex items-center justify-center gap-1.5 text-sm !py-2 flex-1"
            >
              <Pencil className="h-4 w-4 shrink-0" />
              <span className="max-sm:sr-only">Editar</span>
            </button>
            <button
              onClick={onDelete}
              title="Excluir"
              className="btn-outline-brand inline-flex items-center justify-center !py-2 px-3 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BloqueiosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
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
      {readOnly && <ReadOnlyNotice />}
      <p className="text-sm text-muted-foreground">
        Bloqueie períodos em que você não estará disponível (férias, feriados, imprevistos).
      </p>
      {!readOnly && (
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-brand inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Novo bloqueio
        </button>
      )}
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
            {!readOnly && (
              <button
                onClick={() => remove.mutate(b.id)}
                className="text-destructive shrink-0 p-2 min-h-[44px] min-w-[44px] grid place-items-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function HorariosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [addingWeekday, setAddingWeekday] = useState<number | null>(null);

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

  const openDays = new Set((rows ?? []).map((r) => r.weekday)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Defina os horários de funcionamento por dia. Você pode adicionar mais de uma faixa por dia
          (ex: manhã e tarde).
        </p>
        <span className="badge-pill">
          <span
            className={`h-2 w-2 rounded-full ${openDays > 0 ? "bg-success" : "bg-muted-foreground"}`}
          />
          {openDays} de 7 dias com horários
        </span>
      </div>

      <div className="card-elevated divide-y divide-border overflow-hidden">
        {WEEKDAYS_PT.map((label, wd) => {
          const dayRows = (rows ?? []).filter((r) => r.weekday === wd);
          const adding = addingWeekday === wd;
          return (
            <div key={wd} className="p-4 sm:px-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center justify-between gap-2 sm:w-36 sm:shrink-0">
                  <h4 className="text-sm font-bold tracking-tight">{label}</h4>
                  {dayRows.length === 0 && !adding && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                      Fechado
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                  {dayRows.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 pl-3 pr-1.5 py-1.5 text-sm shadow-sm"
                    >
                      <span className="font-mono font-semibold tracking-tight">
                        {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => remove.mutate(r.id)}
                          aria-label={`Remover faixa das ${r.start_time.slice(0, 5)}`}
                          className="grid place-items-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                  {dayRows.length === 0 && !adding && (
                    <span className="text-xs italic text-muted-foreground">
                      Sem horário definido
                    </span>
                  )}
                </div>

                <div className="sm:shrink-0">
                  {!adding && !readOnly && (
                    <button
                      onClick={() => setAddingWeekday(wd)}
                      className="btn-outline-brand inline-flex items-center justify-center gap-1 text-sm !py-2 !min-h-[40px] w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4" /> Adicionar
                    </button>
                  )}
                </div>
              </div>

              {adding && !readOnly && (
                <TimeRangeForm
                  onCancel={() => setAddingWeekday(null)}
                  onSave={(s, e) => {
                    add.mutate({ weekday: wd, start_time: s, end_time: e });
                    setAddingWeekday(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FuncionariosTab({ pro, readOnly }: { pro: Pro; readOnly?: boolean }) {
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
      {readOnly && <ReadOnlyNotice />}
      <p className="text-sm text-muted-foreground">
        Cadastre as pessoas que atendem no seu negócio. Cada funcionário tem seus próprios serviços,
        horários e bloqueios de agenda.
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {!readOnly && (
          <button
            onClick={() => setCreating(true)}
            className="btn-brand inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Novo funcionário
          </button>
        )}
        <ViewToggle value={view} onChange={setView} availableViews={CATALOG_VIEWS} />
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
                    src={optimizedImageUrl(e.photo_url, 128) ?? e.photo_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
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
              {!readOnly && (
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
                        confirm(
                          `Excluir ${e.name}? Os agendamentos passados dele serão preservados.`,
                        )
                      )
                        remove.mutate(e.id);
                    }}
                    className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
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
                  src={optimizedImageUrl(e.photo_url, 160) ?? e.photo_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-20 w-20 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-20 w-20 rounded-full grid place-items-center bg-secondary">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <p className="font-semibold truncate w-full">{e.name}</p>
              <p className="text-xs text-muted-foreground">{e.is_active ? "Ativo" : "Inativo"}</p>
              {!readOnly && (
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
              )}
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

function TimeRangeForm({
  onSave,
  onCancel,
}: {
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/60 p-2.5">
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        aria-label="Início"
        className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        aria-label="Fim"
        className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        onClick={() => {
          onSave(start + ":00", end + ":00");
          setStart("08:00");
          setEnd("18:00");
        }}
        className="btn-brand inline-flex items-center gap-1.5 !py-2 !px-4 text-sm !min-h-[40px]"
      >
        <Check className="h-4 w-4" /> Salvar
      </button>
      <button
        onClick={onCancel}
        className="text-sm text-muted-foreground min-h-[40px] px-2 hover:text-foreground"
      >
        Cancelar
      </button>
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

export function Modal({
  children,
  onClose,
  size = "md",
  hideFooter,
}: {
  children: React.ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  hideFooter?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm dark:bg-black/60 dark:backdrop-blur-md grid sm:place-items-center animate-fade-in-up"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "bg-background w-full sm:rounded-2xl p-5 sm:p-6 h-[100dvh] sm:h-auto sm:my-8 overflow-y-auto",
          size === "md" && "sm:max-w-md",
          size === "lg" && "sm:max-w-xl",
          size === "xl" && "sm:max-w-3xl lg:max-w-4xl lg:h-[min(88vh,760px)] lg:overflow-hidden",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {!hideFooter && (
          <button onClick={onClose} className="btn-outline-brand w-full mt-3">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
