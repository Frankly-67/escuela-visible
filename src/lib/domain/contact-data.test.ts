import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTACT_DATA_MESSAGE, findContactData } from "./contact-data";
import { CONTACT_CASES } from "./contact-data.fixtures";

describe("findContactData", () => {
  for (const [text, expected] of CONTACT_CASES) {
    it(`${JSON.stringify(text)} → ${expected ?? "sin datos de contacto"}`, () => {
      assert.equal(findContactData(text), expected);
    });
  }

  it("mensajes en español para cada tipo", () => {
    assert.match(CONTACT_DATA_MESSAGE.email, /correos/);
    assert.match(CONTACT_DATA_MESSAGE.phone, /teléfono/);
  });
});
