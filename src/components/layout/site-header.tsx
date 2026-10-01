import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/app/ingresar/actions";
import { getSessionActor } from "@/lib/auth/session";

async function currentActorSafe() {
  // Un fallo al leer la sesión no debe romper las páginas públicas.
  try {
    return await getSessionActor();
  } catch {
    return null;
  }
}

export async function SiteHeader() {
  const actor = await currentActorSafe();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 11 12 4l9 7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 10v9h14v-9" strokeLinejoin="round" />
              <path d="M10 19v-5h4v5" strokeLinejoin="round" />
            </svg>
          </span>
          Escuela Visible
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="lg" className="hidden sm:inline-flex">
            <Link href="/">Inicio</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className={actor ? "hidden sm:inline-flex" : undefined}>
            <Link href="/#escuelas">Escuelas</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/tablon">Tablón</Link>
          </Button>
          {actor ? (
            <>
              <Button asChild variant="outline" size="lg">
                <Link href="/panel">Panel</Link>
              </Button>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="lg">
                  Salir
                </Button>
              </form>
            </>
          ) : (
            <Button asChild variant="outline" size="lg">
              <Link href="/ingresar">Ingresar</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
