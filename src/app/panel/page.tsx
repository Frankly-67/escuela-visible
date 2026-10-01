import { redirect } from "next/navigation";

import { PANEL_PATH, requireActor } from "@/lib/auth/session";

/** Lleva a cada usuario al panel de su rol (rol leído de la sesión y de profiles). */
export default async function PanelPage() {
  const actor = await requireActor();
  redirect(PANEL_PATH[actor.role]);
}
