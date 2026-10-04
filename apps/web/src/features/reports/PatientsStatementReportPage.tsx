import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreditCard, ReceiptText, Scale, Search, X } from "lucide-react";
import { clinicDate, type Patient, type PatientList, type PatientStatementQuery, type PatientStatementReport, type PatientStatementRow } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { ErrorMessage, Field } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useWorkspace } from "../auth/WorkspaceProvider";

export function PatientsStatementReportPage() {
  const { t, i18n } = useTranslation(); const { roomId } = useWorkspace(); const today = clinicDate();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null); const [patientSearch, setPatientSearch] = useState("");
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState(""); const [patientOpen, setPatientOpen] = useState(false);
  const [activity, setActivity] = useState<PatientStatementQuery["activity"]>("all");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<PatientStatementQuery["sort"]>("date"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  useEffect(() => { const timer = setTimeout(() => setDebouncedPatientSearch(patientSearch.trim()), 250); return () => clearTimeout(timer); }, [patientSearch]);
  useEffect(() => setPage(1), [selectedPatient?.id, activity, from, to]);
  const patients = useQuery({
    queryKey: ["patients", "statement-search", roomId, debouncedPatientSearch], enabled: patientOpen,
    queryFn: ({ signal }) => api<PatientList>(`/api/patients?${new URLSearchParams({ q: debouncedPatientSearch, pageSize: "30", sort: "fullName", direction: "asc" })}`, { signal }),
  });
  const params = new URLSearchParams({ activity, from, to, page: String(page), pageSize: String(pageSize), sort, direction });
  if (selectedPatient) params.set("patientId", String(selectedPatient.id));
  const query = useQuery({
    queryKey: ["reports", "patients-statement", roomId, selectedPatient?.id, activity, from, to, page, pageSize, sort, direction],
    enabled: Boolean(from && to && to >= from), queryFn: ({ signal }) => api<PatientStatementReport>(`/api/reports/patients-statement?${params}`, { signal }),
  });
  const currency = query.data?.baseCurrency ?? "USD";
  const money = (value: string) => new Intl.NumberFormat(i18n.language, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const description = (row: PatientStatementRow) => row.entryKind === "discount"
    ? t(row.planNumber == null ? "reportUnplannedDiscount" : "reportPlanDiscount", { plan: row.planNumber })
    : row.entryKind === "payment" ? t(`paymentMethod_${row.method ?? "cash"}`) : row.description;
  const cards = [
    ["reportOpeningBalance", query.data?.openingBalance ?? "0.00", Scale, "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"],
    ["reportPeriodCharges", query.data?.periodCharges ?? "0.00", ReceiptText, "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950"],
    ["reportPeriodPayments", query.data?.periodPayments ?? "0.00", CreditCard, "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"],
    ["reportClosingBalance", query.data?.closingBalance ?? "0.00", Scale, "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"],
  ] as const;
  const columns = [["patient","patientFullName"],["date","odDate"],["description","paymentDescription"],["charge","paymentType_charge"],["payment","paymentType_payment"]] as const;
  return <div className="space-y-4">
    <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{t("reportsListing")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{t("reportPatientsStatement")}</h2><p className="mt-1 text-sm text-muted">{t("reportPatientsStatementDescription")}</p></header>
    <section className="card p-4"><div className="grid items-end gap-3 lg:grid-cols-[minmax(16rem,1.4fr)_minmax(10rem,.7fr)_minmax(10rem,.7fr)_minmax(10rem,.7fr)]">
      <Field id="patient-statement-patient" label={t("twPatient")}><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-muted" size={17} aria-hidden="true"/><input id="patient-statement-patient" role="combobox" aria-autocomplete="list" aria-expanded={patientOpen} aria-controls="patient-statement-options" autoComplete="off" className="input pl-10 pr-10" value={patientOpen ? patientSearch : selectedPatient ? `${selectedPatient.fullName} · ${selectedPatient.fileId}` : ""} placeholder={t("reportAllPatients")} onFocus={() => { setPatientSearch(""); setPatientOpen(true); }} onBlur={() => setPatientOpen(false)} onChange={(event) => { setPatientSearch(event.target.value); setPatientOpen(true); }}/>{selectedPatient && !patientOpen && <button type="button" className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-soft hover:text-ink" aria-label={t("reportClearPatient")} onMouseDown={(event) => event.preventDefault()} onClick={() => setSelectedPatient(null)}><X size={18}/></button>}
        {patientOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"><ul id="patient-statement-options" role="listbox" className="max-h-60 overflow-y-auto"><li role="option" aria-selected={!selectedPatient} className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent-soft" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedPatient(null); setPatientOpen(false); }}>{t("reportAllPatients")}</li>{(patients.data?.patients ?? []).map((patient) => <li key={patient.id} role="option" aria-selected={patient.id === selectedPatient?.id} className="cursor-pointer px-3 py-2 text-sm hover:bg-accent-soft" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedPatient(patient); setPatientOpen(false); }}><span className="font-medium">{patient.fullName}</span><span className="ml-2 text-xs text-muted">{patient.fileId} · {patient.phone}</span></li>)}</ul>{patients.isFetching && <p className="border-t border-line px-3 py-2 text-xs text-muted">{t("loading")}</p>}{!patients.isFetching && patients.data?.total === 0 && <p className="border-t border-line px-3 py-2 text-xs text-muted">{t("patientEmpty")}</p>}</div>}
      </div></Field>
      <Field id="patient-statement-activity" label={t("paymentActivityFilter")}><select id="patient-statement-activity" className="input" value={activity} onChange={(event) => setActivity(event.target.value as PatientStatementQuery["activity"])}><option value="all">{t("paymentActivity_all")}</option><option value="charge">{t("paymentActivity_charge")}</option><option value="payment">{t("paymentActivity_payment")}</option></select></Field>
      <Field id="patient-statement-from" label={t("sessionDateFrom")}><input id="patient-statement-from" className="input" type="date" max={to} value={from} onChange={(event) => setFrom(event.target.value)}/></Field>
      <Field id="patient-statement-to" label={t("sessionDateTo")}><input id="patient-statement-to" className="input" type="date" min={from} max={today} value={to} onChange={(event) => setTo(event.target.value)}/></Field>
    </div></section>
    {(query.error || patients.error) && <ErrorMessage message={t(errorKey(query.error ?? patients.error))}/>} 
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon,color]) => <section key={label} className={`card flex items-center gap-3 border p-4 ${color}`}><span className="rounded-lg bg-white/70 p-2 shadow-sm dark:bg-black/20"><Icon size={20} aria-hidden="true"/></span><div className="min-w-0"><h3 className="truncate text-xs font-semibold">{t(label)}</h3><p className="truncate text-xl font-bold tabular-nums">{money(value)}</p></div></section>)}</div>
    <section className="card overflow-hidden"><div className="border-b border-line px-4 py-3"><h3 className="font-semibold">{t("paymentAccountActivity")}</h3><p className="text-xs text-muted">{t("paymentBaseCurrency", { currency })}</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr>{columns.map(([column,label]) => <th key={column} className={`whitespace-nowrap p-3 ${column === "charge" || column === "payment" ? "text-right" : ""}`} aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"}><button className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{t(label)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead><tbody>{query.data?.rows.map((row) => <tr key={`${row.type}-${row.id}`} className="border-t border-line"><td className="p-3"><Link className="font-medium text-accent-ink hover:underline" to={`/patients/${row.patientId}`}>{row.patientName}</Link><span className="block text-xs text-muted">{row.patientFileId}</span></td><td className="whitespace-nowrap p-3 text-xs">{formatDate(row.date)}</td><td className="p-3"><span className="font-medium">{description(row)}</span>{row.entryKind === "payment" && <span className="block text-xs text-muted">{row.originalAmount} {row.originalCurrency}{row.description ? ` · ${row.description}` : ""}</span>}<span className="block text-xs text-muted">{row.planNumber == null ? t("reportUnplanned") : t("reportPlanNumber", { plan: row.planNumber })}</span></td><td className="whitespace-nowrap p-3 text-right tabular-nums">{row.type === "charge" ? money(row.baseAmount) : "—"}</td><td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{row.type === "payment" ? money(row.baseAmount) : "—"}</td></tr>)}{query.isPending && <tr><td colSpan={5} className="p-8 text-center text-muted">{t("loading")}</td></tr>}{!query.isPending && !query.data?.rows.length && <tr><td colSpan={5} className="p-8 text-center text-muted">{t("reportPatientStatementEmpty")}</td></tr>}</tbody><tfoot><tr className="border-t border-line bg-soft/70"><td colSpan={4} className="p-3 font-semibold">{t("reportClosingBalance")}</td><td className="p-3 text-right text-lg font-bold tabular-nums text-danger-ink">{money(query.data?.closingBalance ?? "0.00")}</td></tr></tfoot></table></div><Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} busy={query.isFetching} label={t("reportPatientsStatementPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/></section>
  </div>;
}
