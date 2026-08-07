import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";

function isAuthError(error: unknown): boolean {
  const e = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(e.status ?? 0);
  if (status === 401) return true;
  if (String(e.code ?? "") === "401") return true;
  const message = String(e.message ?? "").toLowerCase();
  return message.includes("jwt expired") || message.includes("invalid jwt");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isAuthError(error)) {
          void supabase.auth.signOut();
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isAuthError(error)) return false;
          return failureCount < 3;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
