/**
 * Protección de privacidad del tablón: detecta correos y números de teléfono
 * en un texto. Misma regla que public.board_text_has_contact (migración
 * 20261001000600): aquí da mensajes claros en la interfaz; la base de datos
 * es la autoridad final.
 *
 * - Correo: algo@dominio.tld.
 * - Teléfono: 7 o más dígitos seguidos, admitiendo un separador (espacio,
 *   punto, guion o paréntesis) entre dígitos. Detecta también números de
 *   identificación y cifras muy largas.
 * - Antes se descartan las fechas (2026-10-15, 15/10/2026, 15-10-26).
 */

export type ContactData = "email" | "phone";

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const DATES = /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g;
const PHONE = /\d(?:[\s.()-]?\d){6,}/;

export function findContactData(text: string): ContactData | null {
  if (EMAIL.test(text)) return "email";
  if (PHONE.test(text.replace(DATES, " "))) return "phone";
  return null;
}

export const CONTACT_DATA_MESSAGE: Record<ContactData, string> = {
  email: "No incluyas correos electrónicos en la publicación.",
  phone: "No incluyas números de teléfono ni otros números largos (por ejemplo, de identificación) en la publicación.",
};
