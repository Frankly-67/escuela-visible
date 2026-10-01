import { requireActor } from "@/lib/auth/session";

/** Capa adicional: la página también exige el rol. */
export default async function AdminPanelLayout({ children }: LayoutProps<"/panel/admin">) {
  await requireActor(["admin"]);
  return children;
}
