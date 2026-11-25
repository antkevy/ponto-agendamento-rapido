import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";

/** Usa a URL configurada em produção; em dev, a origem do próprio request. */
function baseUrl(request: Request): string {
  const configured = typeof process !== "undefined" ? process.env.APP_SITE_URL : undefined;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const siteUrl = baseUrl(request);
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/entrar", changefreq: "monthly", priority: "0.4" },
          { path: "/cadastrar", changefreq: "monthly", priority: "0.6" },
          { path: "/meus-agendamentos", changefreq: "monthly", priority: "0.5" },
        ];

        try {
          const { data } = await supabase.from(db.profissionais).select("slug");
          for (const row of (data ?? []) as { slug: string | null }[]) {
            if (row.slug)
              entries.push({
                path: `/p/${escapeXml(row.slug)}`,
                changefreq: "daily",
                priority: "0.8",
              });
          }
        } catch {
          // sitemap continua válido apenas com as rotas estáticas
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${siteUrl}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
