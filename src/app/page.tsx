import { SchoolsMap, type MapSchool } from "@/components/schools/schools-map";
import { Button } from "@/components/ui/button";
import { listSchools } from "@/lib/data/public";

const STEPS = [
  {
    title: "Escuela",
    text: "La escuela da a conocer lo que necesita, de forma agregada y sin datos personales de estudiantes.",
  },
  {
    title: "Necesidad",
    text: "La plataforma revisa y valida la necesidad antes de hacerla pública.",
  },
  {
    title: "Apoyo",
    text: "Personas y organizaciones se comprometen a ayudar e informan cuando realizan la entrega.",
  },
  {
    title: "Confirmación",
    text: "Una ayuda se considera cerrada cuando la escuela confirma que la recibió.",
  },
  {
    title: "Trazabilidad",
    text: "Cada paso queda en un historial. Las confirmaciones pueden registrarse en Hedera para permitir una verificación independiente del registro.",
  },
];

export default async function Home() {
  const schools = await listSchools();
  const mapSchools: MapSchool[] = schools.map((s) => ({
    slug: s.slug,
    name: s.name,
    municipality: s.municipality,
    department: s.department,
    vereda: s.vereda,
    latitude: s.latitude,
    longitude: s.longitude,
    isDemo: s.is_demo,
  }));

  return (
    <>
      <section className="relative overflow-hidden border-b bg-secondary/40">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 pt-16 pb-28 sm:px-6 sm:pt-20 sm:pb-36">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Escuelas rurales de Santander</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Escuela Visible</h1>
          <p className="max-w-2xl text-lg text-balance text-muted-foreground sm:text-xl">
            Conectamos comunidades con las necesidades de las escuelas rurales. Cada apoyo se cierra cuando la escuela
            confirma que lo recibió.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-base">
              <a href="#escuelas">Explorar escuelas</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
              <a href="#como-funciona">Cómo funciona</a>
            </Button>
          </div>
        </div>
        <Hills />
      </section>

      <section id="escuelas" className="scroll-mt-20 border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">Escuelas en el mapa</h2>
            <p className="text-muted-foreground">
              Selecciona una escuela para conocerla y ver sus necesidades publicadas.
            </p>
          </div>
          {mapSchools.length > 0 ? (
            <SchoolsMap schools={mapSchools} />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              Todavía no hay escuelas para mostrar.
            </p>
          )}
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">Cómo funciona</h2>
            <p className="text-muted-foreground">
              Una ayuda no se considera cerrada solo porque quien ayuda diga que la entregó: la escuela debe confirmar
              la recepción.
            </p>
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2 border-t-2 border-primary/30 pt-4">
                <span className="text-sm font-semibold text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

/** Colinas decorativas: guiño rural, sin imágenes externas. */
function Hills() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 160"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full sm:h-32"
    >
      <path d="M0 110 C 240 40, 480 40, 720 90 S 1200 150, 1440 70 V160 H0 Z" className="fill-primary/15" />
      <path d="M0 140 C 300 80, 560 120, 860 110 S 1260 70, 1440 120 V160 H0 Z" className="fill-primary/25" />
    </svg>
  );
}
