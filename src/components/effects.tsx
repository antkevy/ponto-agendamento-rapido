import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Borda com um brilho (cor `shineColor`) que percorre o contorno do elemento.
 * Portado nativamente do ShineBorder (magicui.design), adaptado aos tokens do
 * projeto (paleta sólida, sem gradientes preenchidos). Renderiza no SSR como
 * uma borda estática sutil.
 */
export function ShineBorder({
  borderWidth = 1,
  duration = 8,
  shineColor = "var(--accent)",
  className,
  style,
}: {
  borderWidth?: number;
  duration?: number;
  shineColor?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ui-shine-border pointer-events-none absolute inset-0 rounded-[inherit]",
        className,
      )}
      style={
        {
          "--border-width": `${borderWidth}px`,
          "--duration": `${duration}s`,
          "--shine-color": shineColor,
          ...style,
        } as CSSProperties
      }
    />
  );
}

/**
 * Ponto de luz que percorre a borda do elemento (BorderBeam, magicui.design),
 * reimplementado com CSS `offset-path` (sem dependências). Sutil e contínuo.
 */
export function BorderBeam({
  size = 40,
  duration = 6,
  delay = 0,
  reverse = false,
  colorFrom = "var(--accent)",
  colorTo = "var(--brand)",
  borderWidth = 1,
  className,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  reverse?: boolean;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("ui-border-beam z-[1]", className)}
      style={
        {
          "--beam-size": `${size}px`,
          "--beam-duration": `${duration}s`,
          "--beam-delay": `${delay}s`,
          "--beam-direction": reverse ? "reverse" : "normal",
          "--beam-from": colorFrom,
          "--beam-to": colorTo,
          "--beam-width": `${borderWidth}px`,
        } as CSSProperties
      }
    >
      <span className="ui-border-beam__dot" />
    </span>
  );
}

/**
 * Revela palavras uma a uma quando o elemento entra no viewport (TextReveal,
 * magicui.design), reimplementado com IntersectionObserver (sem motion/react).
 * No SSR renderiza totalmente visível. Palavras em `accentWords` recebem a cor
 * de destaque do design system.
 */
export function TextReveal({
  text,
  className,
  accentWords = [],
  as: Tag = "span",
  delay = 0,
  stagger = 45,
}: {
  text: string;
  className?: string;
  accentWords?: string[];
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div";
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
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
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const words = useMemo(() => text.split(" ").filter(Boolean), [text]);
  const accents = useMemo(() => new Set(accentWords), [accentWords]);

  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {words.map((word, i) => {
        const hidden = mounted && !visible;
        return (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
            <span
              className={cn(
                "inline-block will-change-transform",
                accents.has(word) && "ui-accent-text",
              )}
              style={{
                transitionDelay: hidden ? "0ms" : `${delay + i * stagger}ms`,
                transform: hidden ? "translateY(110%)" : "translateY(0)",
                opacity: hidden ? 0 : 1,
                transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease",
              }}
            >
              {word}
            </span>
            {i < words.length - 1 ? "\u00A0" : null}
          </span>
        );
      })}
    </Tag>
  );
}

/**
 * Contador animado (NumberTicker, magicui.design): anima de 0 até `value` ao
 * entrar no viewport, usando requestAnimationFrame + easing (sem dependências).
 * No SSR mostra o valor final (sem flash).
 */
export function NumberTicker({
  value,
  className,
  duration = 1.2,
  format = (n: number) => String(Math.round(n)),
}: {
  value: number;
  className?: string;
  duration?: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - t0) / (duration * 1000), 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(display === null ? value : display)}
    </span>
  );
}

/**
 * Botão magnético (Magnet, reactbits.dev): o conteúdo "segue" o cursor com um
 * leve deslocamento, apenas em dispositivos com mouse. Desativado em
 * `prefers-reduced-motion`.
 */
export function Magnet({
  children,
  className,
  strength = 6,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      setOffset({ x, y });
    };
    const onLeave = () => setOffset({ x: 0, y: 0 });
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("inline-block transition-transform duration-300 ease-out", className)}
      style={{ transform: `translate(${offset.x * strength}px, ${offset.y * strength}px)` }}
    >
      {children}
    </div>
  );
}

/**
 * Palavra que roda com slide (RotatingText, reactbits.dev), reimplementada com
 * CSS puro + setInterval (sem motion). No SSR mostra a primeira palavra; parado
 * em `prefers-reduced-motion`. Palavras em destaque usam `ui-accent-text`.
 */
export function RotatingText({
  texts,
  className,
  accent = false,
  interval = 2200,
}: {
  texts: string[];
  className?: string;
  accent?: boolean;
  interval?: number;
}) {
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setLeaving(texts[current]);
      setCurrent((c) => (c + 1) % texts.length);
    }, interval);
    return () => clearInterval(id);
  }, [texts, current, interval]);

  const wordClass = cn("inline-block whitespace-nowrap", accent && "ui-accent-text");

  return (
    <span className={cn("ui-rotating inline-block overflow-hidden align-baseline", className)}>
      {leaving !== null && leaving !== texts[current] && (
        <span key={`out-${leaving}`} aria-hidden="true" className={cn("ui-text-out", wordClass)}>
          {leaving}
        </span>
      )}
      <span key={`in-${current}`} className={cn("ui-text-in", wordClass)}>
        {texts[current]}
      </span>
    </span>
  );
}

/**
 * Card com grid de pontos + brilho que segue o cursor (SpotlightCard /
 * MouseEffectCard, kokonutui.com), reimplementado com CSS puro (sem motion).
 * Decorativo e silencioso: o brilho só aparece no hover.
 */
export function SpotlightCard({
  children,
  className,
  style,
  glow = "var(--brand)",
  dotColor,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  glow?: string;
  dotColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      className={cn("ui-spotlight ui-dot-grid relative overflow-hidden", className)}
      style={{ "--spot-glow": glow, "--spot-dot": dotColor, ...style } as CSSProperties}
    >
      <span aria-hidden="true" className="ui-spotlight__glow" />
      {children}
    </div>
  );
}
