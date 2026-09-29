import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { canonicalize, CanonicalJsonError } from "./canonical";
import { sha256Hex } from "./hash";

describe("canonicalize", () => {
  it("ordena las claves sin importar el orden de inserción", () => {
    const a = canonicalize({ b: 1, a: 2, c: { z: true, y: null } });
    const b = canonicalize({ c: { y: null, z: true }, a: 2, b: 1 });
    assert.equal(a, '{"a":2,"b":1,"c":{"y":null,"z":true}}');
    assert.equal(a, b);
  });

  it("no agrega espacios (solo conserva los que están dentro de strings)", () => {
    assert.equal(canonicalize({ a: [1, 2, { b: "x y" }] }), '{"a":[1,2,{"b":"x y"}]}');
    assert.equal(canonicalize({ a: 1, b: [true, null] }), '{"a":1,"b":[true,null]}');
  });

  it("conserva el orden de los arrays", () => {
    assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  });

  it("serializa strings con escapes JSON estándar y UTF-8 sin escapar", () => {
    assert.equal(canonicalize({ s: 'a"b\\c\n' }), '{"s":"a\\"b\\\\c\\n"}');
    assert.equal(canonicalize({ s: "Charalá ñ" }), '{"s":"Charalá ñ"}');
  });

  it("es determinista: misma entrada, mismo hash", () => {
    const value = { x: 1, y: ["a", "b"], z: { k: false } };
    assert.equal(sha256Hex(canonicalize(value)), sha256Hex(canonicalize(structuredClone(value))));
  });

  it("rechaza valores que no son JSON puro en lugar de perderlos", () => {
    const invalid: [string, unknown][] = [
      ["undefined", { a: undefined }],
      ["NaN", { a: Number.NaN }],
      ["Infinity", { a: Number.POSITIVE_INFINITY }],
      ["Date", { a: new Date(0) }],
      ["bigint", { a: BigInt(1) }],
      ["función", { a: () => 1 }],
      ["Map", { a: new Map() }],
    ];
    for (const [label, value] of invalid) {
      assert.throws(() => canonicalize(value), CanonicalJsonError, label);
    }
  });

  it("rechaza estructuras demasiado profundas", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = { d: deep };
    assert.throws(() => canonicalize(deep), CanonicalJsonError);
  });
});

describe("sha256Hex", () => {
  it("coincide con el vector de prueba estándar (FIPS 180-2, 'abc')", () => {
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("codifica el texto en UTF-8 antes de calcular el hash", () => {
    // "á" en UTF-8 son los bytes c3 a1; en latin1 sería el byte e1.
    const utf8 = createHash("sha256").update(Buffer.from([0xc3, 0xa1])).digest("hex");
    const latin1 = createHash("sha256").update(Buffer.from([0xe1])).digest("hex");
    assert.equal(sha256Hex("á"), utf8);
    assert.notEqual(sha256Hex("á"), latin1);
  });

  it("devuelve 64 caracteres hex en minúsculas", () => {
    assert.match(sha256Hex("escuela visible"), /^[0-9a-f]{64}$/);
  });
});
