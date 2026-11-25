import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal acessível: fecha com Escape, mantém o foco dentro enquanto aberto,
 * restaura o foco ao fechar e bloqueia o scroll do body. O backdrop remains
 * clicável para fechar (comportamento existente no app).
 */
export function Modal({
  children,
  onClose,
  size = "md",
  hideFooter,
  ariaLabel = "Janela de diálogo",
  contentClassName,
}: {
  children: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  hideFooter?: boolean;
  ariaLabel?: string;
  contentClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.getClientRects().length > 0,
      );

    (focusable()[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm dark:bg-black/60 dark:backdrop-blur-md grid sm:place-items-center animate-fade-in-up"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "bg-background w-full sm:rounded-2xl p-5 sm:p-6 h-[100dvh] sm:h-auto sm:my-8 overflow-y-auto focus:outline-none",
          size === "md" && "sm:max-w-md",
          size === "lg" && "sm:max-w-xl",
          size === "xl" && "sm:max-w-3xl lg:max-w-4xl lg:h-[min(88vh,760px)] lg:overflow-hidden",
          contentClassName,
        )}
        onClick={(event) => event.stopPropagation()}
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
