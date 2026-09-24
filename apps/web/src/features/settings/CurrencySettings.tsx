import { allowed } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { useState, type FormEvent } from "react";
import { SettingsCard } from "./SettingsCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  clinicDate,
  exchangeRateSchema,
  convertCurrency,
  type Currency,
  type CurrencyState,
} from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage } from "../../components/ui";

export function CurrencySettings() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const query = useQuery({
    queryKey: ["currencies", roomId],
    queryFn: () => api<CurrencyState>("/currencies"),
    refetchInterval: 60_000,
  });
  const [date, setDate] = useState(clinicDate);
  const [rate, setRate] = useState("");
  const [validationError, setValidationError] = useState(false);
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState<Currency>("USD");
  const baseMutation = useMutation({
    mutationFn: (baseCurrency: Currency) =>
      api("/currencies", {
        method: "PATCH",
        body: JSON.stringify({ baseCurrency }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["currencies"] }),
  });
  const rateMutation = useMutation({
    mutationFn: () =>
      api("/currencies/rates", {
        method: "PUT",
        body: JSON.stringify({ date, lbpPerUsd: rate.trim() }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["currencies"] }),
  });
  const data = query.data;
  const effective = data?.effectiveRate;
  const existing = data?.rates.find((item) => item.date === date);
  let converted: string | null = null;
  if (data) {
    try {
      converted = convertCurrency(
        amount,
        from,
        data.baseCurrency,
        data.effectiveRate,
      );
    } catch {
      /* Incomplete input or no eligible rate. */
    }
  }
  function saveRate(event: FormEvent) {
    event.preventDefault();
    const valid = exchangeRateSchema.safeParse({
      date,
      lbpPerUsd: rate.trim(),
    }).success;
    setValidationError(!valid);
    if (valid) rateMutation.mutate();
  }
  const formatRate = (value: string) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(
      Number(value),
    );
  return (
    <SettingsCard title={t("currencyTitle")}>
      <p className="mt-2 text-sm text-muted">{t("currencyDescription")}</p>
      {query.isPending && (
        <p role="status" className="mt-5 text-sm text-muted">
          {t("loading")}
        </p>
      )}
      {query.error && (
        <div className="mt-5">
          <ErrorMessage message={t(errorKey(query.error))} />
          <Button className="mt-3" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {data && (
        <>
          <div className="mt-6 max-w-sm">
            <label
              htmlFor="base-currency"
              className="mb-2 block text-sm font-medium"
            >
              {t("baseCurrency")}
            </label>
            <select
              id="base-currency"
              className="input"
              value={data.baseCurrency}
              disabled={
                baseMutation.isPending || !allowed(user, "settings", "modify")
              }
              onChange={(event) =>
                baseMutation.mutate(event.target.value as Currency)
              }
            >
              <option value="USD">{t("currencyUSD")}</option>
              <option value="LBP">{t("currencyLBP")}</option>
            </select>
            <p role="status" className="mt-2 text-xs text-muted">
              {baseMutation.isPending
                ? t("saving")
                : baseMutation.isSuccess
                  ? t("currencySaved")
                  : ""}
            </p>
            {baseMutation.error && (
              <ErrorMessage message={t(errorKey(baseMutation.error))} />
            )}
          </div>
          <div className="mt-6 rounded-xl border border-accent-line bg-accent-soft p-5">
            <p className="text-sm font-semibold">{t("effectiveRate")}</p>
            {effective ? (
              <>
                <p className="mt-2 text-xl font-semibold text-accent-ink">
                  1 USD = {formatRate(effective.lbpPerUsd)} LBP
                </p>
                <p className="mt-2 text-sm text-muted">
                  {t(
                    effective.date === data.today
                      ? "rateToday"
                      : "rateFallback",
                    { date: effective.date },
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {t("rateMissing", { year: data.today.slice(0, 4) })}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">{t("rateRule")}</p>
          </div>
          <form className="mt-7" onSubmit={saveRate}>
            <h4 className="text-sm font-semibold">{t("dailyRate")}</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rate-date" className="mb-2 block text-sm">
                  {t("rateDate")}
                </label>
                <input
                  id="rate-date"
                  className="input"
                  type="date"
                  required
                  min={`${data.today.slice(0, 4)}-01-01`}
                  max={data.today}
                  value={date}
                  disabled={
                    rateMutation.isPending ||
                    !allowed(user, "settings", existing ? "modify" : "create")
                  }
                  onChange={(event) => {
                    setDate(event.target.value);
                    rateMutation.reset();
                  }}
                />
              </div>
              <div>
                <label htmlFor="daily-rate" className="mb-2 block text-sm">
                  {t("lbpPerUsd")}
                </label>
                <input
                  id="daily-rate"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  required
                  min="0.000001"
                  max="999999999999.999999"
                  step="0.000001"
                  value={rate}
                  disabled={rateMutation.isPending}
                  onChange={(event) => {
                    setRate(event.target.value);
                    setValidationError(false);
                    rateMutation.reset();
                  }}
                />
              </div>
            </div>
            {existing && (
              <p className="mt-3 text-sm text-muted">
                {t("rateReplace", { rate: formatRate(existing.lbpPerUsd) })}
              </p>
            )}
            <Button
              className="mt-4"
              type="submit"
              disabled={rateMutation.isPending}
            >
              {rateMutation.isPending
                ? t("saving")
                : t(existing ? "updateRate" : "saveRate")}
            </Button>
            <p role="status" className="mt-3 text-sm text-accent-ink">
              {rateMutation.isSuccess ? t("rateSaved") : ""}
            </p>
            {validationError && <ErrorMessage message={t("rateInvalid")} />}
            {rateMutation.error && (
              <ErrorMessage message={t(errorKey(rateMutation.error))} />
            )}
          </form>
          <div className="mt-7 border-t border-line pt-6">
            <h4 className="text-sm font-semibold">{t("currencyPreview")}</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="convert-amount" className="mb-2 block text-sm">
                  {t("currencyAmount")}
                </label>
                <input
                  id="convert-amount"
                  className="input"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="convert-from" className="mb-2 block text-sm">
                  {t("currencyFrom")}
                </label>
                <select
                  id="convert-from"
                  className="input"
                  value={from}
                  onChange={(event) => setFrom(event.target.value as Currency)}
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </select>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium" role="status">
              {converted !== null
                ? `${converted} ${data.baseCurrency}`
                : t("conversionUnavailable")}
            </p>
          </div>
          <details className="mt-7 border-t border-line pt-5">
            <summary className="cursor-pointer text-sm font-medium">
              {t("rateHistory", {
                year: data.today.slice(0, 4),
                count: data.rates.length,
              })}
            </summary>
            <div className="mt-4 max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2">{t("rateDate")}</th>
                    <th className="py-2">{t("lbpPerUsd")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rates.map((item) => (
                    <tr key={item.date} className="border-b border-line">
                      <td className="py-2">{item.date}</td>
                      <td className="py-2">{formatRate(item.lbpPerUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </SettingsCard>
  );
}
