import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { BillCategoryList } from "@clinic/shared";

export async function checkBillCategories(app: FastifyInstance, headers: Record<string, string>, forbiddenHeaders: Record<string, string>, otherRoom: number) {
  const input = { name: "Utilities", description: "Electricity, internet and water", defaultAmount: "125.5", currency: "USD", laboratoryBills: false, active: true };
  const created = await app.inject({ method: "POST", url: "/api/bill-categories", headers, payload: input });
  assert.equal(created.statusCode, 201, created.body);
  const category = created.json().category;
  assert.equal(category.defaultAmount, "125.50");
  assert.equal(category.laboratoryBills, false);
  assert.equal((await app.inject({ method: "POST", url: "/api/bill-categories", headers, payload: input })).statusCode, 409);
  const list = await app.inject({ url: "/api/bill-categories?q=util&page=1&pageSize=1&sort=name&direction=asc", headers });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json<BillCategoryList>().categories[0]?.id, category.id);
  const updated = await app.inject({ method: "PUT", url: `/api/bill-categories/${category.id}`, headers, payload: { ...input, description: "Variable utilities", defaultAmount: "" } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().category.defaultAmount, null);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/bill-categories/${category.id}/status`, headers, payload: { active: false } })).json().category.active, false);
  assert.equal((await app.inject({ url: "/api/bill-categories", headers: forbiddenHeaders })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/bill-categories", headers: forbiddenHeaders, payload: input })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/bill-categories/${category.id}`, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ url: "/api/bill-categories", headers: { ...headers, "x-clinic-room": String(otherRoom) } })).json<BillCategoryList>().total, 0);
  console.log("Bill category checks passed: CRUD, optional fixed amount, uniqueness, permissions and room isolation.");
}
