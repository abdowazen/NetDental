import { describe, expect, it } from "vitest";
import { purchaseInvoiceSchema } from "../packages/shared/src/purchase-invoices";

describe("purchase invoice validation", () => {
  const invoice = { supplierId: 1, paymentType: "cash" as const, currency: "USD" as const, date: "2026-10-01", note: "", lines: [
    { itemId: 10, purchasePrice: "12.5", quantity: "3", expiryDate: "2027-01-01" },
    { itemId: 11, purchasePrice: "7", quantity: "1.25", expiryDate: "" },
  ] };
  it("normalizes actual prices and quantities for financial and stock calculations", () => {
    const parsed = purchaseInvoiceSchema.parse(invoice);
    expect(parsed.lines[0]).toMatchObject({ purchasePrice: "12.50", quantity: "3.000" });
    expect(parsed.lines[1]).toMatchObject({ purchasePrice: "7.00", quantity: "1.250" });
  });
  it("rejects duplicate products and expiry dates before the invoice", () => {
    expect(purchaseInvoiceSchema.safeParse({ ...invoice, lines: [invoice.lines[0], { ...invoice.lines[1], itemId: 10 }] }).success).toBe(false);
    expect(purchaseInvoiceSchema.safeParse({ ...invoice, lines: [{ ...invoice.lines[0], expiryDate: "2026-09-30" }] }).success).toBe(false);
  });
  it("requires at least one product with positive price and quantity", () => {
    expect(purchaseInvoiceSchema.safeParse({ ...invoice, lines: [] }).success).toBe(false);
    expect(purchaseInvoiceSchema.safeParse({ ...invoice, lines: [{ ...invoice.lines[0], purchasePrice: "0" }] }).success).toBe(false);
    expect(purchaseInvoiceSchema.safeParse({ ...invoice, lines: [{ ...invoice.lines[0], quantity: "0" }] }).success).toBe(false);
  });
});
