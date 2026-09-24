import { describe, expect, it } from "vitest";
import { formatLebanesePhone } from "../packages/shared/src/patients";
import {
  patientPrefill,
  patientSchema,
  patientSearchSchema,
} from "../packages/shared/src/patients";

describe("patient form inputs", () => {
  it("formats Lebanese local and international phone input", () => {
    expect(formatLebanesePhone("03 123 456")).toBe("+961 3 123 456");
    expect(formatLebanesePhone("01-123456")).toBe("+961 1 123 456");
    expect(formatLebanesePhone("70123456")).toBe("+961 70 123 456");
    expect(formatLebanesePhone("00961 70 123456")).toBe("+961 70 123 456");
    expect(formatLebanesePhone("+33 612345678")).toBeNull();
    expect(formatLebanesePhone("123")).toBeNull();
  });
  it("prefills phone or first and last names without making full name editable", () => {
    expect(patientPrefill("+961 (70) 123456")).toEqual({
      phone: "+961 (70) 123456",
    });
    expect(patientPrefill(" Marie  de Curie ")).toEqual({
      firstName: "Marie",
      lastName: "de Curie",
    });
    expect(patientPrefill("Élodie Dupont")).toEqual({
      firstName: "Élodie",
      lastName: "Dupont",
    });
    expect(patientPrefill("Ali")).toEqual({ firstName: "Ali", lastName: "" });
    expect(patientPrefill("foo@bar")).toEqual({});
  });
  it("bounds search queries and accepts valid optional form fields", () => {
    expect(patientSearchSchema.safeParse({ q: "x".repeat(101) }).success).toBe(
      false,
    );
    expect(patientSearchSchema.safeParse({ cursor: "-1" }).success).toBe(false);
    expect(
      patientSchema.safeParse({
        firstName: "Ali",
        lastName: "Test",
        phone: "03 123 456",
        gender: "Male",
        firstVisit: "2028-02-29",
        notes: "Multiline\nnotes",
      }).success,
    ).toBe(true);
  });
});
