import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/app/agendamentos" });
  },
  component: () => null,
});
