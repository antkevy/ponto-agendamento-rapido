import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { OnboardingCard } from "@/components/onboarding-card";
import { useMyProfessional } from "@/hooks/use-my-professional";
import { supabase } from "@/integrations/supabase/client";
import { WEEKDAYS_PT } from "@/lib/booking";
import { Modal } from "@/routes/app.servicos";
import { ImageUpload } from "@/components/image-upload";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { Plus, Pencil, Trash2, Power, User } from "lucide-react";


export const Route = createFileRoute("/app/funcionarios")({
  head: () => ({ meta: [{ title: "Funcionários — Agendaí" }] }),
  component: Page,
});

type Employee = { id: string; name: string; photo_url: string | null; is_active: boolean };
type Service = { id: string; name: string };
type AvailRow = { id: string; weekday: number; start_time: string; end_time: string };
type BlockRow = { id: string; starts_at: string; ends_at: string; reason: string | null };

function Page() {
  const { data: pro, isLoading } = useMyProfessional();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<ViewMode>("list");


  const { data: employees } = useQuery({
    queryKey: ["employees", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, photo_url, is_active")
        .eq("professional_id", pro!.id)
        .order("created_at");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; photo_url: string | null }) => {
      const { error } = await supabase.from("employees").insert({ professional_id: pro!.id, name: v.name, photo_url: v.photo_url });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); setCreating(false); toast.success("Funcionário adicionado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (e: Employee) => {
      const { error } = await supabase.from("employees").update({ is_active: !e.is_active }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Removido."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Funcionários">
      {isLoading ? <div className="skeleton h-32" /> : !pro ? <OnboardingCard /> : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Cadastre as pessoas que atendem no seu negócio. Cada funcionário tem seus próprios serviços, horários e bloqueios de agenda.
          </p>
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <button onClick={() => setCreating(true)} className="btn-brand inline-flex items-center gap-2">
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
                <div key={e.id} className={`card-elevated p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${!e.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {e.photo_url ? (
                      <img src={e.photo_url} alt="" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-full grid place-items-center bg-secondary shrink-0">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.is_active ? "Ativo" : "Inativo"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditing(e)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2"><Pencil className="h-4 w-4" /> Editar</button>
                    <button onClick={() => toggle.mutate(e)} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2" title={e.is_active ? "Desativar" : "Ativar"}><Power className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm(`Excluir ${e.name}? Os agendamentos passados dele serão preservados.`)) remove.mutate(e.id); }} className="btn-outline-brand inline-flex items-center gap-1 text-sm !py-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {(employees ?? []).length === 0 && (
                <p className="text-muted-foreground text-sm col-span-full">Nenhum funcionário ainda.</p>
              )}
              {(employees ?? []).map((e) => (
                <div key={e.id} className={`card-elevated p-4 flex flex-col items-center text-center gap-2 ${!e.is_active ? "opacity-60" : ""}`}>
                  {e.photo_url ? (
                    <img src={e.photo_url} alt="" className="h-20 w-20 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="h-20 w-20 rounded-full grid place-items-center bg-secondary">
                      <User className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <p className="font-semibold truncate w-full">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.is_active ? "Ativo" : "Inativo"}</p>
                  <div className="flex gap-1 mt-1 flex-wrap justify-center">
                    <button onClick={() => setEditing(e)} className="btn-outline-brand !py-1.5 !px-2 text-xs"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => toggle.mutate(e)} className="btn-outline-brand !py-1.5 !px-2 text-xs" title={e.is_active ? "Desativar" : "Ativar"}><Power className="h-3 w-3" /></button>
                    <button onClick={() => { if (confirm(`Excluir ${e.name}?`)) remove.mutate(e.id); }} className="btn-outline-brand !py-1.5 !px-2 text-xs text-destructive"><Trash2 className="h-3 w-3" /></button>
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
      )}
    </AppShell>
  );
}

const inputCls = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring mt-1";

function NewEmployeeForm({ onSubmit, saving }: { onSubmit: (v: { name: string; photo_url: string | null }) => void; saving: boolean }) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name: name.trim(), photo_url: photo.trim() || null }); }} className="space-y-4">
      <h2 className="text-2xl font-black tracking-tight text-foreground">Novo funcionário</h2>
      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
      <ImageUpload value={photo} onChange={setPhoto} label="Foto (opcional)" shape="circle" folder="employees" />
      <button disabled={saving} className="btn-brand w-full disabled:opacity-60">{saving ? "Salvando..." : "Adicionar"}</button>
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
      {tab === "services" && <ServicesTab employee={employee} />}
      {tab === "hours" && <HoursTab employee={employee} />}
      {tab === "blocks" && <BlocksTab employee={employee} />}
    </div>
  );
}

function DataTab({ employee, onSaved }: { employee: Employee; onSaved: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(employee.name);
  const [photo, setPhoto] = useState(employee.photo_url ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").update({ name: name.trim(), photo_url: photo.trim() || null }).eq("id", employee.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Salvo!"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      <label className="block"><span className="text-sm font-medium">Nome</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
      <ImageUpload value={photo} onChange={setPhoto} label="Foto" shape="circle" folder="employees" />

      <button disabled={save.isPending} className="btn-brand w-full disabled:opacity-60">{save.isPending ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

function ServicesTab({ employee }: { employee: Employee }) {
  const { data: pro } = useMyProfessional();
  const qc = useQueryClient();
  const { data: services } = useQuery({
    queryKey: ["services-for-emp", pro?.id],
    enabled: !!pro?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").eq("professional_id", pro!.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
  const { data: linked } = useQuery({
    queryKey: ["employee-services", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_services").select("service_id").eq("employee_id", employee.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: { service_id: string }) => r.service_id));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ serviceId, checked }: { serviceId: string; checked: boolean }) => {
      if (checked) {
        const { error } = await supabase.from("employee_services").insert({ employee_id: employee.id, service_id: serviceId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_services").delete().eq("employee_id", employee.id).eq("service_id", serviceId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-services", employee.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">Selecione quais serviços {employee.name} realiza.</p>
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

function HoursTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["employee-availability", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_availability")
        .select("id, weekday, start_time, end_time")
        .eq("employee_id", employee.id)
        .order("weekday").order("start_time");
      if (error) throw error;
      return data as AvailRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (v: { weekday: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("employee_availability").insert({ employee_id: employee.id, ...v });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-availability", employee.id] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("employee_availability").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-availability", employee.id] }),
  });

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      <p className="text-sm text-muted-foreground">Se deixar vazio, será usado o horário geral do negócio.</p>
      {WEEKDAYS_PT.map((label, wd) => {
        const day = (rows ?? []).filter((r) => r.weekday === wd);
        return (
          <div key={wd} className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">{label}</h4>
              <QuickAdd onAdd={(s, e) => add.mutate({ weekday: wd, start_time: s, end_time: e })} />
            </div>
            {day.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
              <ul className="flex flex-wrap gap-2">
                {day.map((r) => (
                  <li key={r.id} className="inline-flex items-center gap-2 bg-secondary rounded-lg px-2 py-1 text-xs">
                    <span className="font-mono">{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</span>
                    <button onClick={() => remove.mutate(r.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
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

function QuickAdd({ onAdd }: { onAdd: (s: string, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  if (!open) return <button onClick={() => setOpen(true)} className="text-accent text-xs font-semibold">+ Adicionar</button>;
  return (
    <div className="flex items-center gap-1">
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="border border-border rounded px-1 py-0.5 text-xs" />
      <span className="text-xs">–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-border rounded px-1 py-0.5 text-xs" />
      <button onClick={() => { onAdd(start + ":00", end + ":00"); setOpen(false); }} className="btn-brand !py-0.5 !px-2 text-xs !min-h-0">OK</button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground text-xs">×</button>
    </div>
  );
}

function BlocksTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const { data: blocks } = useQuery({
    queryKey: ["employee-blocks", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_blocks")
        .select("id, starts_at, ends_at, reason")
        .eq("employee_id", employee.id)
        .order("starts_at");
      if (error) throw error;
      return data as BlockRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error("Preencha início e fim.");
      const { error } = await supabase.from("employee_blocks").insert({
        employee_id: employee.id,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-blocks", employee.id] }); setStart(""); setEnd(""); setReason(""); toast.success("Bloqueio adicionado."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("employee_blocks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-blocks", employee.id] }),
  });

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg">
        <label className="block col-span-1"><span className="text-xs font-medium">Início</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls + " !min-h-[38px] text-sm"} /></label>
        <label className="block col-span-1"><span className="text-xs font-medium">Fim</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls + " !min-h-[38px] text-sm"} /></label>
        <label className="block col-span-2"><span className="text-xs font-medium">Motivo (opcional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls + " !min-h-[38px] text-sm"} /></label>
        <button disabled={add.isPending} className="btn-brand col-span-2 text-sm">{add.isPending ? "..." : "Adicionar bloqueio"}</button>
      </form>
      <ul className="space-y-2">
        {(blocks ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nenhum bloqueio.</li>}
        {(blocks ?? []).map((b) => (
          <li key={b.id} className="border border-border rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{new Date(b.starts_at).toLocaleString("pt-BR")} → {new Date(b.ends_at).toLocaleString("pt-BR")}</p>
              {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
            </div>
            <button onClick={() => remove.mutate(b.id)} className="text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
