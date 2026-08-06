import { Link } from "@tanstack/react-router";
import { CalendarCheck2 } from "lucide-react";

export function BrandLogo({
  to = "/",
  size = "md",
  className = "",
}: {
  to?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "lg" ? "w-11 h-11" : size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const icon = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-2xl";

  return (
    <Link to={to} className={`flex items-center gap-2.5 ${className}`}>
      <span
        className={`${dim} rounded-full grid place-items-center text-white shadow-md`}
        style={{
          backgroundImage: "linear-gradient(180deg, oklch(0.62 0.17 250), oklch(0.55 0.18 250))",
        }}
      >
        <CalendarCheck2 className={icon} strokeWidth={2.5} />
      </span>
      <span className={`${text} font-bold tracking-tight text-foreground`}>Agendaí</span>
    </Link>
  );
}
