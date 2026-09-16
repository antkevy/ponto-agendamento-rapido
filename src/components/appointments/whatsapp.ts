import { formatBRL } from "@/lib/booking";
import type { Appt } from "./types";

export function whatsAppUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

export function whatsAppMsg(
  a: Appt,
  businessName: string,
  status: Appt["status"],
  customConfirmed: string | null,
  customCancelled: string | null,
) {
  if (status === "completed") return "";
  const date = new Date(a.starts_at).toLocaleDateString("pt-BR", { dateStyle: "full" });
  const time = new Date(a.starts_at).toLocaleTimeString("pt-BR", { timeStyle: "short" });
  const vars: Record<string, string> = {
    "{nome}": a.client_name,
    "{negocio}": businessName,
    "{data}": date,
    "{horario}": time,
    "{servico}": a.service_snapshot_name,
    "{valor}": formatBRL(a.service_snapshot_price_cents),
  };
  const replace = (s: string) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(k, v), s);
  const template = status === "confirmed" ? customConfirmed : customCancelled;
  if (template?.trim()) return replace(template);
  if (status === "confirmed") {
    return `Ola ${a.client_name}! Seu agendamento na ${businessName} esta agendado!\n\nData: ${date}\nHorario: ${time}\nServico: ${a.service_snapshot_name}\nValor: ${formatBRL(a.service_snapshot_price_cents)}\n\nQualquer duvida, estamos a disposicao!`;
  }
  return `Ola ${a.client_name}! Notamos que voce cancelou seu agendamento na ${businessName}.\n\nSe precisar de ajuda ou quiser remarcar, e so nos chamar! Estamos aqui para o que precisar.`;
}
