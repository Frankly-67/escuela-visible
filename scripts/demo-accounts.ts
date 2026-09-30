/**
 * Crea (o alinea) las 5 cuentas DEMO en Supabase Auth + profiles.
 *
 *   npm run demo:accounts                 → vista previa: SOLO LECTURA
 *   npm run demo:accounts -- --confirm    → crea/alinea las cuentas
 *   npm run demo:accounts -- --check-login → además prueba el inicio de sesión
 *                                            de cada cuenta (crea sesiones)
 *
 * - Idempotente: busca cada email en Auth; si existe, NO lo recrea ni cambia
 *   su contraseña; solo alinea el perfil (rol, escuela, nombre).
 * - La contraseña viene de DEMO_ACCOUNT_PASSWORD y nunca se imprime.
 * - Usa la secret key (service_role): el rol y la escuela solo se pueden
 *   asignar desde aquí; el trigger de alta ignora cualquier rol enviado por
 *   el cliente y crea el perfil como supporter.
 */
import "./lib/load-env";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { getDemoAccountPassword } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Tables } from "@/types/database";

import { DEMO_ACCOUNTS, type DemoAccount } from "./lib/demo-accounts";

const confirm = process.argv.includes("--confirm");
const checkLogin = process.argv.includes("--check-login");

type Profile = Pick<Tables<"profiles">, "id" | "display_name" | "role" | "school_id" | "org_type" | "show_publicly">;

const db = createAdminClient();

async function listAllUsers() {
  const users: { id: string; email?: string; email_confirmed_at?: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No se pudieron listar usuarios: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

async function loadSchools() {
  const slugs = DEMO_ACCOUNTS.flatMap((a) => (a.schoolSlug ? [a.schoolSlug] : []));
  const { data, error } = await db.from("schools").select("id, slug, name, is_demo").in("slug", slugs);
  if (error) throw new Error(`No se pudieron leer las escuelas: ${error.message}`);
  const bySlug = new Map(data.map((s) => [s.slug, s]));
  for (const slug of slugs) {
    const school = bySlug.get(slug);
    if (!school) throw new Error(`Falta la escuela DEMO ${slug} (¿se cargó el seed?)`);
    if (!school.is_demo) throw new Error(`La escuela ${slug} no está marcada como DEMO: no se asocian cuentas DEMO a escuelas reales`);
  }
  return bySlug;
}

function desiredProfile(account: DemoAccount, schools: Awaited<ReturnType<typeof loadSchools>>) {
  return {
    display_name: account.displayName,
    role: account.role,
    school_id: account.schoolSlug ? schools.get(account.schoolSlug)!.id : null,
    org_type: account.orgType,
    show_publicly: account.showPublicly,
  };
}

function differences(current: Profile | undefined, desired: ReturnType<typeof desiredProfile>): string[] {
  if (!current) return ["perfil inexistente"];
  return (Object.keys(desired) as (keyof typeof desired)[]).filter((k) => current[k] !== desired[k]);
}

async function readProfiles(ids: string[]) {
  if (ids.length === 0) return new Map<string, Profile>();
  const { data, error } = await db
    .from("profiles")
    .select("id, display_name, role, school_id, org_type, show_publicly")
    .in("id", ids);
  if (error) throw new Error(`No se pudieron leer perfiles: ${error.message}`);
  return new Map(data.map((p) => [p.id, p]));
}

async function main() {
  // Contraseña: se valida, nunca se imprime (solo se informa si falta).
  let password: string | null = null;
  try {
    password = getDemoAccountPassword();
  } catch {
    password = null;
  }

  const schools = await loadSchools();
  const users = await listAllUsers();
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]));
  const profiles = await readProfiles(DEMO_ACCOUNTS.flatMap((a) => byEmail.get(a.email)?.id ?? []));

  console.log(`DEMO_ACCOUNT_PASSWORD: ${password ? "definida (no se muestra)" : "FALTA o tiene menos de 12 caracteres"}`);
  console.log(`Usuarios existentes en Auth: ${users.length}\n`);
  console.log("Plan:");
  for (const account of DEMO_ACCOUNTS) {
    const user = byEmail.get(account.email);
    const diff = user ? differences(profiles.get(user.id), desiredProfile(account, schools)) : [];
    const action = !user ? "CREAR" : diff.length ? `ALINEAR PERFIL (${diff.join(", ")})` : "SIN CAMBIOS";
    const school = account.schoolSlug ? schools.get(account.schoolSlug)!.name : "—";
    console.log(`  ${action.padEnd(16)} ${account.email.padEnd(38)} ${account.role.padEnd(11)} ${school}`);
  }

  if (!confirm) {
    console.log("\nVISTA PREVIA: no se escribió nada. Para ejecutar: npm run demo:accounts -- --confirm");
    return;
  }
  if (!password) throw new Error("Define DEMO_ACCOUNT_PASSWORD (mín. 12 caracteres) en .env.local antes de crear las cuentas.");

  // --- Escritura ---------------------------------------------------------------
  console.log("");
  for (const account of DEMO_ACCOUNTS) {
    let userId = byEmail.get(account.email)?.id;
    if (!userId) {
      const { data, error } = await db.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true, // sin correo de confirmación (dominio .example)
        user_metadata: { display_name: account.displayName },
      });
      if (error || !data.user) throw new Error(`No se pudo crear ${account.email}: ${error?.message ?? "sin usuario"}`);
      userId = data.user.id;
      console.log(`  ✓ creado      ${account.email}`);
    }

    const desired = desiredProfile(account, schools);
    const { data: updated, error } = await db.from("profiles").update(desired).eq("id", userId).select("id");
    if (error) throw new Error(`No se pudo alinear el perfil de ${account.email}: ${error.message}`);
    if (updated.length === 0) {
      // El trigger de alta no creó el perfil (no debería pasar): se crea aquí.
      const { error: insertError } = await db.from("profiles").insert({ id: userId, ...desired });
      if (insertError) throw new Error(`No se pudo crear el perfil de ${account.email}: ${insertError.message}`);
    }
    console.log(`  ✓ perfil      ${account.email} → ${account.role}`);
  }

  // --- Verificación (solo lectura) --------------------------------------------
  console.log("\nVerificación:");
  const after = await listAllUsers();
  const afterByEmail = new Map(after.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]));
  const afterProfiles = await readProfiles(DEMO_ACCOUNTS.flatMap((a) => afterByEmail.get(a.email)?.id ?? []));
  let ok = true;
  for (const account of DEMO_ACCOUNTS) {
    const user = afterByEmail.get(account.email);
    const diff = user ? differences(afterProfiles.get(user.id), desiredProfile(account, schools)) : ["no existe"];
    const confirmed = Boolean(user?.email_confirmed_at);
    const pass = diff.length === 0 && confirmed;
    ok &&= pass;
    console.log(`  ${pass ? "✓" : "✗"} ${account.email.padEnd(38)} ${account.role.padEnd(11)} email confirmado: ${confirmed ? "sí" : "no"}${diff.length ? ` | difiere: ${diff.join(", ")}` : ""}`);
  }
  const demoCount = after.filter((u) => u.email?.endsWith(`@${DEMO_ACCOUNTS[0].email.split("@")[1]}`)).length;
  console.log(`  cuentas DEMO en Auth: ${demoCount} (esperadas ${DEMO_ACCOUNTS.length}) | usuarios totales: ${after.length}`);
  ok &&= demoCount === DEMO_ACCOUNTS.length;

  if (checkLogin) {
    console.log("\nInicio de sesión (publishable key, como un navegador):");
    for (const account of DEMO_ACCOUNTS) {
      const client = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email: account.email, password });
      // Con la sesión del usuario, RLS solo le deja ver su propio perfil privado.
      const own = data.user ? await client.from("profiles").select("role").eq("id", data.user.id).single() : null;
      const pass = !error && own?.data?.role === account.role;
      ok &&= pass;
      console.log(`  ${pass ? "✓" : "✗"} ${account.email.padEnd(38)} ${error ? `error: ${error.message}` : `sesión OK, rol visible vía RLS: ${own?.data?.role}`}`);
      await client.auth.signOut();
    }
  }

  console.log(ok ? "\nCUENTAS DEMO OK" : "\nHAY DIFERENCIAS: revisar arriba");
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : "desconocido"}`);
  process.exitCode = 1;
});
