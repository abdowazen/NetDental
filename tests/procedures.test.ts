import { describe, expect, it } from "vitest";
import { procedureSchema, procedureCategories, procedureSearchSchema } from "../packages/shared/src/procedures";
import en from "../apps/web/src/locales/en.json";
import fr from "../apps/web/src/locales/fr.json";

const input = { code: " exam ", name: " Examination ", category: "consultation_diagnosis",
  description: "", defaultPrice: "0", dentition: "both", scope: "whole_mouth",
  requiresLab: false, chartIndicator: "generic", active: true };
describe("procedure validation", () => {
  it("normalizes codes and exact USD decimals, including free procedures", () => {
    expect(procedureSchema.parse(input)).toMatchObject({ code: "EXAM", name: "Examination", defaultPrice: "0.00" });
    expect(procedureSchema.parse({ ...input, defaultPrice: "123.4" }).defaultPrice).toBe("123.40");
  });
  it("rejects blank required fields, negative prices, excess precision and unknown indicators", () => {
    for (const defaultPrice of ["", "-1", "1.234", "NaN", "1e3", "10000000000"]) {
      expect(procedureSchema.safeParse({ ...input, defaultPrice }).success).toBe(false);
    }
    for (const invalid of [{ code: " " }, { name: "" }, { category: "invalid" }, { chartIndicator: "unsupported" }]) {
      expect(procedureSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
    }
  });
  it("supports all categories with English and French labels", () => {
    expect(procedureCategories).toHaveLength(13);
    for (const category of procedureCategories) {
      expect(procedureSchema.safeParse({ ...input, category }).success).toBe(true);
      expect(en).toHaveProperty(`procedureCategory_${category}`);
      expect(fr).toHaveProperty(`procedureCategory_${category}`);
    }
  });
  it("bounds pagination and restricts sort columns", () => {
    expect(procedureSearchSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(procedureSearchSchema.safeParse({ sort: "roomId" }).success).toBe(false);
    expect(procedureSearchSchema.parse({})).toMatchObject({ page: 1, pageSize: 30, sort: "id", direction: "desc" });
  });
});
