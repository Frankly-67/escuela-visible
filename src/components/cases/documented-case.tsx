import { CasePhoto } from "@/components/cases/case-photo";
import { RealCaseBadge } from "@/components/common/real-case-badge";
import {
  ABOUT_CASE_TEXT,
  DOCUMENTED_CASE_NOTE,
  DOCUMENTED_OUTSIDE_LABEL,
  type DocumentedCase,
} from "@/content/documented-cases";

const numberFormat = new Intl.NumberFormat("es-CO");

/** Encabezado de la página de una escuela con caso real documentado. */
export function DocumentedCaseHero({ documentedCase }: { documentedCase: DocumentedCase }) {
  const { school, hero } = documentedCase;
  return (
    <header className="grid gap-8 border-b pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:items-center">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <RealCaseBadge />
          <span className="inline-flex items-center rounded-full border border-earth/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
            {DOCUMENTED_OUTSIDE_LABEL}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{school.name}</h1>
        <p className="text-lg font-medium">
          {school.municipality}, {school.department}
        </p>
        <p className="max-w-2xl text-muted-foreground">{DOCUMENTED_CASE_NOTE}</p>
        <p className="text-xs text-muted-foreground">{school.locationNote}</p>
      </div>
      <figure className="flex flex-col gap-2">
        <CasePhoto
          photo={hero}
          preload
          sizes="(min-width: 1024px) 32rem, 100vw"
          className="aspect-[4/3] rounded-xl border"
        />
        <figcaption className="text-xs text-muted-foreground">{hero.caption}</figcaption>
      </figure>
    </header>
  );
}

/** Contenido del caso: introducción, secuencia, áreas, galería, cifras y transparencia. */
export function DocumentedCaseSections({ documentedCase }: { documentedCase: DocumentedCase }) {
  const { intro, steps, areas, photos, metrics, source } = documentedCase;
  return (
    <>
      <section aria-labelledby="caso-intro" className="flex max-w-3xl flex-col gap-3">
        <h2 id="caso-intro" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {intro.title}
        </h2>
        <p className="text-muted-foreground">{intro.text}</p>
      </section>

      <section aria-labelledby="caso-secuencia" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="caso-secuencia" className="text-2xl font-semibold tracking-tight">
            Cómo se documentó la intervención
          </h2>
          <p className="text-sm text-muted-foreground">
            Resumen del proceso documentado. No corresponde al flujo de necesidades de Escuela Visible ni a registros
            publicados en Hedera.
          </p>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2 border-t-2 border-earth/40 pt-4">
              <span className="text-sm font-semibold text-earth tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="caso-areas" className="flex flex-col gap-5">
        <h2 id="caso-areas" className="text-2xl font-semibold tracking-tight">
          Áreas intervenidas
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li key={area.title} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
              <h3 className="font-semibold">{area.title}</h3>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {area.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="caso-galeria" className="flex flex-col gap-5">
        <h2 id="caso-galeria" className="text-2xl font-semibold tracking-tight">
          Galería
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.file}>
              <figure className="flex flex-col gap-2">
                <CasePhoto
                  photo={photo}
                  sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw"
                  className="aspect-[4/3] rounded-xl border"
                />
                <figcaption className="text-sm text-muted-foreground">{photo.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="caso-cambios" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="caso-cambios" className="text-2xl font-semibold tracking-tight">
            ¿Qué cambió?
          </h2>
          <p className="text-sm text-muted-foreground">Algunas de las cifras registradas en el acta de intervención.</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col-reverse gap-1 rounded-xl border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{metric.label}</dt>
              <dd className="text-3xl font-semibold text-earth tabular-nums">{numberFormat.format(metric.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="caso-sobre" className="flex flex-col gap-3 rounded-xl border bg-secondary/40 p-6">
        <h2 id="caso-sobre" className="text-2xl font-semibold tracking-tight">
          Sobre este caso
        </h2>
        <p className="max-w-3xl">{ABOUT_CASE_TEXT}</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Fuente documental:</span> {source}
        </p>
      </section>
    </>
  );
}
