import { useState } from "react";
import {
  X,
  CheckCheck,
  Phone,
  Mail,
  MessageSquare,
  Tag,
  CalendarClock,
  Clock,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatBRL, formatLongDate, formatTime } from "@/lib/booking";
import { displayPhoneBR } from "@/lib/phone";
import { Modal } from "@/routes/app.servicos";
import { UITextarea, UINotice } from "@/components/ui-kit";
import { ROW_BORDER, type Appt } from "./types";
import { StatusBadge } from "./status-badge";
import { whatsAppMsg, whatsAppUrl } from "./whatsapp";

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="block text-sm font-medium truncate">{value}</span>
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {href ? (
        <a
          href={href}
          className="flex items-center gap-2.5 min-w-0 text-accent hover:underline underline-offset-2"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}

export function ApptDetailModal({
  a,
  businessName,
  msgConfirmed,
  msgCancelled,
  onClose,
  onUpdate,
  onSaveNotes,
}: {
  a: Appt;
  businessName: string;
  msgConfirmed: string | null;
  msgCancelled: string | null;
  onClose: () => void;
  onUpdate: (s: Appt["status"]) => void;
  onSaveNotes: (notes: string | null) => void;
}) {
  const start = new Date(a.starts_at);
  const end = new Date(a.ends_at);
  const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  const initials = a.client_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  const [notesDraft, setNotesDraft] = useState(a.notes ?? "");
  const notesChanged = notesDraft.trim() !== (a.notes ?? "").trim();

  return (
    <Modal onClose={onClose} hideFooter>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Detalhes do agendamento
          </p>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className="ui-icon-bubble h-14 w-14 sm:h-16 sm:w-16 shrink-0 grid place-items-center rounded-2xl text-xl sm:text-2xl font-black">
            {initials || a.client_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-tight truncate">
              {a.client_name}
            </h3>
            <div className="mt-1.5">
              <StatusBadge status={a.status} />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/40">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: ROW_BORDER[a.status] }}
          />
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="ui-icon-bubble h-10 w-10 shrink-0 grid place-items-center rounded-xl">
                <Tag className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Serviço
                </span>
                <span className="block font-semibold">{a.service_snapshot_name}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Valor
                </span>
                <span
                  className="block text-xl font-black tracking-tight"
                  style={{ color: "var(--brand)" }}
                >
                  {formatBRL(a.service_snapshot_price_cents)}
                </span>
              </span>
            </div>

            <div className="border-t border-dashed border-border" />

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow
                icon={Phone}
                label="Telefone"
                value={displayPhoneBR(a.client_phone)}
                href={`tel:${a.client_phone}`}
              />
              {a.client_email && (
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={a.client_email}
                  href={`mailto:${a.client_email}`}
                />
              )}
              <InfoRow icon={CalendarClock} label="Data" value={formatLongDate(start)} />
              <InfoRow
                icon={Clock}
                label="Horário"
                value={`${formatTime(start)} – ${formatTime(end)} · ${duration} min`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <StickyNote className="h-4 w-4 text-muted-foreground" /> Observações
          </label>
          <UITextarea
            rows={3}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Alguma preferência ou observação do cliente..."
          />
          {notesChanged && (
            <button
              type="button"
              onClick={() => onSaveNotes(notesDraft.trim() || null)}
              className="btn-brand w-full inline-flex items-center justify-center gap-2"
            >
              <CheckCheck className="h-4 w-4 shrink-0" /> Salvar observações
            </button>
          )}
          {a.notes && !notesChanged && (
            <UINotice icon={StickyNote} title="Observações salvas">
              {a.notes}
            </UINotice>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <button
            onClick={() => {
              const msg = whatsAppMsg(a, businessName, a.status, msgConfirmed, msgCancelled);
              window.open(
                `${whatsAppUrl(a.client_phone)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`,
                "_blank",
              );
            }}
            className="btn-brand w-full inline-flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-5 w-5 shrink-0" />
            Enviar mensagem no WhatsApp
          </button>
          {a.status === "confirmed" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdate("completed")}
                className="btn-outline-brand inline-flex items-center justify-center gap-2 !text-success"
              >
                <CheckCheck className="h-5 w-5 shrink-0" />
                Concluir
              </button>
              <button
                onClick={() => {
                  if (confirm("Cancelar este agendamento?")) onUpdate("cancelled");
                }}
                className="btn-outline-brand inline-flex items-center justify-center gap-2 !text-destructive"
              >
                <X className="h-5 w-5 shrink-0" />
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
