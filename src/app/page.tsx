import { connection } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type SchoolSummary = Pick<Tables<"schools">, "id" | "name" | "municipality" | "is_demo">;

type SchoolsResult =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "ok"; schools: SchoolSummary[] };

async function loadSchools(): Promise<SchoolsResult> {
  // Siempre en tiempo de petición: los datos cambian y no deben quedar congelados en el build.
  await connection();
  if (!isSupabaseConfigured()) return { status: "not_configured" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, municipality, is_demo")
    .order("name");

  if (error) return { status: "error", message: error.message };
  return { status: "ok", schools: data };
}

export default async function Home() {
  const result = await loadSchools();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-4">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Escuela Visible
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Las necesidades de nuestras escuelas rurales no deberían ser invisibles.
        </h1>
        <p className="text-lg text-muted-foreground">
          Escuela → necesidad → ayuda → confirmación → historial verificable.
        </p>
      </header>

      <section aria-labelledby="schools-heading" className="flex flex-col gap-4">
        <h2 id="schools-heading" className="text-xl font-semibold">
          Escuelas
        </h2>

        {result.status === "not_configured" && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Supabase aún no está configurado. Completa <code>.env.local</code> a partir de{" "}
            <code>.env.example</code>.
          </p>
        )}

        {result.status === "error" && (
          <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            No se pudieron cargar las escuelas: {result.message}
          </p>
        )}

        {result.status === "ok" && result.schools.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay escuelas registradas.</p>
        )}

        {result.status === "ok" && result.schools.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {result.schools.map((school) => (
              <li key={school.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{school.name}</p>
                  <p className="text-sm text-muted-foreground">{school.municipality}, Santander</p>
                </div>
                {school.is_demo && (
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    DEMO · ficticia
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
