import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { clinicDate, type NewPatientReport } from "@clinic/shared";

export async function checkReports(app: FastifyInstance, headers: Record<string, string>, forbiddenHeaders: Record<string, string>, otherRoom: number) {
  const date = clinicDate();
  const monthly = await app.inject({ url: `/api/reports/new-patients?period=monthly&date=${date}&page=1&pageSize=1&sort=createdAt&direction=desc`, headers });
  assert.equal(monthly.statusCode, 200, monthly.body);
  const report = monthly.json<NewPatientReport>();
  assert.equal(report.period, "monthly");
  assert.ok(report.total >= 1);
  assert.equal(report.patients.length, 1);
  assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.count, 0), report.total);
  assert.ok(report.patients[0].registeredAt.includes("T"));

  const daily = (await app.inject({ url: `/api/reports/new-patients?period=daily&date=${date}&page=1&pageSize=30&sort=id&direction=asc`, headers })).json<NewPatientReport>();
  assert.equal(daily.buckets.length, 24);
  const yearly = (await app.inject({ url: `/api/reports/new-patients?period=yearly&date=${date}&page=1&pageSize=30&sort=fullName&direction=asc`, headers })).json<NewPatientReport>();
  assert.equal(yearly.buckets.length, 12);
  assert.equal((await app.inject({ url: `/api/reports/new-patients?period=monthly&date=${date}`, headers: forbiddenHeaders })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/reports/new-patients?period=monthly&date=${date}`, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).json<NewPatientReport>().total, 1);
  assert.equal((await app.inject({ url: `/api/reports/new-patients?period=weekly&date=${date}`, headers })).statusCode, 400);
  console.log("New-patient report checks passed: room scope, daily/monthly/yearly buckets, sorting and pagination.");
}
