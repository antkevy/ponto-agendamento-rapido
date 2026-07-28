import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { X, ArrowLeft, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/meus-agendamentos")({
  head: () => ({ meta: [{ title: "Meus agendamentos — Agendaí" }, { name: "description", content: "Consulte e cancele seus agendamentos usando telefone ou email." }] }),
  component: Page,
});

type Row = { id: string; professional_business_name: string; professional_slug: string; service_name: string; starts_at: string; ends_at: string; status: "confirmed" | "cancelled" | "completed"; client_name: string };

function normalizeContact(raw: string): string {
  const s = raw.trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/\D+/g, "");
  return digits || s;
}

function Page() {
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["client-appts", submitted],
    enabled: !!submitted,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_client_appointments", { _contact: submitted! });
      if (error) throw error;
      return data as Row[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("client_cancel_appointment", { _id: id, _contact: submitted! });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível cancelar.");
    },
    onSuccess: () => { toast.success("Agendamento cancelado."); qc.invalidateQueries({ queryKey: ["client-appts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Início</Link>
          <span className="font-display text-xl text-primary">Agendaí</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-primary">Meus agendamentos</h1>
        <p className="text-muted-foreground mt-1 mb-6">Digite o email ou telefone que você usou ao agendar.</p>

        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(normalizeContact(contact)); }} className="card-elevated p-4 flex flex-col sm:flex-row gap-3">
          <input required value={contact} onChange={(e) => setContact(e.target.value)} placeholder="seu@email.com ou (11) 91234-5678" className="flex-1 min-h-[48px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
          <button className="btn-brand">Consultar</button>
        </form>

        {submitted && (
          <div className="mt-6 space-y-3">
            {isFetching ? (
              <div className="skeleton h-24" />
            ) : (data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado com esse contato.</p>
            ) : data!.map((r) => (
              <div key={r.id} className="card-elevated p-4 animate-fade-in-up">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.professional_business_name}</p>
                    <p className="text-sm text-muted-foreground truncate">{r.service_name}</p>
                    <p className="text-sm inline-flex items-center gap-1 mt-1"><CalendarClock className="h-3 w-3" /> {new Date(r.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>
                    <StatusPill status={r.status} />
                  </div>
                  {r.status === "confirmed" && new Date(r.starts_at) > new Date() && (
                    <button onClick={() => { if (confirm("Cancelar este agendamento?")) cancel.mutate(r.id); }} className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm text-destructive shrink-0"><X className="h-4 w-4" /> Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  const map = { confirmed: ["Confirmado", "text-accent"], cancelled: ["Cancelado", "text-destructive"], completed: ["Concluído", "text-success"] } as const;
  const [label, cls] = map[status];
  return <span className={`inline-block text-xs font-semibold mt-2 ${cls}`}>{label}</span>;
}
