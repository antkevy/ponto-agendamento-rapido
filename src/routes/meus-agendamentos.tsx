import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { X, ArrowLeft, CalendarClock } from "lucide-react";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhoneBR } from "@/lib/phone";


export const Route = createFileRoute("/meus-agendamentos")({
  head: () => ({ meta: [{ title: "Meus agendamentos — Agendaí" }, { name: "description", content: "Consulte e cancele seus agendamentos usando telefone ou email." }] }),
  component: Page,
});

type Row = { id: string; professional_business_name: string; professional_slug: string; service_name: string; starts_at: string; ends_at: string; status: "confirmed" | "cancelled" | "completed"; client_name: string };

type Mode = "phone" | "email";

function normalizeContact(raw: string, mode: Mode): string {
  const s = raw.trim();
  if (mode === "email") return s.toLowerCase();
  return s.replace(/\D+/g, "");
}

function Page() {
  const [mode, setMode] = useState<Mode>("phone");
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
    <div className="min-h-screen bg-page-gradient">
      <header className="bg-transparent">
        <div className="max-w-2xl mx-auto px-4 h-20 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Início</Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-[1.05]">
          Meus <span style={{ color: "oklch(0.55 0.18 250)" }}>agendamentos.</span>
        </h1>
        <p className="text-muted-foreground mt-3 mb-6">Escolha como você quer buscar seus agendamentos.</p>

        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => { setMode("phone"); setContact(""); }} data-selected={mode === "phone"} className="chip !min-h-[40px] !py-1.5 text-sm">WhatsApp</button>
          <button type="button" onClick={() => { setMode("email"); setContact(""); }} data-selected={mode === "email"} className="chip !min-h-[40px] !py-1.5 text-sm">Email</button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "phone" && !isValidPhoneBR(contact)) {
              toast.error("Informe um WhatsApp válido no formato (XX) XXXXX-XXXX.");
              return;
            }
            if (mode === "email" && !contact.includes("@")) {
              toast.error("Informe um email válido.");
              return;
            }
            setSubmitted(normalizeContact(contact, mode));
          }}
          className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-[0_20px_60px_-30px_oklch(0.55_0.18_250_/_0.25)]"
        >
          {mode === "phone" ? (
            <PhoneInput
              value={contact}
              onChange={setContact}
              placeholder="(11) 91234-5678"
              className="flex-1 min-h-[48px] px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          ) : (
            <input
              required
              type="email"
              inputMode="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="seu@email.com"
              className="flex-1 min-h-[48px] px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <button className="btn-gradient inline-flex items-center justify-center">Consultar</button>
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
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                      <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(r.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span>
                      <StatusPill status={r.status} />
                    </div>
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
