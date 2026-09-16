export type Appt = {
  id: string;
  starts_at: string;
  ends_at: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  service_snapshot_name: string;
  service_snapshot_price_cents: number;
  status: "confirmed" | "cancelled" | "completed";
  notes: string | null;
};

export type StatusFilter = "all" | "confirmed" | "cancelled" | "completed";

export const ROW_BORDER: Record<Appt["status"], string> = {
  confirmed: "var(--accent)",
  completed: "var(--success)",
  cancelled: "var(--destructive)",
};

export const STATUSES: { key: StatusFilter; label: string; dotCls: string }[] = [
  { key: "all", label: "Todos", dotCls: "bg-muted-foreground" },
  { key: "confirmed", label: "Agendados", dotCls: "bg-accent" },
  { key: "completed", label: "Concluídos", dotCls: "bg-success" },
  { key: "cancelled", label: "Cancelados", dotCls: "bg-destructive" },
];
