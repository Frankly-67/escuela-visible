import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COMMITMENT_STATUS_LABEL } from "./labels";
import {
  countNeedsByStatus,
  countPublication,
  groupBy,
  parseNeedStatusFilter,
  PENDING_DELIVERY_TEXT,
  selectSchoolNeedEvents,
  toActivityDTO,
  toAdminNeedDTO,
  toAdminNeedReviewDTO,
  toPanelEventDTO,
  toPanelSchoolDTO,
  toPendingDeliveryDTO,
  toSchoolNeedDTO,
  toSupporterCommitmentDTO,
} from "./panel";

// Ids ficticios. Las filas traen a propósito columnas sensibles que NUNCA
// deben aparecer en un DTO.
const PERSON = "aaaaaaaa-0000-4000-8000-000000000001";
const SCHOOL_A = "00000000-0000-4000-a000-00000000000a";
const SCHOOL_B = "00000000-0000-4000-a000-00000000000b";
const NEED = "bbbbbbbb-0000-4000-8000-000000000001";
const COMMITMENT = "cccccccc-0000-4000-8000-000000000001";

const SENSITIVE = {
  supporter_id: PERSON,
  confirmed_by: PERSON,
  created_by: PERSON,
  validated_by: PERSON,
  note: "nota privada",
  delivery_note: "nota de entrega privada",
  delivery_evidence_path: "evidence/privada.jpg",
  submission_error: "error interno",
  attempts: 3,
  email: "persona@example.com",
  payload: { secreto: true },
};
const SENSITIVE_KEYS = Object.keys(SENSITIVE);

const needRow = {
  ...SENSITIVE,
  id: NEED,
  school_id: SCHOOL_A,
  kind: "need" as const,
  title: "Kits escolares (DEMO)",
  description: "Kits para 20 estudiantes",
  category: "materiales" as const,
  priority: "media" as const,
  goal_quantity: 20,
  goal_unit: "kits",
  event_date: null,
  status: "published" as const,
  validated_at: "2026-10-01T02:10:00.000Z",
  completed_at: null,
  created_at: "2026-10-01T02:00:00.000Z",
  updated_at: "2026-10-01T02:10:00.000Z",
};
const schoolRow = {
  ...SENSITIVE,
  id: SCHOOL_A,
  name: "Escuela DEMO El Mirador",
  slug: "escuela-demo-el-mirador",
  municipality: "San Gil",
  department: "Santander",
  vereda: "El Mirador",
  is_demo: true,
  latitude: 6.5,
  longitude: -73.1,
};
const commitmentRow = {
  ...SENSITIVE,
  id: COMMITMENT,
  need_id: NEED,
  quantity: 5,
  status: "delivery_reported" as const,
  created_at: "2026-10-01T02:20:00.000Z",
  delivery_reported_at: "2026-10-01T02:25:00.000Z",
  confirmed_at: null,
};
const progressRow = { ...SENSITIVE, need_id: NEED, goal_quantity: 20, committed_quantity: 5, confirmed_quantity: 0, active_commitments: 1 };
const eventRow = (n: number, status: "pending" | "submitted" | "failed" = "submitted") => ({
  ...SENSITIVE,
  id: `e0000000-0000-4000-8000-00000000000${n}`,
  event_type: "COMMITMENT_CREATED" as const,
  need_id: NEED,
  school_id: SCHOOL_A,
  commitment_id: COMMITMENT,
  sequence_number: status === "submitted" ? n : null,
  submission_status: status,
});

const NEED_KEYS = [
  "id", "kind", "title", "description", "category", "priority", "goal_quantity", "goal_unit",
  "event_date", "status", "validated_at", "completed_at", "created_at", "updated_at",
];

/** Recorre el DTO entero: ninguna clave sensible, ningún UUID de persona, ningún texto privado. */
function assertNoSensitive(dto: unknown) {
  const json = JSON.stringify(dto);
  for (const key of SENSITIVE_KEYS) assert.ok(!json.includes(`"${key}"`), `clave sensible ${key} en ${json}`);
  for (const value of [PERSON, "nota privada", "nota de entrega privada", "evidence/privada.jpg", "error interno", "persona@example.com"]) {
    assert.ok(!json.includes(value), `valor sensible ${value} en ${json}`);
  }
  assert.ok(!json.includes(SCHOOL_A), "school_id no debe salir en el DTO");
}

const keys = (o: object) => Object.keys(o).sort();

describe("parseNeedStatusFilter", () => {
  it("acepta exactamente los 4 estados del enum", () => {
    for (const s of ["pending_validation", "published", "completed", "cancelled"]) assert.equal(parseNeedStatusFilter(s), s);
  });
  it("sin parámetro → sin filtro (null)", () => {
    assert.equal(parseNeedStatusFilter(undefined), null);
  });
  it("rechaza vacío, roles, ids, inyección, mayúsculas y repetidos", () => {
    for (const v of ["", " ", "admin", "supporter", "school", "school_rep", NEED, "'; drop", "Published", "PUBLISHED", "published ", "all"]) {
      assert.equal(parseNeedStatusFilter(v), "invalid", JSON.stringify(v));
    }
    assert.equal(parseNeedStatusFilter(["published", "completed"]), "invalid");
    assert.equal(parseNeedStatusFilter(["published"]), "invalid");
  });
});

describe("DTOs con lista blanca", () => {
  it("toPanelSchoolDTO", () => {
    const dto = toPanelSchoolDTO(schoolRow);
    assert.deepEqual(keys(dto), ["department", "is_demo", "municipality", "name", "slug", "vereda"]);
    assertNoSensitive(dto);
  });

  it("toSchoolNeedDTO: campos de la necesidad + progreso", () => {
    const dto = toSchoolNeedDTO(needRow, progressRow);
    assert.deepEqual(keys(dto), [...NEED_KEYS, "progress"].sort());
    assert.deepEqual(dto.progress, { goal: 20, committed: 5, confirmed: 0, active: 1 });
    assertNoSensitive(dto);
  });

  it("toSchoolNeedDTO sin fila de progreso → ceros", () => {
    assert.deepEqual(toSchoolNeedDTO(needRow, undefined).progress, { goal: 20, committed: 0, confirmed: 0, active: 0 });
  });

  it("toPendingDeliveryDTO: texto fijo, sin aliado", () => {
    const dto = toPendingDeliveryDTO(commitmentRow, needRow);
    assert.deepEqual(dto, {
      commitmentId: COMMITMENT,
      needId: NEED,
      needTitle: "Kits escolares (DEMO)",
      quantity: 5,
      goalUnit: "kits",
      deliveryReportedAt: "2026-10-01T02:25:00.000Z",
      text: PENDING_DELIVERY_TEXT,
    });
    assert.equal(PENDING_DELIVERY_TEXT, "Entrega reportada por un aliado");
    assertNoSensitive(dto);
  });

  it("toPanelEventDTO: número de registro solo si está publicado", () => {
    assert.deepEqual(toPanelEventDTO(eventRow(3)), { eventId: eventRow(3).id, type: "COMMITMENT_CREATED", registryNumber: 3, published: true });
    assert.deepEqual(toPanelEventDTO(eventRow(4, "pending")), { eventId: eventRow(4).id, type: "COMMITMENT_CREATED", registryNumber: null, published: false });
    assert.equal(toPanelEventDTO(eventRow(5, "failed")).published, false);
    assertNoSensitive(toPanelEventDTO(eventRow(3)));
  });

  it("toSupporterCommitmentDTO: estructura completa sin supporter_id ni confirmed_by", () => {
    const dto = toSupporterCommitmentDTO(commitmentRow, needRow, schoolRow, progressRow, [eventRow(3), eventRow(4)]);
    assert.deepEqual(keys(dto), ["confirmedAt", "createdAt", "deliveryReportedAt", "events", "id", "need", "needId", "progress", "quantity", "school", "status"]);
    assert.deepEqual(keys(dto.need!), ["category", "goalQuantity", "goalUnit", "id", "priority", "status", "title"]);
    assert.deepEqual(keys(dto.school!), ["department", "isDemo", "municipality", "name", "slug", "vereda"]);
    assert.deepEqual(dto.progress, { goal: 20, committed: 5, confirmed: 0 });
    assert.equal(dto.events.length, 2);
    for (const e of dto.events) assert.deepEqual(keys(e), ["eventId", "published", "registryNumber", "type"]);
    assertNoSensitive(dto);
  });

  it("toSupporterCommitmentDTO sin necesidad visible → need/school/progress null", () => {
    const dto = toSupporterCommitmentDTO(commitmentRow, undefined, undefined, undefined, []);
    assert.equal(dto.need, null);
    assert.equal(dto.school, null);
    assert.equal(dto.progress, null);
    assertNoSensitive(dto);
  });

  it("toAdminNeedDTO: sin created_by ni validated_by; escuela solo nombre y slug", () => {
    const dto = toAdminNeedDTO(needRow, schoolRow);
    assert.deepEqual(keys(dto), [...NEED_KEYS, "school"].sort());
    assert.deepEqual(dto.school, { name: "Escuela DEMO El Mirador", slug: "escuela-demo-el-mirador" });
    assertNoSensitive(dto);
  });

  it("toAdminNeedReviewDTO", () => {
    const dto = toAdminNeedReviewDTO(needRow, schoolRow);
    assert.deepEqual(keys(dto), [...NEED_KEYS, "school"].sort());
    assert.deepEqual(keys(dto.school!), ["department", "is_demo", "municipality", "name", "slug", "vereda"]);
    assertNoSensitive(dto);
  });

  it("toActivityDTO: columnas seguras de impact_feed; descarta filas incompletas", () => {
    const row = {
      ...SENSITIVE,
      event_id: eventRow(1).id,
      event_type: "NEED_CREATED" as const,
      created_at: "2026-10-01T02:00:00.000Z",
      submission_status: "submitted" as const,
      consensus_timestamp: "1790821886.925550104",
      need_id: NEED,
      need_title: "Kits escolares (DEMO)",
      need_kind: "need" as const,
      school_id: SCHOOL_A,
      school_name: "Escuela DEMO El Mirador",
      school_slug: "escuela-demo-el-mirador",
      school_municipality: "San Gil",
      school_is_demo: true,
      commitment_id: null,
    };
    const dto = toActivityDTO(row)!;
    assert.deepEqual(keys(dto), ["eventId", "needId", "needTitle", "published", "recordedAt", "school", "type"]);
    assert.deepEqual(keys(dto.school), ["isDemo", "municipality", "name", "slug"]);
    assertNoSensitive(dto);
    assert.equal(toActivityDTO({ ...row, need_title: null }), null);
  });
});

describe("Agregados", () => {
  it("countNeedsByStatus cuenta los 4 estados (incluidos ceros)", () => {
    const rows = [{ status: "published" as const }, { status: "published" as const }, { status: "pending_validation" as const }, { status: "cancelled" as const }];
    assert.deepEqual(countNeedsByStatus(rows), { pending_validation: 1, published: 2, completed: 0, cancelled: 1 });
    assert.deepEqual(countNeedsByStatus([]), { pending_validation: 0, published: 0, completed: 0, cancelled: 0 });
  });

  it("countPublication solo cuenta estados (sin errores ni intentos)", () => {
    const counts = countPublication([eventRow(1), eventRow(2), eventRow(3, "pending"), eventRow(4, "failed")]);
    assert.deepEqual(counts, { pending: 1, submitted: 2, failed: 1 });
    assertNoSensitive(counts);
  });
});

describe("Historial por escuela", () => {
  const other = "dddddddd-0000-4000-8000-000000000001";
  const batch = [
    { ...eventRow(1), need_id: NEED, school_id: SCHOOL_A },
    { ...eventRow(2), need_id: NEED, school_id: SCHOOL_A },
    { ...eventRow(3), need_id: other, school_id: SCHOOL_A },
    { ...eventRow(4), need_id: NEED, school_id: SCHOOL_B }, // otra escuela: nunca
  ];

  it("selectSchoolNeedEvents solo deja eventos de la escuela del actor y de esa necesidad", () => {
    assert.deepEqual(selectSchoolNeedEvents(batch, SCHOOL_A, NEED).map((e) => e.id), [eventRow(1).id, eventRow(2).id]);
    assert.deepEqual(selectSchoolNeedEvents(batch, SCHOOL_B, other), []);
  });

  it("groupBy agrupa por clave y omite claves nulas", () => {
    const groups = groupBy(batch, (e) => (e.school_id === SCHOOL_A ? e.need_id : null));
    assert.deepEqual([...groups.keys()].sort(), [NEED, other].sort());
    assert.equal(groups.get(NEED)!.length, 2);
    assert.equal(groups.get(other)!.length, 1);
  });
});

describe("COMMITMENT_STATUS_LABEL", () => {
  it("cubre los 3 estados del flujo", () => {
    assert.deepEqual(Object.keys(COMMITMENT_STATUS_LABEL).sort(), ["committed", "confirmed", "delivery_reported"]);
  });
});
