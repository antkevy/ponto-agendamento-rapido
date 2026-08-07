import { ArrowRight, Sparkles } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ShineBorder } from "@/components/effects";
import { optimizedImageUrl } from "@/lib/image";

export type ServiceVariant = "brand" | "accent" | "success" | "warning";

const VARIANT: Record<ServiceVariant, string> = {
  brand: "var(--brand)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
};

export function ServiceCard({
  title,
  description,
  meta,
  image,
  imageAlt,
  variant = "brand",
  href,
  shine = false,
  className,
  style,
}: {
  title: string;
  description?: string | null;
  meta?: ReactNode;
  image?: string | null;
  imageAlt?: string;
  variant?: ServiceVariant;
  href?: string;
  shine?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const color = VARIANT[variant];
  const Tag = href ? "a" : "div";
  return (
    <Tag
      href={href}
      style={style}
      {...(href ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "ui-card group relative overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        className,
      )}
    >
      {shine && (
        <ShineBorder
          shineColor={color}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        />
      )}
      <span aria-hidden="true" className="h-1.5 block" style={{ backgroundColor: color }} />
      {image ? (
        <div className="relative overflow-hidden">
          <img
            src={optimizedImageUrl(image, 800) ?? image}
            alt={imageAlt ?? title}
            loading="lazy"
            decoding="async"
            className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="grid place-items-center aspect-video"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
        >
          <Sparkles
            className="h-8 w-8 transition-transform duration-500 group-hover:scale-110"
            style={{ color }}
          />
        </div>
      )}
      <div className="p-5 flex flex-col gap-2 flex-1">
        <p className="font-bold text-lg tracking-tight text-foreground">{title}</p>
        {meta && (
          <p className="text-2xl font-black tracking-tight" style={{ color }}>
            {meta}
          </p>
        )}
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
        {href && (
          <span
            className="mt-auto pt-2 inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color }}
          >
            Ver detalhes
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        )}
      </div>
    </Tag>
  );
}
