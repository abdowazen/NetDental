import { describe, it, expect } from "vitest";
import { discountSchema, moneyCents, moneyString, discountCents, treatmentNet, treatmentEditSchema } from "../packages/shared/src/odontogram";

describe("treatment discounts", () => {
  it("keeps the original price and rounds percentage discounts to cents", () => {
    const record = { price: "19.99", discount: { type: "percent" as const, value: "12.50" } };
    expect(moneyString(treatmentNet(record))).toBe("17.49");
    expect(record.price).toBe("19.99");
    expect(discountCents(1n, { type: "percent", value: "50.00" })).toBe(1n);
  });
  it("applies plan discounts after row discounts without floating point errors", () => {
    const subtotal = treatmentNet({ price: "100.00", discount: { type: "amount", value: "10.25" } });
    expect(moneyString(subtotal - discountCents(subtotal, { type: "percent", value: "10.00" }))).toBe("80.77");
    expect(moneyCents("9999999999.99")).toBe(999999999999n);
  });
  it("caps an existing fixed plan discount if rows are removed", () => {
    expect(discountCents(200n, { type: "amount", value: "5.00" })).toBe(200n);
    expect(discountCents(0n, { type: "percent", value: "100.00" })).toBe(0n);
  });
  it("rejects invalid discounts and direct price updates", () => {
    for (const value of ["-1", "100.01", "NaN", "1.001"])
      expect(discountSchema.safeParse({ type: "percent", value }).success).toBe(false);
    expect(treatmentEditSchema.safeParse({ price: "10", date: "2026-09-24", notes: "", expectedVersion: 1, discount: { type: "amount", value: "0" } }).success).toBe(false);
  });
});
