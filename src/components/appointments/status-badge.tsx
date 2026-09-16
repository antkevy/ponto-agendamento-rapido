import type { Appt } from "./types";

export function StatusBadge({ status }: { status: Appt["status"] }) {
  const map = {
    confirmed: {
      label: "Agendado",
      cls: "text-accent border-accent/30 bg-accent/10",
      dot: "bg-accent",
    },
    cancelled: {
      label: "Cancelado",
      cls: "text-destructive border-destructive/30 bg-destructive/10",
      dot: "bg-destructive",
    },
    completed: {
      label: "Concluído",
      cls: "text-success border-success/30 bg-success/10",
      dot: "bg-success",
    },
  } as const;
  const c = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${c.cls}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
