import { describe, expect, it } from "vitest";
import {
  clinicDate,
  convertCurrency,
  selectExchangeRate,
  rateDateSchema,
} from "../packages/shared/src/currency";

describe("currency rate selection and conversion", () => {
  const rates = [
    { date: "2025-12-31", lbpPerUsd: "88000" },
    { date: "2026-06-01", lbpPerUsd: "89000" },
    { date: "2026-09-21", lbpPerUsd: "89500" },
    { date: "2026-09-22", lbpPerUsd: "90000" },
    { date: "2026-12-31", lbpPerUsd: "91000" },
  ];
  it("uses today, otherwise the greatest eligible date regardless of rate value or order", () => {
    expect(selectExchangeRate([...rates].reverse(), "2026-09-22")?.date).toBe(
      "2026-09-22",
    );
    expect(selectExchangeRate(rates, "2026-09-23")?.date).toBe("2026-09-22");
    expect(selectExchangeRate(rates, "2026-09-20")?.date).toBe("2026-06-01");
  });
  it("does not use future dates or previous years when no eligible rate exists", () => {
    expect(selectExchangeRate(rates, "2026-01-01")).toBeNull();
    expect(selectExchangeRate(rates, "2027-01-01")).toBeNull();
    expect(selectExchangeRate([], "2026-09-22")).toBeNull();
  });
  it("uses Beirut's business day at midnight and year boundaries", () => {
    expect(clinicDate(new Date("2026-09-21T22:30:00Z"))).toBe("2026-09-22");
    expect(clinicDate(new Date("2025-12-31T22:30:00Z"))).toBe("2026-01-01");
    expect(rateDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(rateDateSchema.safeParse("2028-02-29").success).toBe(true);
  });
  it("converts both ways and avoids binary floating-point rounding", () => {
    const rate = { date: "2026-09-22", lbpPerUsd: "89500.125" };
    expect(convertCurrency("10", "USD", "LBP", rate)).toBe("895001.25");
    expect(convertCurrency("895001.25", "LBP", "USD", rate)).toBe("10.00");
    expect(convertCurrency("0.01", "USD", "LBP", rate)).toBe("895.00");
    expect(convertCurrency("-10", "USD", "LBP", rate)).toBe("-895001.25");
    expect(
      convertCurrency("1.01", "USD", "LBP", { ...rate, lbpPerUsd: "1.5" }),
    ).toBe("1.52");
    expect(convertCurrency("10.2", "LBP", "LBP", null)).toBe("10.20");
    expect(() => convertCurrency("1", "USD", "LBP", null)).toThrow(
      "Exchange rate unavailable",
    );
    expect(() =>
      convertCurrency("1", "USD", "LBP", { ...rate, lbpPerUsd: "0" }),
    ).toThrow();
  });
});
