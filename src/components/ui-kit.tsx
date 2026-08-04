import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Botão --------------------------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
  fullWidth?: boolean;
  icon?: LucideIcon;
};

export function UIButton({
  variant = "primary",
  size = "md",
  fullWidth,
  icon: Icon,
  className,
  children,
  ...rest
}: BtnProps) {
  return (
    <button
      {...rest}
      className={cn(
        "ui-ripple inline-flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all",
        size === "lg" ? "min-h-[56px] px-6 text-base" : "min-h-[48px] px-5 text-sm",
        variant === "primary" && "ui-btn-primary",
        variant === "outline" && "ui-btn-outline",
        variant === "ghost" && "ui-btn-ghost",
        fullWidth && "w-full",
        "disabled:opacity-60 disabled:pointer-events-none",
        className,
      )}
    >
      {Icon && <Icon className="h-5 w-5" />}
      {children}
    </button>
  );
}

/* ---------------------------------- Card ---------------------------------- */

export function UICard({
  className,
  children,
  glass,
}: {
  className?: string;
  children: ReactNode;
  glass?: boolean;
}) {
  return (
    <div className={cn(glass ? "ui-card-glass" : "ui-card", className)}>{children}</div>
  );
}

export function UICardHeader({
  icon: Icon,
  title,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {Icon && <UIIconBubble icon={Icon} />}
      <h3 className="text-lg font-bold tracking-tight text-foreground flex-1 min-w-0">{title}</h3>
      {action}
    </div>
  );
}

/* --------------------------------- Ícones --------------------------------- */

export function UIIconBubble({ icon: Icon, size = "md" }: { icon: LucideIcon; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "ui-icon-bubble shrink-0 grid place-items-center rounded-xl",
        size === "sm" ? "h-8 w-8" : "h-11 w-11",
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

/* --------------------------------- Títulos -------------------------------- */

export function UITitle({
  children,
  accent,
  size = "md",
  className,
}: {
  children: ReactNode;
  accent?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-black tracking-tight text-foreground leading-[1.08]",
        size === "lg" ? "text-3xl sm:text-[2.6rem]" : "text-2xl sm:text-3xl",
        className,
      )}
    >
      {children}
      {accent && (
        <>
          <br />
          <span className="ui-accent-text">{accent}</span>
        </>
      )}
    </h1>
  );
}

export function UILabel({ children }: { children: ReactNode }) {
  return <span className="block text-sm font-semibold text-foreground mb-2">{children}</span>;
}

/* --------------------------------- Inputs --------------------------------- */

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  icon?: LucideIcon;
  trailing?: ReactNode;
};

export const UIInput = forwardRef<HTMLInputElement, FieldProps>(function UIInput(
  { label, icon: Icon, trailing, className, ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <UILabel>{label}</UILabel>}
      <span className="ui-field">
        {Icon && <Icon className="ui-field-icon" />}
        <input
          ref={ref}
          {...rest}
          className={cn("ui-field-input", Icon && "pl-11", trailing && "pr-12", className)}
        />
        {trailing && <span className="ui-field-trailing">{trailing}</span>}
      </span>
    </label>
  );
});

export function UITextarea({
  label,
  icon: Icon,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; icon?: LucideIcon }) {
  return (
    <label className="block">
      {label && <UILabel>{label}</UILabel>}
      <span className="ui-field">
        {Icon && <Icon className="ui-field-icon ui-field-icon-top" />}
        <textarea {...rest} className={cn("ui-field-input py-3", Icon && "pl-11", className)} />
      </span>
    </label>
  );
}

export function UIPasswordInput(props: Omit<FieldProps, "type" | "trailing">) {
  const [show, setShow] = useState(false);
  return (
    <UIInput
      {...props}
      type={show ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <EyeGlyph open={show} />
        </button>
      }
    />
  );
}

function EyeGlyph({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

/* --------------------------------- Badges --------------------------------- */

export function UIBadge({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="ui-badge">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/* --------------------------------- Avisos --------------------------------- */

export function UINotice({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-notice">
      <Icon className="h-5 w-5 shrink-0 ui-accent-text mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-foreground text-sm">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

/* -------------------------------- Resumos --------------------------------- */

export function UISummaryRow({
  icon: Icon,
  children,
  sub,
}: {
  icon: LucideIcon;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-[18px] w-[18px] shrink-0 mt-0.5 ui-icon-color" />
      <div className="min-w-0 text-sm">
        <p className="text-foreground font-medium">{children}</p>
        {sub && <p className="text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* -------------------------------- Headers --------------------------------- */

export function UIPageHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="ui-header grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-6">
      {left}
      <div className="min-w-0 text-center sm:text-left">
        <h2 className="truncate text-base sm:text-lg font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      <div className="justify-self-end">{right}</div>
    </header>
  );
}
