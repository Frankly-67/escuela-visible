import { requireActor } from "@/lib/auth/session";

/** Capa adicional: la página también exige el rol. */
export default async function SupporterPanelLayout({ children }: LayoutProps<"/panel/aliado">) {
  await requireActor(["supporter"]);
  return children;
}
