import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ABOUT_CASE_TEXT,
  DOCUMENTED_CASE_NOTE,
  DOCUMENTED_CASES,
  DOCUMENTED_OUTSIDE_LABEL,
  getDocumentedCase,
} from "./documented-cases";

const PUBLIC_DIR = join(process.cwd(), "public");
const CASES_DIR = join(PUBLIC_DIR, "casos");
const ALL_TEXT = JSON.stringify([DOCUMENTED_CASES, DOCUMENTED_OUTSIDE_LABEL, DOCUMENTED_CASE_NOTE, ABOUT_CASE_TEXT]);

describe("caso real documentado: El Hoyo – Sede C Santillana", () => {
  const c = getDocumentedCase("ie-rural-el-hoyo-sede-c-santillana");

  it("existe y tiene el perfil aprobado", () => {
    assert.ok(c);
    assert.equal(c.school.name, "I.E. Rural El Hoyo – Sede C Santillana");
    assert.equal(c.school.municipality, "Mogotes");
    assert.equal(c.school.department, "Santander");
    assert.equal(c.documentedOn, "2026-09-08");
    assert.equal(c.source, "Acta de intervención integral a escuela rural, 8 de septiembre de 2026.");
  });

  it("solo publica las cifras del acta", () => {
    assert.deepEqual(
      c!.metrics.map((m) => [m.value, m.label]),
      [
        [15, "pupitres infantiles"],
        [8, "computadores"],
        [2, "tableros acrílicos"],
        [2, "unidades sanitarias nuevas"],
        [19, "bicicletas"],
        [2, "columpios"],
      ],
    );
  });

  it("secuencia de 4 etapas y 6 áreas", () => {
    assert.deepEqual(
      c!.steps.map((s) => s.title),
      ["Necesidad identificada", "Intervención", "Evidencia", "Entrega documentada"],
    );
    assert.deepEqual(
      c!.areas.map((a) => a.title),
      [
        "Infraestructura",
        "Ambientes de aprendizaje",
        "Deporte y recreación",
        "Servicios sanitarios",
        "Agua e higiene",
        "Dotación tecnológica",
      ],
    );
  });

  it("galería con las 6 fotografías previstas", () => {
    assert.deepEqual(c!.photos.map((p) => p.file.split("/").pop()).sort(), [
      "biblioteca.webp",
      "fachada_antes.webp",
      "fachada_despues.webp",
      "lavamanos.webp",
      "sala_computadores.webp",
      "zona_lavado.webp",
    ]);
    assert.ok(c!.photos.some((p) => p.file === c!.hero.file));
  });
});

describe("casos documentados: transparencia y privacidad", () => {
  it("los slugs son únicos y no son DEMO", () => {
    const slugs = DOCUMENTED_CASES.map((c) => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs) assert.doesNotMatch(slug, /demo/i);
  });

  it("textos de transparencia aprobados", () => {
    assert.equal(DOCUMENTED_OUTSIDE_LABEL, "Documentado fuera de Escuela Visible");
    assert.match(DOCUMENTED_CASE_NOTE, /No está registrado en Hedera\.$/);
    assert.match(ABOUT_CASE_TEXT, /No está registrado en Hedera\./);
    assert.match(
      ABOUT_CASE_TEXT,
      /Un registro de Hedera no demuestra por sí solo que una obra o entrega física haya ocurrido\./,
    );
  });

  it("no afirma que Hedera verifique la intervención", () => {
    assert.doesNotMatch(
      ALL_TEXT,
      /verificad|Hedera (confirma|demuestra|prueba|verifica)|SCHOOL_CONFIRMED|NEED_CREATED/i,
    );
  });

  it("sin datos personales: correos, teléfonos, identificaciones, firmas, tratamientos", () => {
    assert.doesNotMatch(ALL_TEXT, /[\w.+-]+@[\w-]+\.\w/, "correo");
    assert.doesNotMatch(ALL_TEXT, /\d{3}[ .-]?\d{3}[ .-]?\d{4}|\d{7,}|\d{1,3}(\.\d{3}){2,}/, "teléfono o número de identificación");
    assert.doesNotMatch(ALL_TEXT, /\b(C\.?C\.?|T\.?I\.?|NIT)\b|c[ée]dula|firma\b|firmad/i, "identificación o firma");
    assert.doesNotMatch(ALL_TEXT, /\b(Sr|Sra|Srta|Lic|Ing|Dr|Dra|Prof)\.\s/, "tratamiento de una persona");
    assert.doesNotMatch(ALL_TEXT, /\b(niñ[oa]|estudiante|alumn[oa])\b/i, "referencia individual a menores");
  });

  it("ubicación aproximada (como máximo 2 decimales) y en Santander", () => {
    for (const { school } of DOCUMENTED_CASES) {
      for (const v of [school.latitude, school.longitude]) assert.equal(Math.round(v * 100) / 100, v);
      assert.ok(school.latitude > 5.7 && school.latitude < 8.2, "latitud fuera de Santander");
      assert.ok(school.longitude > -74.6 && school.longitude < -72.4, "longitud fuera de Santander");
      assert.match(school.locationNote, /aproximada/i);
    }
  });
});

/**
 * Fotografías: solo WebP sin metadatos EXIF/XMP (pueden incluir GPS, cámara, autor).
 * Mientras public/casos/ no exista, la prueba se omite y la página muestra un marcador.
 */
describe("fotografías de casos documentados", () => {
  it("public/casos solo contiene las fotografías declaradas", (t) => {
    if (!existsSync(CASES_DIR)) return t.skip("public/casos/ aún no existe");
    const declared = new Set(DOCUMENTED_CASES.flatMap((c) => c.photos.map((p) => join(PUBLIC_DIR, p.file))));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    for (const file of walk(CASES_DIR))
      assert.ok(declared.has(file), `archivo no declarado (¿acta o documento?): ${file}`);
  });

  for (const c of DOCUMENTED_CASES) {
    for (const p of c.photos) {
      it(`${p.file}: WebP válido y sin EXIF/XMP`, (t) => {
        const path = join(PUBLIC_DIR, p.file);
        if (!existsSync(path)) return t.skip("fotografía aún no aportada");
        assert.deepEqual(
          webpChunks(readFileSync(path)).filter((id) => id === "EXIF" || id === "XMP "),
          [],
        );
      });
    }
  }
});

/** Identificadores de los chunks RIFF de un WebP; falla si el archivo no es WebP o declara metadatos. */
function webpChunks(buf: Buffer): string[] {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF", "no es RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP", "no es WebP");
  const ids: string[] = [];
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "VP8X") assert.equal(buf[off + 8] & 0x0c, 0, "VP8X declara EXIF/XMP");
    ids.push(id);
    off += 8 + size + (size % 2);
  }
  return ids;
}
