import type { Metadata } from "next";

import { requireActor } from "@/lib/auth/session";
import type { UserRole } from "@/lib/domain/permissions";

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false },
};

const ROLE_TITLE: Record<UserRole, string> = {
  school_rep: "Escuela",
  supporter: "Aliado",
  admin: "Escuela Visible / Administrador",
};

/**
 * Marco del panel. Exige sesión; la comprobación de rol se repite en cada
 * página (los layouts no se re-ejecutan al navegar entre páginas hermanas).
 */
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const actor = await requireActor();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-1 border-b pb-6">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Panel</p>
        <p className="font-heading text-2xl font-semibold">{ROLE_TITLE[actor.role]}</p>
      </div>
      {children}
    </div>
  );
}
