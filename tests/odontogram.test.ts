import { describe, it, expect } from "vitest";
import { permanentTeeth, primaryTeeth, allTeeth, validSurfaces, surfaceLabel, toothInfo, toothIdSchema, toothEventSchema, treatmentSchema, latestToothStates, type ToothEvent } from "../packages/shared/src/odontogram";
import { toothPosition } from "../apps/web/src/features/treatment/tooth-layout";
describe("FDI chart identities and orientation", () => {
  it("has 32 permanent and 20 independent primary identifiers", () => {
    expect(permanentTeeth).toHaveLength(32);
    expect(primaryTeeth).toHaveLength(20);
    expect(new Set(allTeeth).size).toBe(52);
    for (const id of [0,19,29,39,49,56,66,76,86,99]) expect(toothIdSchema.safeParse(id).success).toBe(false);
    for (const id of allTeeth) expect(toothIdSchema.safeParse(id).success).toBe(true);
  });
  it("places FDI right quadrants on front-view left and upper quadrants above", () => {
    for (const id of allTeeth) {
      const [x,y] = toothPosition(id, true);
      expect(x < 0).toBe([1,4,5,8].includes(Math.floor(id / 10)));
      expect(y > 0).toBe([1,2,5,6].includes(Math.floor(id / 10)));
    }
    expect(toothPosition(51,true)[1]).not.toBe(toothPosition(11,true)[1]);
    expect(toothInfo(54).kind).toBe("molar");
    expect(toothInfo(14).kind).toBe("premolar");
  });
  it("validates canonical surfaces without using screen coordinates", () => {
    expect(validSurfaces(11)).toContain("incisal");
    expect(validSurfaces(16)).not.toContain("incisal");
    expect(surfaceLabel(11, "buccal")).toBe("facial");
    expect(surfaceLabel(16, "lingual")).toBe("palatal");
    const base = { procedureId: 1, mode: "group", teeth: [{ tooth: 11, surfaces: ["occlusal"], role: "target" }], date: "2026-09-23", notes: "", price: "25.00" };
    expect(treatmentSchema.safeParse(base).success).toBe(false);
    expect(treatmentSchema.safeParse({ ...base, teeth: [{ tooth: 11, surfaces: [], role: "target" }] }).success).toBe(true);
  });
  it("allows retained primary states only on primary teeth and ignores voided events", () => {
    expect(toothEventSchema.safeParse({ tooth: 11, state: "retained_primary", date: "2026-09-23", notes: "" }).success).toBe(false);
    expect(toothEventSchema.safeParse({ tooth: 51, state: "retained_primary", date: "2026-09-23", notes: "" }).success).toBe(true);
    const events = [
      { tooth: 51, state: "erupted", date: "2026-01-01", recordedAt: "2026-01-01", voidReason: null },
      { tooth: 51, state: "exfoliated", date: "2026-02-01", recordedAt: "2026-02-01", voidReason: "Correction" },
    ] as ToothEvent[];
    expect(latestToothStates(events).get(51)?.state).toBe("erupted");
    expect(latestToothStates(events).has(11)).toBe(false);
  });
});
