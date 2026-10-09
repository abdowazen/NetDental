import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { DashboardSummary } from "../packages/shared/src/dashboard";

export async function checkDashboard(app: FastifyInstance, db: PrismaClient, patientId: number, headers: Record<string,string>) {
  const monthly = await app.inject({ url: "/api/dashboard?period=monthly", headers });
  assert.equal(monthly.statusCode, 200, monthly.body);
  const month = monthly.json<DashboardSummary>();
  assert.equal(month.period, "monthly");
  assert.equal(month.buckets.length, 5);
  assert.ok(month.buckets.reduce((sum, bucket) => sum + bucket.registrations, 0) >= 1);
  assert.ok(Number.isFinite(Number(month.outstandingBalance)));
  assert.ok(month.pendingLabRequests >= 0);
  assert.equal(month.currency, "USD");
  assert.equal((await app.inject({ method: "PATCH", url: "/currencies", headers, payload: { baseCurrency: "LBP" } })).statusCode, 200);
  const lbp = (await app.inject({ url: "/api/dashboard?period=monthly", headers })).json<DashboardSummary>();
  assert.equal(lbp.currency, "LBP");
  assert.equal(Number(lbp.outstandingBalance), Number(month.outstandingBalance) * 90000);
  assert.equal((await app.inject({ method: "PATCH", url: "/currencies", headers, payload: { baseCurrency: "USD" } })).statusCode, 200);
  const yearly = await app.inject({ url: "/api/dashboard?period=yearly", headers });
  assert.equal(yearly.statusCode, 200, yearly.body);
  assert.equal(yearly.json<DashboardSummary>().buckets.length, 12);
  assert.ok(yearly.json<DashboardSummary>().buckets.reduce((sum, bucket) => sum + bucket.registrations, 0) >= 1);
  const yearlyBeforeDiscount = yearly.json<DashboardSummary>();
  const chargeBeforeDiscount = yearlyBeforeDiscount.buckets.reduce((sum, bucket) => sum + Number(bucket.charges), 0);
  const totalDiscount = await db.clinicalRecord.create({ data: {
    patientId, planId: null, kind: "unplan_total", actorId: "dashboard-check", date: new Date(),
    data: { discount: { type: "amount", value: "5.00" }, subtotalAtSave: "35.00" },
  } });
  const discountedYearly = (await app.inject({ url: "/api/dashboard?period=yearly", headers })).json<DashboardSummary>();
  assert.equal(discountedYearly.buckets.reduce((sum, bucket) => sum + Number(bucket.charges), 0), chargeBeforeDiscount - 5);
  assert.equal(Number(discountedYearly.outstandingBalance), Number(yearlyBeforeDiscount.outstandingBalance) - 5);
  await db.clinicalRecord.delete({ where: { id: totalDiscount.id } });
  assert.equal((await app.inject({ url: "/api/dashboard?period=weekly", headers })).statusCode, 400);
  console.log("Dashboard checks passed: discounted charges, payments, balances and monthly/yearly overview buckets.");
}
