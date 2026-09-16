export type ViewMode = "grid" | "list" | "calendar";

/** Visões padrão de catálogo: lista e grade. */
export const CATALOG_VIEWS: ViewMode[] = ["list", "grid"];

/** Visões completas, só para a agenda de agendamentos. */
export const APPOINTMENT_VIEWS: ViewMode[] = ["list", "grid", "calendar"];
