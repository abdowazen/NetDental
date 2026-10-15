import { describe, expect, it } from "vitest";
import { supplierSchema, supplyItemSchema } from "../packages/shared/src/inventory";

describe("supplies and materials validation", () => {
  const item = {
    name: "Composite resin",
    brand: "DentalCo",
    supplierIds: [12, 18, 12],
    openingBalance: "2.5",
    defaultPrice: "18",
    currency: "USD" as const,
    date: "2026-10-01",
    expiryDate: "2027-10-01",
  };

  it("normalizes values and retains unique supplier assignments", () => {
    expect(supplyItemSchema.parse(item)).toEqual({
      ...item,
      supplierIds: [12, 18],
      openingBalance: "2.500",
      defaultPrice: "18.00",
    });
  });

  it("allows an item without a supplier or expiry date", () => {
    expect(supplyItemSchema.parse({ ...item, supplierIds: [], expiryDate: "" }).supplierIds).toEqual([]);
    expect(supplyItemSchema.parse({ ...item, openingBalance: "" }).openingBalance).toBe("0.000");
  });

  it("rejects an expiry date before the item date and invalid numeric precision", () => {
    const expiry = supplyItemSchema.safeParse({ ...item, expiryDate: "2026-09-30" });
    expect(expiry.success).toBe(false);
    if (!expiry.success) expect(expiry.error.issues[0]?.message).toBe("supplyExpiryBeforeDate");
    expect(supplyItemSchema.safeParse({ ...item, openingBalance: "1.0001" }).success).toBe(false);
    expect(supplyItemSchema.safeParse({ ...item, defaultPrice: "1.001" }).success).toBe(false);
  });
});

describe("supplier validation", () => {
  it("normalizes supported Lebanese phone formats", () => {
    expect(supplierSchema.parse({ name: "Dental Supplier", phone: "03 123 456", address: "Beirut", active: true }).phone).toBe("+961 3 123 456");
    expect(supplierSchema.parse({ name: "Dental Supplier", phone: "+961 1 234 567", address: "Beirut", active: true }).phone).toBe("+961 1 234 567");
  });

  it("rejects non-Lebanese and malformed numbers", () => {
    expect(supplierSchema.safeParse({ name: "Dental Supplier", phone: "+33 1 23 45 67", address: "", active: true }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "Dental Supplier", phone: "123", address: "", active: true }).success).toBe(false);
  });

  it("allows the phone number to be omitted", () => {
    expect(supplierSchema.parse({ name: "Dental Supplier", phone: "", address: "Beirut", active: true }).phone).toBe("");
  });
});
