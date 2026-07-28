import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";
import { Calendar, LayoutDashboard, Briefcase, Clock, Ban, Settings, LogOut, Menu, Users } from "lucide-react";
import { useState } from "react";


const links: Array<{ to: string; label: string; icon: typeof Calendar; exact?: boolean }> = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/app/agendamentos", label: "Agendamentos", icon: Calendar },
  { to: "/app/servicos", label: "Serviços", icon: Briefcase },
  { to: "/app/funcionarios", label: "Funcionários", icon: Users },
  { to: "/app/horarios", label: "Horários", icon: Clock },
  { to: "/app/bloqueios", label: "Bloqueios", icon: Ban },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/entrar" });
  }, [loading, user, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/entrar" });
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="skeleton h-6 w-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-background border-b border-border flex items-center justify-between px-4 h-14">
        <Link to="/app" className="font-display text-xl text-primary">Agendaí</Link>
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${open ? "block" : "hidden"} lg:block fixed lg:sticky top-0 lg:top-0 inset-x-0 lg:inset-auto z-20 lg:h-screen w-full lg:w-64 bg-background lg:bg-sidebar border-r border-border`}
        >
          <div className="hidden lg:flex items-center h-16 px-6 border-b border-border">
            <Link to="/app" className="font-display text-2xl text-primary">Agendaí</Link>
          </div>
          <nav className="p-3 space-y-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to as string}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: l.exact }}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
            {title && <h1 className="text-3xl lg:text-4xl text-primary mb-6 animate-fade-in-up">{title}</h1>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
