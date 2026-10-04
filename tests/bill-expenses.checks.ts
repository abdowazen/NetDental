import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { BillExpenseList } from "@clinic/shared";

export async function checkBillExpenses(app: FastifyInstance, headers: Record<string, string>, forbiddenHeaders: Record<string, string>, otherRoom: number) {
  const categoryResponse = await app.inject({ method: "POST", url: "/api/bill-categories", headers, payload: { name: "Laboratory bills", description: "External laboratory expenses", defaultAmount: "900000", currency: "LBP", active: true } });
  assert.equal(categoryResponse.statusCode, 201, categoryResponse.body);
  const categoryId = categoryResponse.json().category.id;
  const input = { categoryId, amount: "900000", currency: "LBP", method: "cheque", date: "2026-01-02", note: "January laboratory invoice" };
  const created = await app.inject({ method: "POST", url: "/api/bill-expenses", headers, payload: input });
  assert.equal(created.statusCode, 201, created.body);
  const expense = created.json().expense;
  assert.equal(expense.baseCurrency, "USD"); assert.equal(expense.baseAmount, "10.00"); assert.equal(expense.lbpPerUsd, "90000");
  const list = await app.inject({ url: `/api/bill-expenses?categoryId=${categoryId}&from=2026-01-01&to=2026-12-31&page=1&pageSize=30&sort=date&direction=desc`, headers });
  assert.equal(list.statusCode, 200, list.body);
  const ledger = list.json<BillExpenseList>(); assert.equal(ledger.total, 1); assert.equal(ledger.totalBaseAmount, "10.00");
  const updated = await app.inject({ method: "PUT", url: `/api/bill-expenses/${expense.id}`, headers, payload: { ...input, amount: "25", currency: "USD", method: "card" } });
  assert.equal(updated.statusCode, 200, updated.body); assert.equal(updated.json().expense.baseAmount, "25.00");
  assert.equal((await app.inject({ url: "/api/bill-expenses", headers: forbiddenHeaders })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/bill-expenses", headers: forbiddenHeaders, payload: input })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/bill-expenses/${expense.id}`, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/bill-expenses/${expense.id}`, headers })).statusCode, 204);
  assert.equal((await app.inject({ url: `/api/bill-expenses/${expense.id}`, headers })).statusCode, 404);
  console.log("Bill expense checks passed: currencies, conversion snapshot, payment methods, totals, CRUD, permissions and room isolation.");
}
