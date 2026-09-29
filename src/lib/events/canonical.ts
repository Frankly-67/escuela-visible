/**
 * Serialización JSON canónica y determinista.
 *
 * Reglas (compatibles con RFC 8785 / JCS para los tipos que usamos):
 * - claves de objeto ordenadas por unidades de código UTF-16 (orden de `sort()`);
 * - sin espacios;
 * - strings y números con la serialización estándar de JSON;
 * - solo se aceptan valores JSON puros: null, boolean, número finito, string,
 *   arrays y objetos planos. Cualquier otra cosa lanza un error en lugar de
 *   perderse en silencio (p. ej. `undefined`, Date, NaN).
 */

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const MAX_DEPTH = 32;

export class CanonicalJsonError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} (en ${path})`);
    this.name = "CanonicalJsonError";
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, "$", 0);
}

function serialize(value: unknown, path: string, depth: number): string {
  if (depth > MAX_DEPTH) throw new CanonicalJsonError("Profundidad máxima excedida", path);

  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalJsonError("Número no finito", path);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new CanonicalJsonError(`Tipo no permitido: ${typeof value}`, path);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialize(item, `${path}[${i}]`, depth + 1)).join(",")}]`;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicalJsonError("Solo se permiten objetos planos", path);
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      const item = (value as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${serialize(item, `${path}.${key}`, depth + 1)}`;
    });

  return `{${entries.join(",")}}`;
}
