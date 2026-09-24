import { z } from "zod";

export const currencySchema = z.enum(["USD", "LBP"]);
export type Currency = z.infer<typeof currencySchema>;
export const currencySettingsSchema = z
  .object({ baseCurrency: currencySchema })
  .strict();
export const rateDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  });
export const exchangeRateSchema = z
  .object({
    date: rateDateSchema,
    lbpPerUsd: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .refine((value) => Number(value) > 0),
  })
  .strict();
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;
export type CurrencyState = {
  baseCurrency: Currency;
  today: string;
  effectiveRate: ExchangeRate | null;
  rates: ExchangeRate[];
};

// All clinic workstations use the same business date, independent of device timezone.
export function clinicDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function selectExchangeRate(
  rates: ExchangeRate[],
  date: string,
): ExchangeRate | null {
  rateDateSchema.parse(date);
  return rates
    .filter(
      (rate) => rate.date >= `${date.slice(0, 4)}-01-01` && rate.date <= date,
    )
    .reduce<ExchangeRate | null>(
      (latest, rate) => (!latest || rate.date > latest.date ? rate : latest),
      null,
    );
}

// Decimal arithmetic with integer scaling; round once to the currency's two decimal places.
export function convertCurrency(
  amount: string,
  from: Currency,
  to: Currency,
  rate: ExchangeRate | null,
): string {
  currencySchema.parse(from);
  currencySchema.parse(to);
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amount))
    throw new Error("Invalid amount");
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  let cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (from !== to) {
    if (!rate) throw new Error("Exchange rate unavailable");
    exchangeRateSchema.parse(rate);
    const [integer, decimal = ""] = rate.lbpPerUsd.split(".");
    const scaledRate =
      BigInt(integer) * 1000000n + BigInt(decimal.padEnd(6, "0"));
    const numerator = cents * (from === "USD" ? scaledRate : 1000000n);
    const denominator = from === "USD" ? 1000000n : scaledRate;
    cents = (numerator + denominator / 2n) / denominator;
  }
  return `${negative && cents !== 0n ? "-" : ""}${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
