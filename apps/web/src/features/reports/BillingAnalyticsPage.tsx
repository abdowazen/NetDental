import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, CreditCard, FileDown, FileSpreadsheet, ReceiptText, RotateCcw, WalletCards } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clinicDate, type BillExpense, type BillingAnalyticsQuery, type BillingAnalyticsReport } from "@clinic/shared";
import { Pagination } from "../../components/Pagination";
import { ErrorMessage } from "../../components/ui";
import { api, errorKey } from "../../lib/api";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { exportTableExcel, exportTablePdf, type TableExportColumn } from "./exportPatients";

type Period = "monthly" | "yearly" | "custom";
type Method = "cash" | "card" | "cheque";
const today = clinicDate();
const monthBounds = (month: string) => ({ from: `${month}-01`, to: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10) });
const yearBounds = (year: string) => ({ from: `${year}-01-01`, to: `${year}-12-31` });
const previousMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7); };
const money = (value: string | undefined, currency: string) => `${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function BillingAnalyticsPage() {
  const { t } = useTranslation(); const { roomId } = useWorkspace();
  const [period, setPeriod] = useState<Period>("monthly");
  const [month, setMonth] = useState(today.slice(0, 7)); const [year, setYear] = useState(today.slice(0, 4));
  const [compare, setCompare] = useState(false); const [compareMonth, setCompareMonth] = useState(previousMonth(today.slice(0, 7))); const [compareYear, setCompareYear] = useState(String(+today.slice(0, 4) - 1));
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`); const [customTo, setCustomTo] = useState(today);
  const [categoryId, setCategoryId] = useState(""); const [methods, setMethods] = useState<Method[]>(["cash", "card", "cheque"]);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<BillingAnalyticsQuery["sort"]>("date"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null); const [exportError, setExportError] = useState(false);
  const bounds = period === "monthly" ? monthBounds(month) : period === "yearly" ? yearBounds(year) : { from: customFrom, to: customTo };
  const comparison = compare && period !== "custom" ? period === "monthly" ? monthBounds(compareMonth) : yearBounds(compareYear) : null;
  useEffect(() => setPage(1), [period, month, year, compare, compareMonth, compareYear, customFrom, customTo, categoryId, methods]);
  const params = new URLSearchParams({ period, from: bounds.from, to: bounds.to, methods: methods.join(","), page: String(page), pageSize: String(pageSize), sort, direction });
  if (categoryId) params.set("categoryId", categoryId); if (comparison) { params.set("compareFrom", comparison.from); params.set("compareTo", comparison.to); }
  const query = useQuery({ queryKey: ["billing-analytics", roomId, params.toString()], enabled: methods.length > 0 && bounds.to >= bounds.from, queryFn: ({ signal }) => api<BillingAnalyticsReport>(`/api/reports/billing-payments?${params}`, { signal }) });
  const data = query.data; const maxTrend = Math.max(1, ...(data?.buckets.flatMap((item) => [Number(item.current), Number(item.comparison)]) ?? [1]));
  const maxCategory = Math.max(1, ...(data?.categories.map((item) => Number(item.total)) ?? [1])); const maxMethod = Math.max(1, ...(data?.methods.map((item) => Number(item.total)) ?? [1]));
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)); useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const toggleMethod = (method: Method) => setMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  const filtersAreDefault = period === "monthly" && month === today.slice(0, 7) && !compare && !categoryId && methods.length === 3 && ["cash", "card", "cheque"].every((method) => methods.includes(method as Method)) && sort === "date" && direction === "desc" && pageSize === 30;
  const clearFilters = () => {
    setPeriod("monthly"); setMonth(today.slice(0, 7)); setYear(today.slice(0, 4));
    setCompare(false); setCompareMonth(previousMonth(today.slice(0, 7))); setCompareYear(String(+today.slice(0, 4) - 1));
    setCustomFrom(`${today.slice(0, 7)}-01`); setCustomTo(today); setCategoryId("");
    setMethods(["cash", "card", "cheque"]); setSort("date"); setDirection("desc"); setPageSize(30); setPage(1);
  };
  const sortHeader = (column: BillingAnalyticsQuery["sort"], label: string) => <button type="button" className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{label}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>;
  const colors = ["bg-cyan-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-blue-500"];
  const periodTitle = period === "monthly" ? month : period === "yearly" ? year : `${customFrom} – ${customTo}`;
  const exportDetails = async (format: "excel" | "pdf") => {
    setExporting(format); setExportError(false);
    try {
      const exportParams = new URLSearchParams(params); exportParams.set("page", "1"); exportParams.set("pageSize", "100");
      const first = await api<BillingAnalyticsReport>(`/api/reports/billing-payments?${exportParams}`); const expenses = [...first.expenses];
      for (let exportPage = 2; exportPage <= Math.ceil(first.total / 100); exportPage += 1) { exportParams.set("page", String(exportPage)); expenses.push(...(await api<BillingAnalyticsReport>(`/api/reports/billing-payments?${exportParams}`)).expenses); }
      const columns: TableExportColumn<BillExpense>[] = [
        { header: t("date"), value: (row) => row.date, width: 15 },
        { header: t("billCategoryName"), value: (row) => row.categoryName, width: 24 },
        { header: t("paymentMethod"), value: (row) => t(`billPaymentMethod_${row.method}`), width: 22 },
        { header: t("billingOriginalAmount"), value: (row) => money(row.amount, row.currency), width: 20 },
        { header: t("billingBaseAmount", { currency: first.baseCurrency }), value: (row) => money(row.baseAmount, row.baseCurrency), width: 22 },
        { header: t("notes"), value: (row) => row.note || "—", width: 36 },
      ];
      const options = { rows: expenses, columns, title: t("billingExpenseDetails"), period: `${bounds.from} – ${bounds.to}`, filename: `expense-details-${bounds.from}-${bounds.to}` };
      if (format === "excel") exportTableExcel(options); else exportTablePdf(options);
    } catch { setExportError(true); } finally { setExporting(null); }
  };
  return <div className="space-y-4">
    <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{t("analyticsBilling")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{t("billingAnalyticsReport")}</h2><p className="mt-1 text-sm text-muted">{t("billingAnalyticsDescription")}</p></header>
    <section className="card p-4"><div className="grid gap-3 lg:grid-cols-6">
      <label className="text-sm font-medium"><span className="mb-2 block">{t("reportPeriod")}</span><select className="input min-h-10 py-2" value={period} onChange={(e) => setPeriod(e.target.value as Period)}><option value="monthly">{t("reportPeriod_monthly")}</option><option value="yearly">{t("reportPeriod_yearly")}</option><option value="custom">{t("billingCustomRange")}</option></select></label>
      {period === "monthly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("reportSelectMonth")}</span><input className="input min-h-10 py-2" type="month" max={today.slice(0,7)} value={month} onChange={(e) => setMonth(e.target.value)}/></label>}
      {period === "yearly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("reportSelectYear")}</span><input className="input min-h-10 py-2" type="number" min="2000" max={today.slice(0,4)} value={year} onChange={(e) => setYear(e.target.value)}/></label>}
      {period === "custom" && <><label className="text-sm font-medium"><span className="mb-2 block">{t("fromDate")}</span><input className="input min-h-10 py-2" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}/></label><label className="text-sm font-medium"><span className="mb-2 block">{t("toDate")}</span><input className="input min-h-10 py-2" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}/></label></>}
      <label className="text-sm font-medium"><span className="mb-2 block">{t("billCategoryName")}</span><select className="input min-h-10 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">{t("billExpenseAllCategories")}</option>{data?.categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {period !== "custom" && <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-line px-3 text-sm"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)}/>{t("billingCompare")}</label>}
      {compare && period === "monthly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("billingCompareMonth")}</span><input className="input min-h-10 py-2" type="month" max={today.slice(0,7)} value={compareMonth} onChange={(e) => setCompareMonth(e.target.value)}/></label>}
      {compare && period === "yearly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("billingCompareYear")}</span><input className="input min-h-10 py-2" type="number" min="2000" max={today.slice(0,4)} value={compareYear} onChange={(e) => setCompareYear(e.target.value)}/></label>}
    </div><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><fieldset><legend className="mb-2 text-sm font-medium">{t("paymentMethod")}</legend><div className="flex flex-wrap gap-2">{(["cash","card","cheque"] as Method[]).map((method) => <label key={method} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${methods.includes(method) ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line text-muted"}`}><input className="sr-only" type="checkbox" checked={methods.includes(method)} onChange={() => toggleMethod(method)}/>{t(`billPaymentMethod_${method}`)}</label>)}</div></fieldset><button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-soft disabled:cursor-default disabled:opacity-50" disabled={filtersAreDefault} onClick={clearFilters}><RotateCcw size={16}/>{t("clearFilters")}</button></div></section>
    {query.error && <ErrorMessage message={t(errorKey(query.error))}/>} {exportError && <ErrorMessage message={t("reportExportFailed")}/>} {!methods.length && <ErrorMessage message={t("billingSelectMethod")}/>} 
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      [ReceiptText, "billingTotalExpenses", money(data?.summary.total, data?.baseCurrency ?? "USD"), "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"],
      [WalletCards, "billingExpenseCount", String(data?.summary.count ?? 0), "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"],
      [CreditCard, "billingAverageExpense", money(data?.summary.average, data?.baseCurrency ?? "USD"), "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"],
      [CalendarRange, "billingComparisonChange", data?.comparison?.changePercent == null ? "—" : `${Number(data.comparison.changePercent) >= 0 ? "+" : ""}${data.comparison.changePercent}%`, "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"],
    ].map(([Icon, label, value, color]) => { const C = Icon as typeof ReceiptText; return <div key={String(label)} className={`card flex items-center gap-3 p-4 ${color}`}><C size={22}/><div><p className="text-xs font-semibold">{t(String(label))}</p><p className="text-xl font-bold tabular-nums">{String(value)}</p></div></div>; })}</section>
    <section className="grid gap-4 xl:grid-cols-2"><div className="card p-4"><h3 className="font-semibold">{t("billingExpenseTrend")}</h3><p className="text-xs text-muted">{periodTitle}</p><div className="mt-4 flex h-52 items-end gap-1 overflow-x-auto border-b border-line px-1" aria-label={t("billingExpenseTrend")}>{data?.buckets.map((bucket) => <div key={bucket.key} className="flex h-full min-w-5 flex-1 items-end justify-center gap-px" title={`${bucket.key}: ${money(bucket.current, data.baseCurrency)}`}><div className="w-2 rounded-t bg-accent-solid" style={{ height: `${Math.max(Number(bucket.current) ? 3 : 0, Number(bucket.current) / maxTrend * 88)}%` }}/>{data.comparison && <div className="w-2 rounded-t bg-amber-400" style={{ height: `${Math.max(Number(bucket.comparison) ? 3 : 0, Number(bucket.comparison) / maxTrend * 88)}%` }}/>}<span className="absolute sr-only">{bucket.key}</span></div>)}</div><div className="mt-2 flex gap-4 text-xs text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded bg-accent-solid"/>{t("billingCurrentPeriod")}</span>{data?.comparison && <span><i className="mr-1 inline-block h-2 w-2 rounded bg-amber-400"/>{t("billingComparisonPeriod")}</span>}</div></div>
      <div className="card p-4"><h3 className="font-semibold">{t("billingByCategory")}</h3><div className="mt-4 space-y-3">{data?.categories.map((item, index) => <div key={item.categoryId}><div className="mb-1 flex justify-between gap-2 text-sm"><span>{item.categoryName} <small className="text-muted">({item.count})</small></span><strong>{money(item.total, data.baseCurrency)}</strong></div><div className="h-2 rounded-full bg-soft"><div className={`h-2 rounded-full ${colors[index % colors.length]}`} style={{ width: `${Number(item.total) / maxCategory * 100}%` }}/></div></div>)}{!data?.categories.length && <p className="py-12 text-center text-sm text-muted">{t("billingNoExpenses")}</p>}</div></div>
    </section>
    <section className="card p-4"><h3 className="font-semibold">{t("billingByMethod")}</h3><div className="mt-4 grid gap-4 md:grid-cols-3">{data?.methods.map((item, index) => <div key={item.method}><div className="mb-1 flex justify-between text-sm"><span>{t(`billPaymentMethod_${item.method}`)}</span><strong>{money(item.total, data.baseCurrency)}</strong></div><div className="h-3 rounded-full bg-soft"><div className={`h-3 rounded-full ${colors[(index + 2) % colors.length]}`} style={{ width: `${Number(item.total) / maxMethod * 100}%` }}/></div><p className="mt-1 text-xs text-muted">{t("billingTransactions", { count: item.count })}</p></div>)}</div></section>
    <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><h3 className="font-semibold">{t("billingExpenseDetails")}</h3><div className="flex gap-2"><button type="button" className="button min-h-9 px-3 py-2 text-xs" disabled={Boolean(exporting) || query.isPending || !data?.total} onClick={() => void exportDetails("excel")}><FileSpreadsheet size={16}/>{exporting === "excel" ? t("reportExporting") : t("reportExportExcel")}</button><button type="button" className="button min-h-9 px-3 py-2 text-xs" disabled={Boolean(exporting) || query.isPending || !data?.total} onClick={() => void exportDetails("pdf")}><FileDown size={16}/>{exporting === "pdf" ? t("reportExporting") : t("reportExportPdf")}</button></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr><th className="px-3 py-2">{sortHeader("date", t("date"))}</th><th className="px-3 py-2">{sortHeader("categoryName", t("billCategoryName"))}</th><th className="px-3 py-2">{sortHeader("method", t("paymentMethod"))}</th><th className="px-3 py-2 text-right">{t("billingOriginalAmount")}</th><th className="px-3 py-2 text-right">{sortHeader("baseAmount", t("billingBaseAmount", { currency: data?.baseCurrency ?? "USD" }))}</th><th className="px-3 py-2">{t("notes")}</th></tr></thead><tbody>{data?.expenses.map((row) => <tr key={row.id} className="border-t border-line"><td className="whitespace-nowrap px-3 py-2">{row.date}</td><td className="px-3 py-2 font-medium">{row.categoryName}</td><td className="px-3 py-2">{t(`billPaymentMethod_${row.method}`)}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(row.amount, row.currency)}</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{money(row.baseAmount, row.baseCurrency)}</td><td className="max-w-xs truncate px-3 py-2 text-muted">{row.note || "—"}</td></tr>)}{!query.isPending && !data?.expenses.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{t("billingNoExpenses")}</td></tr>}{query.isPending && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{t("loading")}</td></tr>}</tbody></table></div><Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} busy={query.isFetching} label={t("billingAnalyticsPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/></section>
  </div>;
}
