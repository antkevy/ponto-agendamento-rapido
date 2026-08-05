import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tabela estilo "card" (inspirada em cnippet-table do 21st.dev).
 * Container arredondado com rolagem horizontal, cabeçalho destacado e
 * hover suave nas linhas.
 */
export function CardTable({
  className,
  tableClassName,
  children,
}: {
  className?: string;
  tableClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("card-elevated overflow-hidden", className)}>
      <div className="relative overflow-x-auto scrollbar-slim">
        <table className={cn("w-full caption-bottom text-sm", tableClassName)}>{children}</table>
      </div>
    </div>
  );
}

export function DataTableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-accent/[0.05] last:border-0",
        className,
      )}
      {...props}
    />
  );
}
