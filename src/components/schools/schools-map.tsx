"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { DemoBadge } from "@/components/common/demo-badge";
import { RealCaseBadge } from "@/components/common/real-case-badge";
import { Button } from "@/components/ui/button";

export type MapSchool = {
  slug: string;
  name: string;
  municipality: string;
  department: string;
  vereda: string | null;
  latitude: number;
  longitude: number;
  isDemo: boolean;
  /** Caso real documentado fuera de la plataforma (nunca DEMO). */
  documented: boolean;
};

// Estilo vectorial de OpenFreeMap: sin API key; la atribución
// (OpenFreeMap, OpenMapTiles, OpenStreetMap) la muestra MapLibre.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Worker servido desde public/ (ver scripts/copy-maplibre-worker.mjs).
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

// DEMO: círculo verde con una casa. Caso real documentado: cuadrado tierra con una marca de verificación
// del documento (forma, color e icono distintos: no depende solo del color).
const MARKER_BASE =
  "grid size-9 cursor-pointer place-items-center border-2 border-white shadow-md transition-transform hover:scale-110 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-foreground data-[selected=true]:scale-125 data-[selected=true]:ring-4 data-[selected=true]:ring-foreground/35";
const DEMO_MARKER_CLASS = `${MARKER_BASE} rounded-full bg-primary text-primary-foreground`;
const REAL_MARKER_CLASS = `${MARKER_BASE} rounded-lg bg-earth text-earth-foreground`;

const DEMO_MARKER_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9h14v-9" stroke-linejoin="round"/></svg>';
const REAL_MARKER_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" stroke-linejoin="round"/><path d="m9 13 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const kindLabel = (school: MapSchool) =>
  school.documented ? "caso real documentado" : school.isDemo ? "escuela DEMO ficticia" : null;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SchoolsMap({ schools }: { schools: MapSchool[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, HTMLButtonElement>());
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  // Crear el mapa una vez (solo en el navegador).
  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || schools.length === 0) return;
        maplibregl.setWorkerUrl(WORKER_URL);

        const bounds = new maplibregl.LngLatBounds();
        for (const s of schools) bounds.extend([s.longitude, s.latitude]);

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          bounds,
          fitBoundsOptions: { padding: 80, maxZoom: 10 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (e) => {
          // Un fallo de teselas no debe romper la página: la lista sigue disponible.
          if (!map.loaded()) console.warn("Mapa:", e.error?.message);
        });
        mapRef.current = map;

        for (const school of schools) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = school.documented ? REAL_MARKER_CLASS : DEMO_MARKER_CLASS;
          el.innerHTML = school.documented ? REAL_MARKER_ICON : DEMO_MARKER_ICON;
          const kind = kindLabel(school);
          el.setAttribute("aria-label", `${school.name}, ${school.municipality}${kind ? ` (${kind})` : ""}`);
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            setSelectedSlug(school.slug);
          });
          new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([school.longitude, school.latitude])
            .addTo(map);
          markers.set(school.slug, el);
        }
      })
      .catch(() => setMapFailed(true));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [schools]);

  // Resaltar el marcador seleccionado y centrar el mapa en él.
  useEffect(() => {
    for (const [slug, el] of markersRef.current) el.setAttribute("data-selected", String(slug === selectedSlug));
    const school = schools.find((s) => s.slug === selectedSlug);
    if (school && mapRef.current) {
      mapRef.current.easeTo({
        center: [school.longitude, school.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 10),
        duration: prefersReducedMotion() ? 0 : 600,
      });
    }
  }, [selectedSlug, schools]);

  const selected = schools.find((s) => s.slug === selectedSlug) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        <div
          ref={containerRef}
          className="h-[360px] w-full sm:h-[440px] lg:h-[520px]"
          role="region"
          aria-label="Mapa de escuelas en Santander"
        />
        {mapFailed && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
            No se pudo cargar el mapa. Puedes explorar las escuelas desde la lista.
          </p>
        )}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 hidden sm:block sm:max-w-sm">
            <SelectedSchoolCard school={selected} onClose={() => setSelectedSlug(null)} />
          </div>
        )}
      </div>

      <aside aria-label="Lista de escuelas" className="flex flex-col gap-3">
        {selected && (
          <div className="sm:hidden">
            <SelectedSchoolCard school={selected} onClose={() => setSelectedSlug(null)} />
          </div>
        )}
        <h3 className="font-sans text-sm font-medium text-muted-foreground">
          {schools.length} {schools.length === 1 ? "escuela" : "escuelas"} en el mapa
        </h3>
        <ul className="flex flex-col gap-2">
          {schools.map((school) => {
            const isSelected = school.slug === selectedSlug;
            return (
              <li key={school.slug}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSlug(school.slug)}
                  className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 aria-pressed:border-primary aria-pressed:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="block font-medium">{school.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {school.municipality}, {school.department}
                  </span>
                  <span className="mt-1.5 block">
                    {school.documented ? <RealCaseBadge /> : school.isDemo ? <DemoBadge /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <MapLegend />
        <p className="text-xs text-muted-foreground">
          Ubicaciones aproximadas. Las escuelas DEMO y sus veredas son ficticias. Los casos reales documentados se
          ubican de forma aproximada en su municipio.
        </p>
      </aside>
    </div>
  );
}

function SelectedSchoolCard({ school, onClose }: { school: MapSchool; onClose: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-lg" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg leading-snug font-semibold">{school.name}</p>
          <p className="text-sm text-muted-foreground">
            {school.municipality}, {school.department}
          </p>
          {school.vereda && <p className="text-sm text-muted-foreground">{school.vereda}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {school.documented ? <RealCaseBadge /> : school.isDemo ? <DemoBadge /> : <span />}
        <Button asChild size="lg">
          <Link href={`/escuelas/${school.slug}`}>Ver escuela</Link>
        </Button>
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <ul aria-label="Leyenda del mapa" className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-3.5 rounded-full border-2 border-white bg-primary shadow-sm" />
        Escuela DEMO (ficticia)
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-3.5 rounded-sm border-2 border-white bg-earth shadow-sm" />
        Caso real documentado fuera de Escuela Visible
      </li>
    </ul>
  );
}
