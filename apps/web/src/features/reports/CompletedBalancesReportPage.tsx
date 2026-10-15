import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileDown, FileSpreadsheet, ReceiptText, Scale, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clinicDate, type CompletedBalanceRow, type CompletedBalancesQuery, type CompletedBalancesReport } from "@clinic/shared";
import { Pagination } from "../../components/Pagination";
import { ErrorMessage } from "../../components/ui";
import { api, errorKey } from "../../lib/api";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { exportTableExcel, exportTablePdf, type TableExportColumn } from "./exportPatients";

type Period = "monthly" | "yearly" | "custom";
const today = clinicDate();
const monthBounds = (month: string) => ({ from: `${month}-01`, to: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10) });
const yearBounds = (year: string) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

export function CompletedBalancesReportPage() {
  const { t, i18n } = useTranslation();
  const { roomId } = useWorkspace();
  const [period, setPeriod] = useState<Period>("monthly");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<CompletedBalancesQuery["sort"]>("remaining");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState(false);
  const bounds = period === "monthly" ? monthBounds(month) : period === "yearly" ? yearBounds(year) : { from: customFrom, to: customTo };
  useEffect(() => setPage(1), [period, month, year, customFrom, customTo]);
  const params = new URLSearchParams({ period, from: bounds.from, to: bounds.to, page: String(page), pageSize: String(pageSize), sort, direction });
  const query = useQuery({
    queryKey: ["reports", "completed-balances", roomId, params.toString()],
    enabled: bounds.to >= bounds.from,
    queryFn: ({ signal }) => api<CompletedBalancesReport>(`/api/reports/completed-balances?${params}`, { signal }),
  });
  const data = query.data;
  const currency = data?.baseCurrency ?? "USD";
  const money = (value: string | undefined) => new Intl.NumberFormat(i18n.language, { style: "currency", currency, maximumFractionDigits: currency === "LBP" ? 0 : 2 }).format(Number(value ?? 0));
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const sortHeader = (column: CompletedBalancesQuery["sort"], label: string) => <button type="button" className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{label}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>;
  const exportReport = async (format: "excel" | "pdf") => {
    setExporting(format); setExportError(false);
    try {
      const exportParams = new URLSearchParams(params); exportParams.set("page", "1"); exportParams.set("pageSize", "100");
      const first = await api<CompletedBalancesReport>(`/api/reports/completed-balances?${exportParams}`);
      const rows = [...first.rows];
      for (let exportPage = 2; exportPage <= Math.ceil(first.total / 100); exportPage += 1) {
        exportParams.set("page", String(exportPage)); rows.push(...(await api<CompletedBalancesReport>(`/api/reports/completed-balances?${exportParams}`)).rows);
      }
      const columns: TableExportColumn<CompletedBalanceRow>[] = [
        { header: t("patientFileId"), value: (row) => row.patientFileId, width: 14 },
        { header: t("patientFullName"), value: (row) => row.patientName, width: 30 },
        { header: t("patientPhone"), value: (row) => row.phone, width: 22 },
        { header: t("completedProcedures"), value: (row) => String(row.completedCount), width: 18 },
        { header: t("completedCharges"), value: (row) => money(row.completedCharges), width: 22 },
        { header: t("reportPeriodPayments"), value: (row) => money(row.payments), width: 22 },
        { header: t("remainingAmount"), value: (row) => money(row.remaining), width: 22 },
      ];
      const options = { rows, columns, title: t("reportCompletedBalances"), period: `${bounds.from} – ${bounds.to}`, filename: `completed-balances-${bounds.from}-${bounds.to}` };
      if (format === "excel") exportTableExcel(options); else exportTablePdf(options);
    } catch { setExportError(true); } finally { setExporting(null); }
  };
  return <div className="space-y-4">
    <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{t("analyticsClinical")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{t("reportCompletedBalances")}</h2><p className="mt-1 text-sm text-muted">{t("reportCompletedBalancesDescription")}</p></header>
    <section className="card p-4"><div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium"><span className="mb-2 block">{t("reportPeriod")}</span><select className="input min-h-10 py-2" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="monthly">{t("reportPeriod_monthly")}</option><option value="yearly">{t("reportPeriod_yearly")}</option><option value="custom">{t("billingCustomRange")}</option></select></label>
      {period === "monthly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("reportSelectMonth")}</span><input className="input min-h-10 min-w-48 py-2" type="month" max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)}/></label>}
      {period === "yearly" && <label className="text-sm font-medium"><span className="mb-2 block">{t("reportSelectYear")}</span><input className="input min-h-10 py-2" type="number" min="2000" max={today.slice(0, 4)} value={year} onChange={(event) => setYear(event.target.value)}/></label>}
      {period === "custom" && <><label className="text-sm font-medium"><span className="mb-2 block">{t("fromDate")}</span><input className="input min-h-10 py-2" type="date" max={customTo} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)}/></label><label className="text-sm font-medium"><span className="mb-2 block">{t("toDate")}</span><input className="input min-h-10 py-2" type="date" min={customFrom} max={today} value={customTo} onChange={(event) => setCustomTo(event.target.value)}/></label></>}
    </div></section>
    {query.error && <ErrorMessage message={t(errorKey(query.error))}/>} {exportError && <ErrorMessage message={t("reportExportFailed")}/>} 
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      [UsersRound, "patients", String(data?.total ?? 0), "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"],
      [ReceiptText, "completedCharges", money(data?.totals.completedCharges), "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"],
      [ReceiptText, "reportPeriodPayments", money(data?.totals.payments), "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"],
      [Scale, "remainingAmount", money(data?.totals.remaining), "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"],
    ].map(([Icon, label, value, color]) => { const C = Icon as typeof UsersRound; return <div key={String(label)} className={`card flex items-center gap-3 p-4 ${color}`}><C size={22}/><div><p className="text-xs font-semibold">{t(String(label))}</p><p className="text-xl font-bold tabular-nums">{String(value)}</p></div></div>; })}</section>
    <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><h3 className="font-semibold">{t("completedBalanceDetails")}</h3><p className="text-xs text-muted">{t("paymentBaseCurrency", { currency })}</p></div><div className="flex gap-2"><button type="button" className="button min-h-9 px-3 py-2 text-xs" disabled={Boolean(exporting) || query.isPending || !data?.total} onClick={() => void exportReport("excel")}><FileSpreadsheet size={16}/>{exporting === "excel" ? t("reportExporting") : t("reportExportExcel")}</button><button type="button" className="button min-h-9 px-3 py-2 text-xs" disabled={Boolean(exporting) || query.isPending || !data?.total} onClick={() => void exportReport("pdf")}><FileDown size={16}/>{exporting === "pdf" ? t("reportExporting") : t("reportExportPdf")}</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr><th className="px-3 py-2">{sortHeader("patientName", t("patientFullName"))}</th><th className="px-3 py-2">{sortHeader("phone", t("patientPhone"))}</th><th className="px-3 py-2 text-right">{sortHeader("completedCount", t("completedProcedures"))}</th><th className="px-3 py-2 text-right">{sortHeader("completedCharges", t("completedCharges"))}</th><th className="px-3 py-2 text-right">{sortHeader("payments", t("reportPeriodPayments"))}</th><th className="px-3 py-2 text-right">{sortHeader("remaining", t("remainingAmount"))}</th></tr></thead>
        <tbody>{data?.rows.map((row) => <tr key={row.patientId} className="border-t border-line"><td className="px-3 py-2"><Link className="font-medium text-accent-ink hover:underline" to={`/patients/${row.patientId}`}>{row.patientName}</Link><span className="block text-xs text-muted">{row.patientFileId}</span></td><td className="whitespace-nowrap px-3 py-2">{row.phone}</td><td className="px-3 py-2 text-right tabular-nums">{row.completedCount}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(row.completedCharges)}</td><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{money(row.payments)}</td><td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-danger-ink">{money(row.remaining)}</td></tr>)}{query.isPending && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{t("loading")}</td></tr>}{!query.isPending && !data?.rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{t("completedBalancesEmpty")}</td></tr>}</tbody></table></div>
      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} busy={query.isFetching} label={t("completedBalancesPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
    </section>
  </div>;
}
