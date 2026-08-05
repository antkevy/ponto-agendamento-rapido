import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Reveal on scroll: elemento começa invisível (só no cliente) e aparece
 * suavemente quando entra no viewport. No SSR renderiza totalmente visível
 * (sem flash e sem esconder conteúdo do SEO).
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        mounted && !visible && "opacity-0 translate-y-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
