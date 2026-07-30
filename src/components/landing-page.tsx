import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowUp, CalendarCheck2, Check, CheckCircle2, Clock, Facebook,
  Globe, Heart, Instagram, Linkedin, Mail, MapPin, MessageCircle, Music2,
  Phone, Quote, ShieldCheck, Sparkles, Star, Target, Users, X, Youtube,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatBRL } from "@/lib/booking";
import { onlyDigits } from "@/lib/phone";

/* ---------------------------------- types --------------------------------- */

export type LandingService = {
  id: string; name: string; duration_minutes: number; price_cents: number;
  description: string | null; image_url: string | null; category?: string | null;
};
export type LandingEmployee = {
  id: string; name: string; photo_url: string | null; specialty?: string | null;
  experience_years?: number | null; bio?: string | null; services_done?: number | null;
};
export type LandingPlano = { id: string; name: string; description: string | null; price_cents: number; image_url: string | null };
export type LandingDepoimento = { id: string; client_name: string; client_photo: string | null; rating: number; comment: string; created_at: string };
export type LandingGaleria = { id: string; image_url: string; caption: string | null; category: string | null };
export type LandingFaq = { id: string; question: string; answer: string };

type Props = {
  pro: any;
  services: LandingService[];
  loadingServices: boolean;
  employees: LandingEmployee[];
  planos: LandingPlano[];
  depoimentos: LandingDepoimento[];
  galeria: LandingGaleria[];
  faq: LandingFaq[];
  clientCount: number;
  onAgendar: () => void;
  onSelectService: (s: LandingService) => void;
};

/* -------------------------------- utilities ------------------------------- */

export function whatsappLink(raw?: string | null, message?: string) {
  const digits = onlyDigits(raw ?? "");
  if (!digits) return null;
  const full = digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${full}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Reveals children on scroll (respects prefers-reduced-motion). */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(18px)",
        transition: `opacity 600ms ease ${delay}ms, transform 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`Nota ${rating.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`${cls} ${i <= Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle, center = true }: { eyebrow: string; title: React.ReactNode; subtitle?: string; center?: boolean }) {
  return (
    <div className={`${center ? "text-center mx-auto" : ""} max-w-2xl space-y-3 mb-12`}>
      <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-brand">{eyebrow}</p>
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-tight">{title}</h2>
      {subtitle && <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------- main export ------------------------------ */

export function LandingPage(props: Props) {
  const { pro, services, loadingServices, employees, planos, depoimentos, galeria, faq, clientCount, onAgendar, onSelectService } = props;

  const brand = pro.brand_color || "#0284C7";
  const brand2 = pro.secondary_color || brand;
  const radius = pro.corner_radius === "sharp" ? "0.25rem" : pro.corner_radius === "soft" ? "0.75rem" : "1.25rem";
  const btnRadius = pro.button_style === "square" ? "0.5rem" : pro.button_style === "rounded" ? "0.9rem" : "9999px";

  const rating = depoimentos.length
    ? depoimentos.reduce((a, d) => a + (d.rating || 5), 0) / depoimentos.length
    : 5;

  const whats = whatsappLink(pro.whatsapp || pro.phone, `Olá! Vim pela página da ${pro.business_name} e gostaria de agendar.`);
  const showEmployees = pro.show_employees !== false && employees.length > 0;
  const hasAbout = Boolean(pro.story || pro.mission || pro.values_text || pro.differentials);

  // Aplica o tema definido nas configurações da empresa.
  useEffect(() => {
    const mode = pro.theme_mode;
    if (mode !== "light" && mode !== "dark") return;
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.toggle("dark", mode === "dark");
    return () => root.classList.toggle("dark", had);
  }, [pro.theme_mode]);

  const [lightbox, setLightbox] = useState<LandingGaleria | null>(null);

  return (
    <div
      className="landing-root min-h-screen bg-background"
      style={{
        "--brand": brand,
        "--brand-2": brand2,
        "--lp-radius": radius,
        "--lp-btn-radius": btnRadius,
      } as React.CSSProperties}
    >
      <LandingNav pro={pro} brand={brand} onAgendar={onAgendar} hasAbout={hasAbout} showServices={services.length > 0} showEmployees={showEmployees} showGaleria={galeria.length > 0} showFaq={faq.length > 0} />

      <main id="topo">
        <Hero pro={pro} brand={brand} brand2={brand2} rating={rating} reviews={depoimentos.length} clientCount={clientCount} whats={whats} onAgendar={onAgendar} />
        {hasAbout && <About pro={pro} brand={brand} />}
        {services.length > 0 || loadingServices ? (
          <Services services={services} loading={loadingServices} onSelect={onSelectService} onAgendar={onAgendar} />
        ) : null}
        {planos.length > 0 && <Planos planos={planos} onAgendar={onAgendar} />}
        {showEmployees && <Team employees={employees} />}
        {galeria.length > 0 && <Gallery galeria={galeria} onOpen={setLightbox} />}
        {depoimentos.length > 0 && <Testimonials depoimentos={depoimentos} rating={rating} />}
        {pro.video_url && <VideoSection url={pro.video_url} />}
        {(pro.address || pro.lat) && <Location pro={pro} whats={whats} />}
        <Socials pro={pro} />
        {faq.length > 0 && <Faq faq={faq} />}
        <FinalCTA pro={pro} brand={brand} brand2={brand2} onAgendar={onAgendar} />
      </main>

      <LandingFooter pro={pro} />

      <StickyCTA onAgendar={onAgendar} whats={whats} />
      <BackToTop />
      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* --------------------------------- navbar --------------------------------- */

function LandingNav({ pro, brand, onAgendar, hasAbout, showServices, showEmployees, showGaleria, showFaq }: any) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    hasAbout && ["#sobre", "Sobre"],
    showServices && ["#servicos", "Serviços"],
    showEmployees && ["#equipe", "Equipe"],
    showGaleria && ["#galeria", "Galeria"],
    showFaq && ["#faq", "Perguntas"],
  ].filter(Boolean) as Array<[string, string]>;

  return (
    <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${solid ? "bg-background/85 backdrop-blur-xl border-b border-border shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <a href="#topo" className="flex min-w-0 items-center gap-2.5">
          {pro.logo_url ? (
            <img src={pro.logo_url} alt={`Logo ${pro.business_name}`} loading="lazy" className="h-10 w-10 shrink-0 rounded-xl object-cover border border-border" />
          ) : (
            <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center text-white font-black" style={{ backgroundColor: brand }}>
              {pro.business_name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate font-bold tracking-tight text-foreground">{pro.business_name}</span>
        </a>
        <div className="flex items-center gap-1 sm:gap-4">
          <nav className="hidden lg:flex items-center gap-6 text-sm text-muted-foreground mr-2" aria-label="Seções da página">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-foreground transition-colors">{label}</a>
            ))}
          </nav>
          <ThemeToggle />
          <button onClick={onAgendar} className="btn-lp-primary hidden sm:inline-flex items-center gap-2 text-sm">
            Agendar agora <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({ pro, brand, brand2, rating, reviews, clientCount, whats, onAgendar }: any) {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32 pb-16 sm:pb-24">
      {pro.banner_url ? (
        <>
          <img src={pro.banner_url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-background/85 dark:bg-background/90 backdrop-blur-[2px]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-page-gradient" />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(60% 60% at 20% 10%, ${brand}22 0%, transparent 70%), radial-gradient(50% 50% at 90% 20%, ${brand2}1f 0%, transparent 70%)` }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <Reveal className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              {pro.logo_url ? (
                <img src={pro.logo_url} alt={`Logo ${pro.business_name}`} className="h-14 w-14 rounded-2xl object-cover border border-border shadow-md" />
              ) : (
                <span className="h-14 w-14 rounded-2xl grid place-items-center text-2xl font-black text-white shadow-md" style={{ backgroundColor: brand }}>
                  {pro.business_name.charAt(0).toUpperCase()}
                </span>
              )}
              {pro.category && <span className="badge-pill text-xs sm:text-sm"><Sparkles className="h-4 w-4 text-brand" aria-hidden /> {pro.category}</span>}
            </div>

            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground leading-[1.05]">
                {pro.business_name}
              </h1>
              {pro.tagline && (
                <p className="mt-3 text-xl sm:text-2xl font-bold tracking-tight" style={{ color: brand }}>{pro.tagline}</p>
              )}
            </div>

            {pro.description && (
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">{pro.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <StarRating rating={rating} size="md" />
                <span className="text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
                {reviews > 0 && <span className="text-sm text-muted-foreground">({reviews} avaliaç{reviews === 1 ? "ão" : "ões"})</span>}
              </div>
              {clientCount > 0 && (
                <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> {clientCount}+ atendimentos
                </span>
              )}
            </div>

            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {pro.city && <li className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> {pro.city}</li>}
              {pro.address && <li className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> {pro.address}</li>}
              {pro.opening_hours_display && <li className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden /> {pro.opening_hours_display}</li>}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button onClick={onAgendar} className="btn-lp-primary inline-flex items-center justify-center gap-2 text-base sm:text-lg w-full sm:w-auto">
                <CalendarCheck2 className="h-5 w-5" aria-hidden /> Agendar agora
              </button>
              {whats && (
                <a href={whats} target="_blank" rel="noopener noreferrer" className="btn-lp-outline inline-flex items-center justify-center gap-2 w-full sm:w-auto">
                  <MessageCircle className="h-5 w-5" aria-hidden /> Falar no WhatsApp
                </a>
              )}
            </div>

            <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
              {["Confirmação imediata", "Sem cadastro", "Reagende quando precisar"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-success" strokeWidth={3} aria-hidden /> {t}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="hidden lg:block">
            <div className="relative">
              <div className="aspect-4/5 w-full overflow-hidden shadow-2xl border border-border" style={{ borderRadius: "var(--lp-radius)", background: `linear-gradient(140deg, ${brand}26, ${brand2}44)` }}>
                {pro.banner_url || pro.logo_url ? (
                  <img src={pro.banner_url || pro.logo_url} alt={`Ambiente da ${pro.business_name}`} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center text-8xl font-black text-white/40">{pro.business_name.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <div className="absolute -bottom-5 -left-5 card-elevated p-4 shadow-xl flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl grid place-items-center text-white" style={{ backgroundColor: brand }}>
                  <CalendarCheck2 className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold leading-none">Agenda online</p>
                  <p className="text-xs text-muted-foreground mt-1">Disponível 24h por dia</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- sobre --------------------------------- */

function About({ pro, brand }: any) {
  const blocks = [
    pro.mission && { icon: Target, label: "Missão", text: pro.mission },
    pro.values_text && { icon: Heart, label: "Valores", text: pro.values_text },
    pro.differentials && { icon: ShieldCheck, label: "Diferenciais", text: pro.differentials },
  ].filter(Boolean) as Array<{ icon: any; label: string; text: string }>;

  return (
    <section id="sobre" className="py-20 sm:py-28 bg-section-soft scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHead eyebrow="Sobre nós" title={<>Quem cuida do seu <span style={{ color: brand }}>atendimento.</span></>} />
        </Reveal>
        {pro.story && (
          <Reveal delay={80}>
            <p className="max-w-3xl mx-auto text-center text-base sm:text-lg text-muted-foreground leading-relaxed whitespace-pre-line">{pro.story}</p>
          </Reveal>
        )}
        {blocks.length > 0 && (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.map(({ icon: Icon, label, text }, i) => (
              <Reveal key={label} delay={i * 90}>
                <div className="card-elevated h-full p-6 space-y-3 hover:-translate-y-1 hover:shadow-lg transition-all">
                  <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ backgroundColor: `${brand}1f` }}>
                    <Icon className="h-5 w-5" style={{ color: brand }} aria-hidden />
                  </span>
                  <p className="font-bold tracking-tight">{label}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------- serviços -------------------------------- */

function Services({ services, loading, onSelect, onAgendar }: { services: LandingService[]; loading: boolean; onSelect: (s: LandingService) => void; onAgendar: () => void }) {
  return (
    <section id="servicos" className="py-20 sm:py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHead eyebrow="Serviços" title="Escolha o que você precisa" subtitle="Preços e duração transparentes. Agende em poucos toques." />
        </Reveal>
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-72" />)}
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s, i) => (
                <Reveal key={s.id} delay={(i % 3) * 90}>
                  <article className="card-elevated h-full overflow-hidden flex flex-col hover:-translate-y-1 hover:shadow-xl transition-all">
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.name} loading="lazy" className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video grid place-items-center bg-muted">
                        <Sparkles className="h-7 w-7 text-brand" aria-hidden />
                      </div>
                    )}
                    <div className="p-5 flex flex-col gap-3 flex-1">
                      {s.category && <span className="badge-pill self-start !py-1 !px-3 text-xs">{s.category}</span>}
                      <h3 className="text-lg font-bold tracking-tight">{s.name}</h3>
                      {s.description && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{s.description}</p>}
                      <div className="flex items-center justify-between gap-3 mt-auto pt-2">
                        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden /> {s.duration_minutes} min</span>
                        <span className="text-xl font-black tracking-tight text-brand">{formatBRL(s.price_cents)}</span>
                      </div>
                      <button onClick={() => onSelect(s)} className="btn-lp-primary w-full text-sm mt-1">Agendar este serviço</button>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
            <div className="mt-10 text-center">
              <button onClick={onAgendar} className="btn-lp-outline inline-flex items-center gap-2">
                Ver todos e agendar <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- planos --------------------------------- */

function Planos({ planos, onAgendar }: { planos: LandingPlano[]; onAgendar: () => void }) {
  return (
    <section id="planos" className="py-20 sm:py-28 bg-section-soft scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Planos" title="Pacotes pensados para você" /></Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {planos.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 90}>
              <div className="card-elevated h-full p-6 flex flex-col gap-4 text-center hover:-translate-y-1 hover:shadow-xl transition-all">
                {p.image_url && <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-36 rounded-xl object-cover" />}
                <p className="text-lg font-bold tracking-tight">{p.name}</p>
                <p className="text-3xl font-black tracking-tight text-brand">{formatBRL(p.price_cents)}</p>
                {p.description && <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>}
                <button onClick={onAgendar} className="btn-lp-outline w-full text-sm mt-auto">Quero este plano</button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- equipe --------------------------------- */

function Team({ employees }: { employees: LandingEmployee[] }) {
  return (
    <section id="equipe" className="py-20 sm:py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Profissionais" title="Quem vai te atender" subtitle="Equipe treinada e pronta para cuidar de você." /></Reveal>
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
          {employees.map((e, i) => (
            <Reveal key={e.id} delay={(i % 4) * 80}>
              <article className="card-elevated h-full overflow-hidden hover:-translate-y-1 hover:shadow-xl transition-all">
                {e.photo_url ? (
                  <img src={e.photo_url} alt={e.name} loading="lazy" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square grid place-items-center bg-muted text-3xl font-black text-muted-foreground">{e.name.charAt(0).toUpperCase()}</div>
                )}
                <div className="p-4 space-y-2">
                  <h3 className="font-bold tracking-tight truncate">{e.name}</h3>
                  {e.specialty && <p className="text-sm text-brand font-medium truncate">{e.specialty}</p>}
                  {typeof e.experience_years === "number" && e.experience_years > 0 && (
                    <p className="text-xs text-muted-foreground">{e.experience_years} ano{e.experience_years > 1 ? "s" : ""} de experiência</p>
                  )}
                  {e.bio && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{e.bio}</p>}
                  <div className="flex items-center gap-3 pt-1">
                    <StarRating rating={5} />
                    {typeof e.services_done === "number" && e.services_done > 0 && (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden /> {e.services_done}</span>
                    )}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- galeria -------------------------------- */

function Gallery({ galeria, onOpen }: { galeria: LandingGaleria[]; onOpen: (i: LandingGaleria) => void }) {
  return (
    <section id="galeria" className="py-20 sm:py-28 bg-section-soft scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Galeria" title="Nossos trabalhos" /></Reveal>
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
          {galeria.map((g) => (
            <button
              key={g.id}
              onClick={() => onOpen(g)}
              className="mb-4 block w-full overflow-hidden border border-border group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderRadius: "var(--lp-radius)" }}
              aria-label={g.caption ? `Abrir foto: ${g.caption}` : "Abrir foto da galeria"}
            >
              <img src={g.image_url} alt={g.caption || "Foto do trabalho realizado"} loading="lazy" className="w-full transition-transform duration-500 group-hover:scale-105" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Lightbox({ item, onClose }: { item: LandingGaleria; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={item.caption || "Foto"} className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm grid place-items-center p-4 animate-fade-in-up" onClick={onClose}>
      <button onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20 transition">
        <X className="h-5 w-5" aria-hidden />
      </button>
      <figure onClick={(e) => e.stopPropagation()} className="max-w-4xl w-full">
        <img src={item.image_url} alt={item.caption || "Foto ampliada"} className="w-full max-h-[80vh] object-contain rounded-2xl" />
        {item.caption && <figcaption className="text-center text-white/80 text-sm mt-3">{item.caption}</figcaption>}
      </figure>
    </div>
  );
}

/* ------------------------------- depoimentos ------------------------------ */

function Testimonials({ depoimentos, rating }: { depoimentos: LandingDepoimento[]; rating: number }) {
  return (
    <section id="depoimentos" className="py-20 sm:py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHead eyebrow="Depoimentos" title="O que dizem sobre nós" subtitle={`Nota média ${rating.toFixed(1)} de 5 em ${depoimentos.length} avaliaç${depoimentos.length === 1 ? "ão" : "ões"}.`} />
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {depoimentos.map((d, i) => (
            <Reveal key={d.id} delay={(i % 3) * 90}>
              <figure className="card-elevated h-full p-6 flex flex-col gap-4 hover:-translate-y-1 hover:shadow-lg transition-all">
                <Quote className="h-6 w-6 text-brand" aria-hidden />
                <blockquote className="text-foreground leading-relaxed flex-1">{d.comment}</blockquote>
                <StarRating rating={d.rating} />
                <figcaption className="flex items-center gap-3 pt-3 border-t border-border">
                  {d.client_photo ? (
                    <img src={d.client_photo} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="h-10 w-10 rounded-full grid place-items-center bg-muted font-bold text-muted-foreground">{d.client_name.charAt(0).toUpperCase()}</span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{d.client_name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- vídeo --------------------------------- */

function VideoSection({ url }: { url: string }) {
  const embed = url.includes("watch?v=") ? url.replace("watch?v=", "embed/") : url.includes("youtu.be/") ? url.replace("youtu.be/", "www.youtube.com/embed/") : url;
  return (
    <section className="py-20 sm:py-28 bg-section-soft">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Vídeo" title="Conheça nosso espaço" /></Reveal>
        <Reveal delay={80}>
          <div className="overflow-hidden border border-border shadow-lg aspect-video" style={{ borderRadius: "var(--lp-radius)" }}>
            <iframe src={embed} title="Vídeo institucional" loading="lazy" allowFullScreen className="h-full w-full" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- localização ------------------------------ */

function Location({ pro, whats }: any) {
  const query = encodeURIComponent(pro.address || `${pro.lat},${pro.lng}`);
  const mapSrc = pro.lat && pro.lng
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${pro.lng - 0.01}%2C${pro.lat - 0.008}%2C${pro.lng + 0.01}%2C${pro.lat + 0.008}&layer=mapnik&marker=${pro.lat}%2C${pro.lng}`
    : null;

  return (
    <section id="local" className="py-20 sm:py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Localização" title="Onde nos encontrar" /></Reveal>
        <div className="grid gap-6 lg:grid-cols-2 items-stretch">
          <Reveal>
            <div className="card-elevated h-full p-6 space-y-5">
              {pro.address && (
                <p className="flex items-start gap-3 text-foreground"><MapPin className="h-5 w-5 text-brand shrink-0 mt-0.5" aria-hidden /> <span>{pro.address}{pro.city ? ` — ${pro.city}` : ""}</span></p>
              )}
              {pro.opening_hours_display && (
                <p className="flex items-start gap-3 text-muted-foreground"><Clock className="h-5 w-5 text-brand shrink-0 mt-0.5" aria-hidden /> <span className="whitespace-pre-line">{pro.opening_hours_display}</span></p>
              )}
              {pro.phone && (
                <p className="flex items-center gap-3 text-muted-foreground"><Phone className="h-5 w-5 text-brand shrink-0" aria-hidden /> <a className="hover:underline" href={`tel:${onlyDigits(pro.phone)}`}>{pro.phone}</a></p>
              )}
              <div className="flex flex-wrap gap-3 pt-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noopener noreferrer" className="btn-lp-primary inline-flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" aria-hidden /> Como chegar
                </a>
                {whats && (
                  <a href={whats} target="_blank" rel="noopener noreferrer" className="btn-lp-outline inline-flex items-center gap-2 text-sm">
                    <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="overflow-hidden border border-border h-72 lg:h-full min-h-72" style={{ borderRadius: "var(--lp-radius)" }}>
              {mapSrc ? (
                <iframe src={mapSrc} title={`Mapa de ${pro.business_name}`} loading="lazy" className="h-full w-full" />
              ) : (
                <div className="h-full w-full grid place-items-center bg-muted text-sm text-muted-foreground p-6 text-center">
                  Mapa indisponível — use o botão "Como chegar".
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ redes sociais ----------------------------- */

const SOCIALS: Array<[string, any, (v: string) => string]> = [
  ["instagram", Instagram, (v) => (v.startsWith("http") ? v : `https://instagram.com/${v.replace("@", "")}`)],
  ["facebook", Facebook, (v) => (v.startsWith("http") ? v : `https://facebook.com/${v}`)],
  ["tiktok", Music2, (v) => (v.startsWith("http") ? v : `https://tiktok.com/@${v.replace("@", "")}`)],
  ["linkedin", Linkedin, (v) => (v.startsWith("http") ? v : `https://linkedin.com/in/${v}`)],
  ["youtube", Youtube, (v) => (v.startsWith("http") ? v : `https://youtube.com/@${v.replace("@", "")}`)],
  ["website", Globe, (v) => (v.startsWith("http") ? v : `https://${v}`)],
];

function Socials({ pro }: any) {
  const items = SOCIALS.filter(([key]) => Boolean(pro[key]));
  if (items.length === 0 && !pro.email) return null;
  return (
    <section className="py-14 border-y border-border bg-section-soft-reverse">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">Siga a gente</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {items.map(([key, Icon, build]) => (
            <a key={key} href={build(pro[key])} target="_blank" rel="noopener noreferrer" aria-label={key}
              className="btn-lp-outline inline-flex items-center gap-2 !min-h-11 text-sm capitalize">
              <Icon className="h-4 w-4" aria-hidden /> {key === "website" ? "Site" : key}
            </a>
          ))}
          {pro.email && (
            <a href={`mailto:${pro.email}`} className="btn-lp-outline inline-flex items-center gap-2 !min-h-11 text-sm">
              <Mail className="h-4 w-4" aria-hidden /> E-mail
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- faq ---------------------------------- */

function Faq({ faq }: { faq: LandingFaq[] }) {
  return (
    <section id="faq" className="py-20 sm:py-28 scroll-mt-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal><SectionHead eyebrow="Perguntas frequentes" title="Tudo claro antes de agendar" /></Reveal>
        <div className="space-y-3">
          {faq.map((f, i) => (
            <Reveal key={f.id} delay={i * 60}>
              <details className="card-elevated p-5 group">
                <summary className="cursor-pointer font-semibold text-foreground list-none flex items-center justify-between gap-4">
                  {f.question}
                  <span aria-hidden className="text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line">{f.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- CTA final ------------------------------- */

function FinalCTA({ pro, brand, brand2, onAgendar }: any) {
  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="p-10 sm:p-16 text-center text-white shadow-2xl" style={{ borderRadius: "var(--lp-radius)", backgroundImage: `linear-gradient(135deg, ${brand} 0%, ${brand2} 100%)` }}>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">Pronto para agendar seu atendimento?</h2>
            <p className="mt-4 text-white/85 text-base sm:text-lg max-w-xl mx-auto">
              Escolha o serviço, o profissional e o melhor horário em menos de um minuto.
            </p>
            <button onClick={onAgendar} className="mt-8 inline-flex items-center gap-2 bg-white text-[#0F172A] font-bold text-base sm:text-lg px-8 sm:px-10 py-4 hover:bg-white/90 hover:text-[#0F172A] active:scale-[0.97] transition" style={{ borderRadius: "var(--lp-btn-radius)" }}>
              Agendar agora <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- rodapé --------------------------------- */

function LandingFooter({ pro }: any) {
  const brand = pro.brand_color || "#0284C7";
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid gap-8 sm:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {pro.logo_url ? (
              <img src={pro.logo_url} alt="" loading="lazy" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span className="h-10 w-10 rounded-xl grid place-items-center text-white font-black" style={{ backgroundColor: brand }}>{pro.business_name.charAt(0).toUpperCase()}</span>
            )}
            <span className="font-bold tracking-tight">{pro.business_name}</span>
          </div>
          {pro.tagline && <p className="text-sm text-muted-foreground">{pro.tagline}</p>}
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Atendimento</p>
          {pro.opening_hours_display && <p className="whitespace-pre-line">{pro.opening_hours_display}</p>}
          {pro.phone && <p><a href={`tel:${onlyDigits(pro.phone)}`} className="hover:underline">{pro.phone}</a></p>}
          {pro.email && <p><a href={`mailto:${pro.email}`} className="hover:underline">{pro.email}</a></p>}
          {pro.address && <p>{pro.address}</p>}
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Legal</p>
          {pro.privacy_policy ? <details><summary className="cursor-pointer hover:underline">Política de Privacidade</summary><p className="mt-2 whitespace-pre-line text-xs leading-relaxed">{pro.privacy_policy}</p></details> : <p>Política de Privacidade</p>}
          {pro.terms ? <details><summary className="cursor-pointer hover:underline">Termos de Uso</summary><p className="mt-2 whitespace-pre-line text-xs leading-relaxed">{pro.terms}</p></details> : <p>Termos de Uso</p>}
          <p className="text-xs">Seus dados são tratados conforme a LGPD (Lei 13.709/2018).</p>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {pro.business_name}. Todos os direitos reservados. · Agendamento por{" "}
        <a href="/" className="font-bold hover:underline text-brand">Agendaí</a>
      </div>
    </footer>
  );
}

/* ------------------------------- flutuantes ------------------------------- */

function StickyCTA({ onAgendar, whats }: { onAgendar: () => void; whats: string | null }) {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
      <button onClick={onAgendar} className="btn-lp-primary flex-1 inline-flex items-center justify-center gap-2 text-sm">
        <CalendarCheck2 className="h-4 w-4" aria-hidden /> Agendar agora
      </button>
      {whats && (
        <a href={whats} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp"
          className="h-12 w-12 shrink-0 rounded-full grid place-items-center text-white shadow-lg" style={{ backgroundColor: "#25D366" }}>
          <MessageCircle className="h-5 w-5" aria-hidden />
        </a>
      )}
    </div>
  );
}

export function WhatsAppFloat({ phone }: { phone: string }) {
  const href = whatsappLink(phone);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp"
      className="hidden sm:grid fixed bottom-6 right-6 z-50 h-14 w-14 place-items-center rounded-full text-white shadow-xl hover:scale-105 active:scale-95 transition-transform"
      style={{ backgroundColor: "#25D366" }}>
      <MessageCircle className="h-6 w-6" aria-hidden />
    </a>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Voltar ao topo"
      className="fixed bottom-24 sm:bottom-24 right-6 z-50 h-11 w-11 rounded-full grid place-items-center card-elevated shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
