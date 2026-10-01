/**
 * Casos reales DOCUMENTADOS fuera de Escuela Visible.
 *
 * - No ocurrieron dentro del flujo de la plataforma: no tienen necesidades,
 *   compromisos ni confirmaciones en la base de datos, ni eventos en Hedera.
 * - El contenido sale de documentación institucional revisada y solo incluye
 *   datos institucionales y agregados: nunca nombres de personas, números de
 *   identificación, firmas, teléfonos, correos ni información de menores.
 * - Las fotografías (public/casos/<slug>/) son de infraestructura y dotación,
 *   sin personas identificables y sin metadatos (EXIF/GPS).
 * - La ubicación es aproximada (cabecera municipal), no la de la sede.
 *
 * Contenido revisado en Git: cualquier cambio pasa por revisión y por
 * src/content/documented-cases.test.ts (privacidad, cifras, fotografías).
 */

export type CasePhoto = {
  /** Archivo en public/casos/<slug>/ (WebP sanitizado). */
  file: string;
  alt: string;
  caption: string;
};

export type DocumentedCase = {
  slug: string;
  school: {
    name: string;
    municipality: string;
    department: string;
    /** Ubicación APROXIMADA (cabecera municipal, 2 decimales ≈ 1 km). */
    latitude: number;
    longitude: number;
    locationNote: string;
  };
  /** Fecha del acta (ISO). */
  documentedOn: string;
  source: string;
  summary: string;
  hero: CasePhoto;
  intro: { title: string; text: string };
  steps: { title: string; text: string }[];
  areas: { title: string; items: string[] }[];
  photos: CasePhoto[];
  metrics: { value: number; label: string }[];
};

// Textos aprobados (no modificar sin aprobación).
export const DOCUMENTED_OUTSIDE_LABEL = "Documentado fuera de Escuela Visible";
export const DOCUMENTED_CASE_NOTE =
  "Este caso se documenta mediante información institucional y fotografías aportadas para este proyecto. No está registrado en Hedera.";
export const ABOUT_CASE_TEXT =
  "Este caso corresponde a una intervención documentada fuera de Escuela Visible mediante información institucional y fotografías aportadas para este proyecto. No está registrado en Hedera. Los registros que aparecen como publicados en Hedera corresponden únicamente a eventos que ocurrieron dentro del flujo de Escuela Visible. Un registro de Hedera no demuestra por sí solo que una obra o entrega física haya ocurrido.";

const SLUG = "ie-rural-el-hoyo-sede-c-santillana";

const photo = (file: string, alt: string, caption: string): CasePhoto => ({
  file: `/casos/el-hoyo-santillana/${file}`,
  alt,
  caption,
});

const FACHADA_DESPUES = photo(
  "fachada_despues.webp",
  "Fachada de la sede después de la intervención",
  "Fachada después de la intervención",
);

export const DOCUMENTED_CASES: readonly DocumentedCase[] = [
  {
    slug: SLUG,
    school: {
      name: "I.E. Rural El Hoyo – Sede C Santillana",
      municipality: "Mogotes",
      department: "Santander",
      latitude: 6.48,
      longitude: -72.97,
      locationNote:
        "Ubicación aproximada: cabecera municipal de Mogotes (no corresponde a la ubicación exacta de la sede).",
    },
    documentedOn: "2026-09-08",
    source: "Acta de intervención integral a escuela rural, 8 de septiembre de 2026.",
    summary: "Intervención integral de mejoramiento, adecuación y dotación.",
    hero: FACHADA_DESPUES,
    intro: {
      title: "Una intervención para transformar los espacios de aprendizaje",
      text: "Esta sede educativa rural fue objeto de una intervención integral de mejoramiento, adecuación y dotación. El proceso está documentado mediante un acta institucional de intervención con fecha 8 de septiembre de 2026.",
    },
    steps: [
      {
        title: "Necesidad identificada",
        text: "La sede necesitaba mejorar, adecuar y dotar sus espacios de aprendizaje, recreación y servicios.",
      },
      {
        title: "Intervención",
        text: "Se intervinieron la infraestructura, los ambientes de aprendizaje, los espacios deportivos, los servicios sanitarios, el agua e higiene y la dotación tecnológica.",
      },
      {
        title: "Evidencia",
        text: "Fotografías de la sede aportadas para este proyecto, revisadas para no mostrar personas ni datos personales.",
      },
      {
        title: "Entrega documentada",
        text: "La intervención consta en un acta institucional con fecha 8 de septiembre de 2026.",
      },
    ],
    areas: [
      { title: "Infraestructura", items: ["Fachada", "Cerramiento"] },
      {
        title: "Ambientes de aprendizaje",
        items: ["Aula de clases", "Aula de lectura / biblioteca", "Pupitres", "Tableros"],
      },
      { title: "Deporte y recreación", items: ["Cancha deportiva", "Bicicletas", "Columpios"] },
      { title: "Servicios sanitarios", items: ["Baterías sanitarias"] },
      { title: "Agua e higiene", items: ["Área de lavadero y lavamanos", "Tanque de almacenamiento de agua"] },
      { title: "Dotación tecnológica", items: ["Computadores"] },
    ],
    photos: [
      photo("fachada_antes.webp", "Fachada de la sede antes de la intervención", "Fachada antes de la intervención"),
      FACHADA_DESPUES,
      photo("sala_computadores.webp", "Sala de computadores de la sede", "Sala de computadores"),
      photo("biblioteca.webp", "Aula de lectura y biblioteca de la sede", "Aula de lectura / biblioteca"),
      photo("lavamanos.webp", "Lavamanos de la sede", "Lavamanos"),
      photo("zona_lavado.webp", "Zona de lavado de la sede", "Zona de lavado"),
    ],
    // Cifras respaldadas por el acta. No añadir otras sin fuente.
    metrics: [
      { value: 15, label: "pupitres infantiles" },
      { value: 8, label: "computadores" },
      { value: 2, label: "tableros acrílicos" },
      { value: 2, label: "unidades sanitarias nuevas" },
      { value: 19, label: "bicicletas" },
      { value: 2, label: "columpios" },
    ],
  },
];

export function getDocumentedCase(slug: string): DocumentedCase | null {
  return DOCUMENTED_CASES.find((c) => c.slug === slug) ?? null;
}
