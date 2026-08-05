import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBookingTheme } from "@/hooks/use-booking-theme";
import type { ProfessionalTheme } from "@/lib/appearance";
import {
  X,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  Clock,
  CalendarCheck2,
} from "lucide-react";
import { normalizeBRNumber, onlyDigits, formatPhoneBRTolerant } from "@/lib/phone";
import {
  computeSlots,
  formatLongDate,
  formatTime,
  type AvailabilityRow,
  type Block,
  type BusySlot,
  WEEKDAYS_PT_SHORT,
} from "@/lib/booking";

export const Route = createFileRoute("/meus-agendamentos")({
  validateSearch: (search: Record<string, unknown>) => ({
    pro: typeof search.pro === "string" ? search.pro : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Meus agendamentos — Agendaí" },
      {
        name: "description",
        content: "Consulte, cancele ou reagende seus agendamentos usando telefone ou email.",
      },
    ],
  }),
  component: Page,
});

type Row = {
  id: string;
  professional_id: string;
  employee_id: string | null;
  duration_minutes: number;
  professional_business_name: string;
  professional_slug: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "completed";
  client_name: string;
};

type Mode = "phone" | "email";

const H24_MS = 24 * 60 * 60 * 1000;

function normalizeContact(raw: string, mode: Mode): string {
  const s = raw.trim();
  if (mode === "email") return s.toLowerCase();
  return s.replace(/\D+/g, "");
}

function Page() {
  const { pro: proSlug } = useSearch({ from: "/meus-agendamentos" });
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("phone");
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Row | null>(null);
  const qc = useQueryClient();

  const { data: proTheme } = useQuery({
    queryKey: ["meus-appts-pro", proSlug],
    enabled: !!proSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.profissionais)
        .select("business_name, logo_url, description, brand_color, theme_colors")
        .eq("slug", proSlug!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        business_name: string | null;
        logo_url: string | null;
        description: string | null;
        brand_color: string | null;
        theme_colors: ProfessionalTheme | null;
      } | null;
    },
  });

  const brand = useBookingTheme(rootRef, proTheme?.brand_color, proTheme?.theme_colors ?? null);

  const { data, isFetching } = useQuery({
    queryKey: ["client-appts", submitted],
    enabled: !!submitted,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_client_appointments", {
        _contact: submitted!,
      });
      if (error) throw error;
      return data as Row[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("client_cancel_appointment", {
        _id: id,
        _contact: submitted!,
      });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível cancelar.");
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado.");
      qc.invalidateQueries({ queryKey: ["client-appts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, startsAt }: { id: string; startsAt: string }) => {
      const { data, error } = await supabase.rpc("client_reschedule_appointment", {
        _id: id,
        _contact: submitted!,
        _starts_at: startsAt,
      });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível reagendar.");
    },
    onSuccess: () => {
      toast.success("Agendamento reagendado.");
      setRescheduling(null);
      qc.invalidateQueries({ queryKey: ["client-appts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-page-gradient"
      style={{ ["--brand" as string]: brand } as React.CSSProperties}
    >
      <header className="bg-transparent">
        <div className="max-w-2xl mx-auto px-4 h-20 flex items-center justify-between gap-3">
          {proTheme ? (
            <Link
              to="/p/$slug"
              params={{ slug: proSlug! }}
              className="flex items-center gap-3 min-w-0"
            >
              {proTheme.logo_url ? (
                <img
                  src={proTheme.logo_url}
                  alt=""
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl object-cover border border-border shrink-0"
                />
              ) : (
                <span
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl grid place-items-center text-lg font-bold text-brand-foreground shrink-0 shadow-md"
                  style={{ backgroundColor: brand }}
                >
                  {proTheme.business_name?.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-base font-bold tracking-tight text-foreground truncate">
                  {proTheme.business_name}
                </span>
                {proTheme.description && (
                  <span className="block text-xs text-muted-foreground truncate">
                    {proTheme.description}
                  </span>
                )}
              </span>
            </Link>
          ) : (
            <BrandLogo />
          )}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Início
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-[1.05]">
          Meus <span style={{ color: brand }}>agendamentos.</span>
        </h1>
        <p className="text-muted-foreground mt-3 mb-6">
          Escolha como você quer buscar seus agendamentos.
        </p>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              setMode("phone");
              setContact("");
            }}
            data-selected={mode === "phone"}
            className="chip !min-h-[40px] !py-1.5 text-sm"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("email");
              setContact("");
            }}
            data-selected={mode === "email"}
            className="chip !min-h-[40px] !py-1.5 text-sm"
          >
            Email
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "phone") {
              const digits = normalizeBRNumber(contact);
              if (digits.length < 10 || digits.length > 11) {
                toast.error("Informe um WhatsApp válido no formato (XX) XXXXX-XXXX.");
                return;
              }
              setSubmitted(digits);
              return;
            }
            if (!contact.includes("@")) {
              toast.error("Informe um email válido.");
              return;
            }
            setSubmitted(normalizeContact(contact, "email"));
          }}
          className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-[0_20px_60px_-30px_var(--brand)]"
        >
          {mode === "phone" ? (
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formatPhoneBRTolerant(contact)}
              onChange={(e) => setContact(onlyDigits(e.target.value).slice(0, 13))}
              placeholder="(11) 91234-5678"
              className="flex-1 min-h-[48px] px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring"
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
          <button className="btn-gradient inline-flex items-center justify-center">
            Consultar
          </button>
        </form>

        {submitted && (
          <AppointmentList
            data={data ?? []}
            isFetching={isFetching}
            cancel={cancel}
            onReschedule={setRescheduling}
          />
        )}
      </main>

      {rescheduling && (
        <RescheduleModal
          row={rescheduling}
          contact={submitted!}
          onClose={() => setRescheduling(null)}
          onConfirm={(startsAt) => reschedule.mutate({ id: rescheduling.id, startsAt })}
          isPending={reschedule.isPending}
        />
      )}
    </div>
  );
}

function AppointmentList({
  data,
  isFetching,
  cancel,
  onReschedule,
}: {
  data: Row[];
  isFetching: boolean;
  cancel: { mutate: (id: string) => void; isPending: boolean };
  onReschedule: (r: Row) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const now = useMemo(() => new Date(), []);

  const upcoming = useMemo(
    () => data.filter((r) => r.status === "confirmed" && new Date(r.starts_at) > now),
    [data, now],
  );

  const history = useMemo(
    () => data.filter((r) => r.status !== "confirmed" || new Date(r.starts_at) <= now),
    [data, now],
  );

  if (isFetching) return <div className="mt-6 skeleton h-24" />;
  if (data.length === 0)
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nenhum agendamento encontrado com esse contato.
      </p>
    );

  return (
    <div className="mt-6 space-y-3">
      {upcoming.map((r) => {
        const canManage = new Date(r.starts_at).getTime() - now.getTime() >= H24_MS;
        return (
          <div key={r.id} className="card-elevated p-4 animate-fade-in-up ring-2 ring-accent/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate text-base">{r.professional_business_name}</p>
                <p className="text-sm text-muted-foreground truncate">{r.service_name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />{" "}
                    {new Date(r.starts_at).toLocaleString("pt-BR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <StatusPill status={r.status} />
                </div>
                {!canManage && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cancelamento e reagendamento disponíveis até 24 horas antes.
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => onReschedule(r)}
                    className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm shrink-0"
                  >
                    <CalendarCheck2 className="h-4 w-4" /> Reagendar
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Cancelar este agendamento?")) cancel.mutate(r.id);
                    }}
                    className="btn-outline-brand inline-flex items-center gap-1 !py-2 text-sm text-destructive shrink-0"
                  >
                    <X className="h-4 w-4" />
                    <span className="max-sm:sr-only"> Cancelar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {history.length > 0 && (
        <div className="animate-fade-in-up">
          <button
            onClick={() => setHistoryOpen((p) => !p)}
            className="w-full flex items-center justify-between gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors text-sm text-muted-foreground"
          >
            <span>
              <strong className="text-foreground">{history.length}</strong> agendamento(s)
              anterior(es)
            </span>
            {historyOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {historyOpen && (
            <div className="space-y-3 mt-3">
              {history.map((r) => (
                <div key={r.id} className="card-elevated p-4 opacity-80">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.professional_business_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{r.service_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />{" "}
                          {new Date(r.starts_at).toLocaleString("pt-BR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        <StatusPill status={r.status} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RescheduleModal({
  row,
  contact,
  onClose,
  onConfirm,
  isPending,
}: {
  row: Row;
  contact: string;
  onClose: () => void;
  onConfirm: (startsAt: string) => void;
  isPending: boolean;
}) {
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { data: proAvail } = useQuery({
    queryKey: ["resched-avail", row.professional_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.horarios)
        .select("*")
        .eq("professional_id", row.professional_id);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const { data: empAvail } = useQuery({
    queryKey: ["resched-emp-avail", row.employee_id],
    enabled: !!row.employee_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.disponibilidadeFuncionario)
        .select("weekday, start_time, end_time")
        .eq("employee_id", row.employee_id!);
      if (error) throw error;
      return data as AvailabilityRow[];
    },
  });

  const avail: AvailabilityRow[] | undefined = useMemo(() => {
    if (!row.employee_id) return proAvail;
    if (!empAvail || !proAvail) return undefined;
    return empAvail.length > 0 ? empAvail : proAvail;
  }, [row.employee_id, empAvail, proAvail]);

  const rangeStart = monthStart;
  const rangeEnd = useMemo(() => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [monthStart]);

  const { data: proBlocks } = useQuery({
    queryKey: ["resched-blocks", row.professional_id, monthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueios)
        .select("starts_at,ends_at")
        .eq("professional_id", row.professional_id)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: empBlocks } = useQuery({
    queryKey: ["resched-emp-blocks", row.employee_id, monthStart.toISOString()],
    enabled: !!row.employee_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(db.bloqueiosFuncionario)
        .select("starts_at,ends_at")
        .eq("employee_id", row.employee_id!)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString());
      if (error) throw error;
      return data as Block[];
    },
  });

  const { data: busy, isLoading: loadingBusy } = useQuery({
    queryKey: [
      "resched-busy",
      row.professional_id,
      row.employee_id ?? "none",
      selectedDay?.toISOString(),
    ],
    enabled: !!selectedDay,
    queryFn: async () => {
      const from = new Date(selectedDay!);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      if (row.employee_id) {
        const { data, error } = await supabase.rpc("get_employee_busy_slots", {
          _employee_id: row.employee_id,
          _from: from.toISOString(),
          _to: to.toISOString(),
        });
        if (error) throw error;
        return (data as BusySlot[]) ?? [];
      }
      const { data, error } = await supabase.rpc("get_busy_slots", {
        _professional_id: row.professional_id,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return (data as BusySlot[]) ?? [];
    },
  });

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const startWeekday = first.getDay();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    const end = new Date(monthStart);
    end.setMonth(end.getMonth() + 1);
    for (let d = new Date(first); d < end; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dayHasAvailability = (day: Date) =>
    !!avail && avail.some((r) => r.weekday === day.getDay());

  const combinedBlocks = useMemo<Block[]>(() => {
    const list: Block[] = [];
    if (proBlocks) list.push(...proBlocks);
    if (row.employee_id && empBlocks) list.push(...empBlocks);
    return list;
  }, [proBlocks, empBlocks, row.employee_id]);

  const slots = useMemo(() => {
    if (!selectedDay || !avail || !proBlocks || !busy) return [];
    if (row.employee_id && !empBlocks) return [];
    return computeSlots({
      day: selectedDay,
      serviceDurationMinutes: row.duration_minutes,
      availability: avail,
      blocks: combinedBlocks,
      busy,
    });
  }, [
    selectedDay,
    avail,
    proBlocks,
    empBlocks,
    busy,
    row.employee_id,
    row.duration_minutes,
    combinedBlocks,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm dark:bg-black/60 dark:backdrop-blur-md grid place-items-center p-4 animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight">Reagendar</h3>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{row.service_name}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              Horário atual:{" "}
              {new Date(row.starts_at).toLocaleString("pt-BR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 pt-1 space-y-4">
          <div className="card-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  const d = new Date(monthStart);
                  d.setMonth(d.getMonth() - 1);
                  if (d >= new Date(today.getFullYear(), today.getMonth(), 1)) setMonthStart(d);
                }}
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-semibold capitalize">
                {monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={() => {
                  const d = new Date(monthStart);
                  d.setMonth(d.getMonth() + 1);
                  setMonthStart(d);
                }}
                className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {WEEKDAYS_PT_SHORT.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {daysGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const past = d < today;
                const canSelect = !past && dayHasAvailability(d);
                const selected = selectedDay && d.toDateString() === selectedDay.toDateString();
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <button
                    key={i}
                    disabled={!canSelect}
                    onClick={() => setSelectedDay(d)}
                    data-selected={selected || undefined}
                    data-today={isToday || undefined}
                    className="h-10 w-full rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/10 hover:text-accent transition-colors data-[today]:ring-1 data-[today]:ring-accent/40 data-[selected]:!bg-accent data-[selected]:!text-accent-foreground data-[selected]:ring-0"
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {!selectedDay ? (
              <div className="card-elevated p-4 grid place-items-center text-center">
                <div>
                  <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Selecione uma data para ver os horários disponíveis.
                  </p>
                </div>
              </div>
            ) : loadingBusy ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-11" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="card-elevated p-4 grid place-items-center text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum horário livre nesse dia. Tente outro.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "Manhã", from: 6, to: 12 },
                  { label: "Tarde", from: 12, to: 18 },
                  { label: "Noite", from: 18, to: 24 },
                ].map(({ label, from, to }) => {
                  const periodSlots = slots.filter((s) => {
                    const h = s.getHours();
                    return h >= from && h < to;
                  });
                  if (periodSlots.length === 0) return null;
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-4 bg-border" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </h4>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {periodSlots.map((s) => (
                          <button
                            key={s.toISOString()}
                            onClick={() => onConfirm(s.toISOString())}
                            disabled={isPending}
                            className="chip"
                          >
                            {formatTime(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {isPending && (
            <p className="text-center text-sm text-muted-foreground animate-fade-in-up">
              <Clock className="h-4 w-4 inline-block mr-1" /> Confirmando...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  const map = {
    confirmed: ["Confirmado", "bg-accent/10 text-accent border-accent/20"],
    cancelled: ["Cancelado", "bg-destructive/10 text-destructive border-destructive/20"],
    completed: ["Concluído", "bg-success/10 text-success border-success/20"],
  } as const;
  const [label, cls] = map[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
    >
      {label}
    </span>
  );
}
