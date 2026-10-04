import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

export async function checkPurchaseInvoices(app: FastifyInstance, headers: Record<string, string>, forbiddenHeaders: Record<string, string>, otherRoom: number) {
  const supplierResponse = await app.inject({ method: "POST", url: "/api/suppliers", headers, payload: { name: "Purchase Test Supplier", phone: "", address: "Beirut", active: true } });
  assert.equal(supplierResponse.statusCode, 201, supplierResponse.body); const supplierId = supplierResponse.json().supplier.id;
  const itemResponse = await app.inject({ method: "POST", url: "/api/supplies", headers, payload: { name: "Purchase Test Gloves", brand: "Test Brand", supplierId, openingBalance: "2", defaultPrice: "10", currency: "USD", date: "2026-01-01", expiryDate: "" } });
  assert.equal(itemResponse.statusCode, 201, itemResponse.body); const itemId = itemResponse.json().item.id;
  assert.equal(itemResponse.json().item.currentQuantity, "2.000");
  const productOptions = await app.inject({ url: `/api/purchase-invoices/products?supplierId=${supplierId}&date=2026-01-02`, headers });
  assert.equal(productOptions.statusCode, 200, productOptions.body);
  assert.equal(productOptions.json().products[0].id, itemId);
  assert.equal(productOptions.json().effectiveRate.lbpPerUsd, "90000");
  const input = { supplierId, paymentType: "cash", currency: "USD", date: "2026-01-02", note: "Test purchase", lines: [{ itemId, purchasePrice: "12.50", quantity: "5", expiryDate: "2027-01-01", description: "Powder-free boxes" }] };
  const created = await app.inject({ method: "POST", url: "/api/purchase-invoices", headers, payload: input });
  assert.equal(created.statusCode, 201, created.body); const invoice = created.json().invoice;
  assert.match(invoice.invoiceNumber, /^INV-\d{6,}$/); assert.equal(invoice.totalAmount, "62.50"); assert.equal(invoice.baseTotal, "62.50");
  assert.equal(invoice.lines[0].description, "Powder-free boxes");
  assert.equal((await app.inject({ url: `/api/supplies/${itemId}`, headers })).json().item.currentQuantity, "7.000");
  const updated = await app.inject({ method: "PUT", url: `/api/purchase-invoices/${invoice.id}`, headers, payload: { ...input, paymentType: "account", lines: [{ ...input.lines[0], quantity: "8" }] } });
  assert.equal(updated.statusCode, 200, updated.body); assert.equal(updated.json().invoice.paymentType, "account");
  assert.equal((await app.inject({ url: `/api/supplies/${itemId}`, headers })).json().item.currentQuantity, "10.000");
  const adjustedOpening = await app.inject({ method: "PUT", url: `/api/supplies/${itemId}`, headers, payload: { name: "Purchase Test Gloves", brand: "Test Brand", supplierId, openingBalance: "3", defaultPrice: "10", currency: "USD", date: "2026-01-01", expiryDate: "" } });
  assert.equal(adjustedOpening.statusCode, 200, adjustedOpening.body);
  assert.equal(adjustedOpening.json().item.currentQuantity, "11.000");
  const list = await app.inject({ url: "/api/purchase-invoices?page=1&pageSize=30&sort=id&direction=desc", headers });
  assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().total, 1); assert.equal(list.json().totalBaseAmount, "100.00");
  const byNumber = await app.inject({ url: `/api/purchase-invoices?q=${invoice.invoiceNumber}&page=1&pageSize=30&sort=id&direction=desc`, headers });
  assert.equal(byNumber.statusCode, 200, byNumber.body); assert.equal(byNumber.json().total, 1);
  assert.equal((await app.inject({ url: "/api/purchase-invoices", headers: forbiddenHeaders })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/purchase-invoices/${invoice.id}`, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/purchase-invoices/${invoice.id}`, headers })).statusCode, 204);
  assert.equal((await app.inject({ url: `/api/supplies/${itemId}`, headers })).json().item.currentQuantity, "3.000");
  console.log("Purchase invoice checks passed: opening stock, sequence, supplier products, actual values, expense snapshot, stock adjustments, CRUD, permissions and room isolation.");
}
