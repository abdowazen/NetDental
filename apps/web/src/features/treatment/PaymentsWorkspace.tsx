import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CreditCard, ReceiptText, Scale } from "lucide-react";
import { allowed, clinicDate, paymentInputSchema, type Currency, type PaymentInput, type PaymentSummary } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Pagination } from "../../components/Pagination";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";

type ActivityFilter = "all" | "charge" | "payment";
const emptyPayments: PaymentSummary = {
  baseCurrency: "USD", effectiveRate: null, planEstimate: "0.00", discountAmount: "0.00",
  discountPercent: "0.00", patientCharge: "0.00", paymentReceived: "0.00",
  patientBalance: "0.00", payments: [], ledger: [],
};

export function PaymentsWorkspace({ patientId, patientName }: { patientId?: number; patientName?: string }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const client = useQueryClient();
  const canView = allowed(user, "payments", "view");
  const canCreate = allowed(user, "payments", "create");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentInput["method"]>("cash");
  const [date, setDate] = useState(clinicDate());
  const [currency, setCurrency] = useState<Currency>("USD");
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState("");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activitySort, setActivitySort] = useState<"date" | "description" | "charge" | "payment">("date");
  const [activityDirection, setActivityDirection] = useState<"asc" | "desc">("desc");
  const query = useQuery({
    queryKey: ["payments", roomId, patientId], enabled: canView && !!patientId,
    queryFn: ({ signal }) => api<PaymentSummary>(`/api/payments/${patientId}`, { signal }),
  });
  const mutation = useMutation({
    mutationFn: (body: PaymentInput) => api(`/api/payments/${patientId}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setAmount(""); setNote(""); setValidation(""); setPage(1);
      await client.invalidateQueries({ queryKey: ["payments", roomId, patientId] });
    },
    onError: (error) => setValidation(t(errorKey(error))),
  });
  useEffect(() => { setPage(1); }, [patientId, activity, activitySort, activityDirection]);
  useEffect(() => { if (query.data) setCurrency(query.data.baseCurrency); }, [patientId, query.data?.baseCurrency]);
  useEffect(() => {
    const total = query.data?.ledger.filter((entry) => activity === "all" || entry.type === activity).length ?? 0;
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / pageSize))));
  }, [query.data, activity, pageSize]);
  function submit(event: FormEvent) {
    event.preventDefault(); setValidation("");
    if (!patientId) return;
    const parsed = paymentInputSchema.safeParse({ amount, method, date, currency, note });
    if (!parsed.success) { setValidation(t(parsed.error.issues[0]?.message ?? "VALIDATION_ERROR")); return; }
    mutation.mutate(parsed.data);
  }
  if (!canView) return <div className="card p-8 text-center text-muted">{t("paymentAccess")}</div>;
  if (patientId && query.error) return <div className="space-y-3"><ErrorMessage message={t(errorKey(query.error))}/><Button onClick={() => void query.refetch()}>{t("retry")}</Button></div>;
  if (patientId && !query.data) return <p role="status">{t("loading")}</p>;
  const data = query.data ?? emptyPayments;
  const money = (value: string) => new Intl.NumberFormat(i18n.language, { style: "currency", currency: data.baseCurrency, maximumFractionDigits: 2 }).format(Number(value));
  const displayMoney = (value: string) => patientId ? money(value) : "—";
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const filtered = activity === "all" ? data.ledger : data.ledger.filter((entry) => entry.type === activity);
  const sorted = [...filtered].sort((a, b) => {
    const value = (entry: typeof filtered[number]) => activitySort === "date" ? entry.date : activitySort === "description" ? (entry.type === "payment" ? entry.method ?? "" : entry.description).toLocaleLowerCase() : activitySort === "charge" ? entry.type === "charge" ? Number(entry.baseAmount) : -1 : entry.type === "payment" ? Number(entry.baseAmount) : -1;
    const left = value(a); const right = value(b); const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return activityDirection === "asc" ? comparison : -comparison;
  });
  const rows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const cards = [
    ["paymentNetCharges", data.patientCharge, ReceiptText, "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"],
    ["paymentReceived", data.paymentReceived, CreditCard, "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"],
    ["paymentBalance", data.patientBalance, Scale, "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"],
  ] as const;
  return <div className="space-y-3">
    <header>
      <h1 className="text-2xl font-bold tracking-tight">{t("paymentsTitle")}</h1>
      <p className="mt-0.5 text-xs text-muted">{patientId ? t("paymentPatientAccount", { patient: patientName ?? "" }) : t("paymentNoPatientSelected")}</p>
    </header>
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map(([label, value, Icon, color]) => <section key={label} className={`card flex min-w-0 items-center gap-3 border p-4 ${color}`}>
        <span className="rounded-lg bg-white/70 p-2 shadow-sm dark:bg-black/20"><Icon size={20} aria-hidden="true"/></span>
        <div className="min-w-0"><h2 className="truncate text-xs font-semibold">{t(label)}</h2><p className="truncate text-2xl font-bold tabular-nums">{displayMoney(value)}</p></div>
      </section>)}
    </div>
    <section className="card grid overflow-hidden md:grid-cols-[1.2fr_repeat(3,1fr)]">
      <div className="border-b border-line px-4 py-3 md:border-b-0 md:border-r"><h2 className="text-sm font-semibold">{t("paymentPlanEstimate")}</h2><p className="text-xs text-muted">{patientId ? t("paymentSelectedPlan") : t("paymentNoPatientSelected")}</p></div>
      <div className="border-b border-line px-4 py-3 md:border-b-0 md:border-r"><p className="text-xs text-muted">{t("paymentBeforeDiscount")}</p><p className="font-semibold tabular-nums">{displayMoney(data.planEstimate)}</p></div>
      <div className="border-b border-line px-4 py-3 md:border-b-0 md:border-r"><p className="text-xs text-muted">{t("paymentDiscountPercent")} {patientId ? `${data.discountPercent}%` : "—"}</p><p className="font-semibold tabular-nums">{patientId ? `−${money(data.discountAmount)}` : "—"}</p></div>
      <div className="px-4 py-3"><p className="text-xs text-muted">{t("paymentEstimatedTotal")}</p><p className="font-bold tabular-nums text-accent-ink">{displayMoney(data.patientCharge)}</p></div>
    </section>
    <div className="grid items-start gap-3 lg:grid-cols-[1.45fr_.55fr]">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="font-semibold">{t("paymentAccountActivity")}</h2><p className="text-xs text-muted">{patientId ? t("paymentBaseCurrency", { currency: data.baseCurrency }) : t("paymentSelectPatient")}</p></div>
          <select aria-label={t("paymentActivityFilter")} className="input min-h-9 w-auto py-1.5 text-sm" value={activity} onChange={(event) => setActivity(event.target.value as ActivityFilter)}>
            <option value="all">{t("paymentActivity_all")}</option><option value="charge">{t("paymentActivity_charge")}</option><option value="payment">{t("paymentActivity_payment")}</option>
          </select>
        </div>
        <div className="min-h-72 overflow-auto"><table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-soft text-muted"><tr>{([['date','odDate'],['description','paymentDescription'],['charge',patientId ? "paymentChargeColumn" : "paymentType_charge"],['payment',patientId ? "paymentPaymentColumn" : "paymentType_payment"]] as const).map(([column,label]) => <th key={column} aria-sort={activitySort === column ? activityDirection === "asc" ? "ascending" : "descending" : "none"} className={`p-3 font-medium ${column === "charge" || column === "payment" ? "text-right" : ""}`}><button type="button" className="inline-flex items-center gap-1" onClick={() => { setActivityDirection(activitySort === column && activityDirection === "asc" ? "desc" : "asc"); setActivitySort(column); }}>{t(label, patientId && (column === "charge" || column === "payment") ? { currency: data.baseCurrency } : undefined)}<span aria-hidden="true">{activitySort === column ? activityDirection === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead>
          <tbody>{rows.map((entry) => <tr key={`${entry.type}-${entry.id}`} className="border-t border-line hover:bg-soft/60">
            <td className="whitespace-nowrap p-3 text-xs">{formatDate(entry.date)}</td>
            <td className="p-3"><p className="font-medium">{entry.type === "payment" ? t(`paymentMethod_${entry.method ?? "cash"}`) : entry.description}</p>{entry.type === "payment" && <p className="mt-0.5 text-xs text-muted">{entry.originalAmount} {entry.originalCurrency}{entry.description ? ` · ${entry.description}` : ""}</p>}</td>
            <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">{entry.type === "charge" ? money(entry.baseAmount) : "—"}</td>
            <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{entry.type === "payment" ? money(entry.baseAmount) : "—"}</td>
          </tr>)}{!rows.length && <tr><td colSpan={4} className="p-8 text-center text-muted">{t("paymentNoEntries")}</td></tr>}</tbody>
          {filtered.length > 0 && <tfoot><tr className="border-t border-line bg-soft/70"><td colSpan={3} className="p-3 font-semibold">{t("paymentBalance")}</td><td className="p-3 text-right text-lg font-bold tabular-nums text-danger-ink">{money(data.patientBalance)}</td></tr></tfoot>}
        </table></div>
        <Pagination page={page} pageSize={pageSize} total={filtered.length} busy={query.isFetching} label={t("paymentPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
      </section>
      <section className="card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{t("paymentRecord")}</h2>
        <p className="mt-1 text-xs text-muted">{t("paymentPartialAccepted")}</p></div>
        {canCreate && <Button type="submit" form="payment-record-form" className="!min-h-0 !px-4 !py-2" disabled={mutation.isPending || !patientId}>{t(mutation.isPending ? "saving" : "paymentSave")}</Button>}</div>
        {validation && <div className="mt-3"><ErrorMessage message={validation}/></div>}
        {canCreate ? <form id="payment-record-form" className="mt-4 space-y-3" onSubmit={submit}>{!patientId && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">{t("paymentSelectPatient")}</p>}<fieldset disabled={mutation.isPending || !patientId} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field id="payment-amount" label={t("paymentAmount")}><input id="payment-amount" className="input" type="number" min="0.01" max="999999999999.99" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}/></Field>
            <Field id="payment-currency" label={t("paymentCurrency")}><select id="payment-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}><option value="USD">USD</option><option value="LBP">LBP</option></select></Field></div>
          <Field id="payment-method" label={t("paymentMethod")}><select id="payment-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentInput["method"])}><option value="cash">{t("paymentMethod_cash")}</option><option value="card">{t("paymentMethod_card")}</option></select></Field>
          <Field id="payment-date" label={t("odDate")}><input id="payment-date" className="input" type="date" max={clinicDate()} required value={date} onChange={(e) => setDate(e.target.value)}/></Field>
          <Field id="payment-note" label={`${t("patientNotes")} (${t("optional")})`}><textarea id="payment-note" className="input" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)}/></Field>
          <div className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">{!patientId ? t("paymentSelectPatient") : data.effectiveRate ? t("paymentRate", { rate: data.effectiveRate.lbpPerUsd, date: data.effectiveRate.date }) : t("paymentNoConversion")}</div>
        </fieldset></form> : <p className="mt-4 text-sm text-muted">{t("odReadOnly")}</p>}
      </section>
    </div>
  </div>;
}
