/**
 * Cuentas DEMO de Escuela Visible. Sin datos personales reales:
 *  - emails en el TLD reservado `.example` (RFC 2606): no pueden pertenecer a nadie;
 *  - nombres que describen un rol, no a una persona.
 * La contraseña NO está aquí: viene de DEMO_ACCOUNT_PASSWORD (.env.local).
 */
import type { Enums } from "@/types/database";

export const DEMO_EMAIL_DOMAIN = "demo.escuelavisible.example";

export type DemoAccount = {
  key: "admin" | "el-mirador" | "la-cascada" | "los-robles" | "aliado";
  email: string;
  displayName: string;
  role: Enums<"user_role">;
  /** Slug de la escuela DEMO que representa (solo school_rep). */
  schoolSlug: string | null;
  orgType: Enums<"org_type"> | null;
  showPublicly: boolean;
};

const email = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "admin",
    email: email("admin"),
    displayName: "Administración Escuela Visible (DEMO)",
    role: "admin",
    schoolSlug: null,
    orgType: null,
    showPublicly: false,
  },
  {
    key: "el-mirador",
    email: email("el-mirador"),
    displayName: "Representante El Mirador (DEMO)",
    role: "school_rep",
    schoolSlug: "escuela-demo-el-mirador",
    orgType: null,
    showPublicly: true,
  },
  {
    key: "la-cascada",
    email: email("la-cascada"),
    displayName: "Representante La Cascada (DEMO)",
    role: "school_rep",
    schoolSlug: "escuela-demo-la-cascada",
    orgType: null,
    showPublicly: true,
  },
  {
    key: "los-robles",
    email: email("los-robles"),
    displayName: "Representante Los Robles (DEMO)",
    role: "school_rep",
    schoolSlug: "escuela-demo-los-robles",
    orgType: null,
    showPublicly: true,
  },
  {
    key: "aliado",
    email: email("aliado"),
    displayName: "Aliado DEMO",
    role: "supporter",
    schoolSlug: null,
    orgType: "persona",
    showPublicly: true,
  },
];
