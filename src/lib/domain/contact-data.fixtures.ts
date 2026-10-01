/**
 * Casos de detección de datos de contacto, compartidos por la prueba unitaria
 * (contact-data.test.ts) y la prueba PGlite (scripts/regression/pglite/board.mts),
 * que comprueba que public.board_text_has_contact da el mismo resultado.
 */
export const CONTACT_CASES: [string, "email" | "phone" | null][] = [
  ["Bazar el sábado en la escuela", null],
  ["Sancocho comunitario: 30 platos, 2 ollas grandes", null],
  ["Año 2026, 120 m2 pintados, grado 5", null],
  ["Fecha 2026-10-15 y 15/10/2026, también 15-10-26", null],
  ["De 10:30 a 12:30", null],
  ["Llamar al 300 123 4567", "phone"],
  ["Whatsapp 3001234567", "phone"],
  ["+57 (601) 234-5678", "phone"],
  ["Fijo 601 2345678", "phone"],
  ["Tel. 312.456.7890", "phone"],
  ["Cédula 1098765432", "phone"],
  ["Escribir a rectoria@escuela.edu.co", "email"],
  ["CONTACTO@EJEMPLO.COM", "email"],
];
