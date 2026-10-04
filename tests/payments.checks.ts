import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

export async function checkPayments(
  app: FastifyInstance,
  db: PrismaClient,
  patientId: number,
  headers: Record<string, string>,
  otherRoom: number,
  staffHeaders: Record<string, string>,
) {
  const url = `/api/payments/${patientId}`;
  const rate = await app.inject({
    method: "PUT",
    url: "/currencies/rates",
    headers,
    payload: { date: "2026-01-01", lbpPerUsd: "90000" },
  });
  assert.equal(rate.statusCode, 200, rate.body);

  const created = await app.inject({
    method: "POST",
    url,
    headers,
    payload: {
      amount: "900000",
      method: "cash",
      date: "2026-01-02",
      currency: "LBP",
      note: "Deposit",
    },
  });
  assert.equal(created.statusCode, 201, created.body);

  const response = await app.inject({ url, headers });
  assert.equal(response.statusCode, 200, response.body);
  const summary = response.json();
  assert.equal(summary.baseCurrency, "USD");
  assert.equal(summary.planEstimate, "135.00");
  assert.equal(summary.patientCharge, "135.00");
  assert.equal(summary.paymentReceived, "10.00");
  assert.equal(summary.patientBalance, "125.00");
  assert.equal(summary.payments[0].amount, "900000.00");
  assert.equal(summary.payments[0].baseAmount, "10.00");
  assert.equal(summary.payments[0].lbpPerUsd, "90000");
  assert.ok(summary.ledger.some((entry: { type: string; description: string }) => entry.type === "payment" && entry.description === "Deposit"));
  assert.ok(summary.ledger.some((entry: { type: string; description: string }) => entry.type === "charge" && entry.description === "Unplanned treatment"));

  const stored = await db.payment.findFirstOrThrow({ where: { patientId } });
  assert.equal(stored.baseAmount.toFixed(2), "10.00");
  assert.equal(stored.planId, (await db.treatmentPlan.findFirstOrThrow({ where: { patientId }, orderBy: { number: "desc" } })).id);

  assert.equal((await app.inject({ method: "PATCH", url: "/currencies", headers, payload: { baseCurrency: "LBP" } })).statusCode, 200);
  const lbpSummary = (await app.inject({ url, headers })).json();
  assert.equal(lbpSummary.baseCurrency, "LBP");
  assert.equal(lbpSummary.planEstimate, "12150000.00");
  assert.equal(lbpSummary.patientCharge, "12150000.00");
  assert.equal(lbpSummary.paymentReceived, "900000.00");
  assert.equal(lbpSummary.patientBalance, "11250000.00");
  assert.equal(lbpSummary.payments[0].baseCurrency, "LBP");
  assert.equal(lbpSummary.payments[0].baseAmount, "900000.00");
  assert.ok(lbpSummary.ledger.some((entry: { type: string; baseAmount: string; baseCurrency: string }) => entry.type === "payment" && entry.baseAmount === "900000.00" && entry.baseCurrency === "LBP"));
  const lbpChart = (await app.inject({ url: `/api/odontogram/${patientId}`, headers })).json();
  assert.equal(lbpChart.baseCurrency, "LBP");
  assert.equal(lbpChart.effectiveRate.lbpPerUsd, "90000");

  assert.equal((await app.inject({ method: "POST", url, headers, payload: { amount: "5", method: "card", date: "2026-01-02", currency: "USD", note: "USD after base change" } })).statusCode, 201);
  const mixedLbpSummary = (await app.inject({ url, headers })).json();
  assert.equal(mixedLbpSummary.paymentReceived, "1350000.00");
  assert.equal(mixedLbpSummary.patientBalance, "10800000.00");

  assert.equal((await app.inject({ method: "PATCH", url: "/currencies", headers, payload: { baseCurrency: "USD" } })).statusCode, 200);
  const restoredUsdSummary = (await app.inject({ url, headers })).json();
  assert.equal(restoredUsdSummary.baseCurrency, "USD");
  assert.equal(restoredUsdSummary.paymentReceived, "15.00");
  assert.equal(restoredUsdSummary.patientBalance, "120.00");
  assert.ok(restoredUsdSummary.payments.every((payment: { baseCurrency: string }) => payment.baseCurrency === "USD"));
  await db.payment.deleteMany({ where: { patientId, note: "USD after base change" } });
  assert.equal((await app.inject({ url, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ url, headers: staffHeaders })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { amount: "0", method: "cash", date: "2026-01-02", currency: "USD", note: "" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { amount: "5", method: "bank_transfer", date: "2026-01-02", currency: "USD", note: "" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { amount: "5", method: "cash", date: "2099-01-01", currency: "USD", note: "" } })).statusCode, 400);
  console.log("Payment API checks passed: plan totals, exchange-rate fallback, immutable conversion snapshots, permissions and room isolation.");
}
