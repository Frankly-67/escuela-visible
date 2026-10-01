import { requireActor } from "@/lib/auth/session";

/** Capa adicional: la página también exige el rol. */
export default async function SchoolPanelLayout({ children }: LayoutProps<"/panel/escuela">) {
  await requireActor(["school_rep"]);
  return children;
}
