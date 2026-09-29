import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileDown, FileSpreadsheet, UsersRound } from "lucide-react";
import { clinicDate, type NewPatientReport, type NewPatientReportPeriod, type NewPatientReportQuery } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { ErrorMessage } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { exportPatientsExcel, exportPatientsPdf, type PatientExportColumn } from "./exportPatients";

export function NewPatientsReportPage() {
  const { t, i18n } = useTranslation();
  const { roomId } = useWorkspace();
  const [period, setPeriod] = useState<NewPatientReportPeriod>("monthly");
  const [selectedDate, setSelectedDate] = useState(clinicDate());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<NewPatientReportQuery["sort"]>("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState(false);
  useEffect(() => { setPage(1); }, [period, selectedDate]);
  const query = useQuery({
    queryKey: ["reports", "new-patients", roomId, period, selectedDate, page, pageSize, sort, direction],
    queryFn: ({ signal }) => api<NewPatientReport>(`/api/reports/new-patients?${new URLSearchParams({ period, date: selectedDate, page: String(page), pageSize: String(pageSize), sort, direction })}`, { signal }),
  });
  const data = query.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  useEffect(() => { if (data && page > pages) setPage(pages); }, [data, page, pages]);
  const periodLabel = data ? data.from === data.to ? data.from : `${data.from} – ${data.to}` : "—";
  const registeredAt = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(value));
  const columns = [
    ["id", "patientFileId"], ["fullName", "patientFullName"], ["phone", "patientPhone"],
    ["gender", "patientGender"], ["firstVisit", "patientFirstVisit"], ["createdAt", "reportRegisteredAt"],
  ] as const;
  const exportReport = async (format: "excel" | "pdf") => {
    setExporting(format);
    setExportError(false);
    try {
      const exportPageSize = 100;
      const loadPage = (exportPage: number) => api<NewPatientReport>(`/api/reports/new-patients?${new URLSearchParams({ period, date: selectedDate, page: String(exportPage), pageSize: String(exportPageSize), sort, direction })}`);
      const first = await loadPage(1);
      const patients = [...first.patients];
      for (let exportPage = 2; exportPage <= Math.ceil(first.total / exportPageSize); exportPage += 1) {
        patients.push(...(await loadPage(exportPage)).patients);
      }
      const exportColumns: PatientExportColumn[] = [
        { header: t("patientFileId"), value: (patient) => patient.fileId, width: 14 },
        { header: t("patientFullName"), value: (patient) => patient.fullName, width: 28 },
        { header: t("patientPhone"), value: (patient) => patient.phone, width: 22 },
        { header: t("patientGender"), value: (patient) => t(`gender${patient.gender}`), width: 14 },
        { header: t("patientFirstVisit"), value: (patient) => patient.firstVisit, width: 18 },
        { header: t("reportRegisteredAt"), value: (patient) => registeredAt(patient.registeredAt), width: 24 },
      ];
      const filenameDate = selectedDate.slice(0, period === "yearly" ? 4 : period === "monthly" ? 7 : 10);
      const options = {
        rows: patients,
        columns: exportColumns,
        title: t("reportNewPatients"),
        period: first.from === first.to ? first.from : `${first.from} – ${first.to}`,
        filename: `new-patients-${period}-${filenameDate}`,
      };
      if (format === "excel") exportPatientsExcel(options);
      else exportPatientsPdf(options);
    } catch {
      setExportError(true);
    } finally {
      setExporting(null);
    }
  };
  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{t("reportsListing")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{t("reportNewPatients")}</h2><p className="mt-1 text-sm text-muted">{t("reportNewPatientsDescription")}</p></div>
      <div className="flex items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-accent-ink"><UsersRound size={22}/><div><p className="text-xs font-medium">{t("reportTotalRegistered")}</p><p className="text-2xl font-bold tabular-nums">{data?.total ?? "—"}</p></div></div>
    </header>

    <section className="card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><span className="mb-2 block text-sm font-medium">{t("reportPeriod")}</span><div className="flex rounded-lg border border-line bg-soft p-1" role="group" aria-label={t("reportPeriod")}>
          {(["daily", "monthly", "yearly"] as NewPatientReportPeriod[]).map((value) => <button key={value} type="button" aria-pressed={period === value} className={`rounded-md px-4 py-2 text-xs font-semibold ${period === value ? "bg-accent-solid text-white shadow-sm" : "text-muted hover:text-ink"}`} onClick={() => setPeriod(value)}>{t(`reportPeriod_${value}`)}</button>)}
        </div></div>
        <div><label htmlFor="report-date" className="mb-2 block text-sm font-medium">{t(period === "daily" ? "reportSelectDate" : period === "monthly" ? "reportSelectMonth" : "reportSelectYear")}</label>
          {period === "yearly" ? <input id="report-date" className="input min-h-10 w-32 py-2" type="number" min="2000" max={clinicDate().slice(0, 4)} value={selectedDate.slice(0, 4)} onChange={(event) => { if (/^\d{4}$/.test(event.target.value)) setSelectedDate(`${event.target.value}-01-01`); }}/>
            : <input id="report-date" className="input min-h-10 w-44 py-2" type={period === "monthly" ? "month" : "date"} max={period === "monthly" ? clinicDate().slice(0, 7) : clinicDate()} value={period === "monthly" ? selectedDate.slice(0, 7) : selectedDate} onChange={(event) => setSelectedDate(period === "monthly" ? `${event.target.value}-01` : event.target.value)}/>}</div>
        <div className="flex min-h-10 items-center gap-2 rounded-lg bg-soft px-3 text-sm text-muted"><CalendarDays size={16}/><span>{periodLabel}</span></div>
        <div className="ml-auto flex w-44 flex-col gap-2">
          <button type="button" className="button min-h-10 w-full px-4 py-2" disabled={Boolean(exporting) || query.isPending} onClick={() => void exportReport("excel")}><FileSpreadsheet size={17}/>{exporting === "excel" ? t("reportExporting") : t("reportExportExcel")}</button>
          <button type="button" className="button min-h-10 w-full px-4 py-2" disabled={Boolean(exporting) || query.isPending} onClick={() => void exportReport("pdf")}><FileDown size={17}/>{exporting === "pdf" ? t("reportExporting") : t("reportExportPdf")}</button>
        </div>
      </div>
    </section>

    {query.error && <ErrorMessage message={t(errorKey(query.error))}/>} 
    {exportError && <ErrorMessage message={t("reportExportFailed")}/>} 
    <section className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3"><h3 className="font-semibold">{t("reportPatientListing")}</h3><p className="text-xs text-muted">{periodLabel}</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr>{columns.map(([column, label]) => <th key={column} scope="col" aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"} className="whitespace-nowrap px-3 py-2 font-medium"><button type="button" className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{t(label)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead>
        <tbody>{data?.patients.map((patient) => <tr key={patient.id} className="border-t border-line hover:bg-soft/60"><td className="px-3 py-2 font-medium"><Link className="text-accent-ink hover:underline" to={`/patients/${patient.id}`}>{patient.fileId}</Link></td><td className="px-3 py-2">{patient.fullName}</td><td className="whitespace-nowrap px-3 py-2">{patient.phone}</td><td className="px-3 py-2">{t(`gender${patient.gender}`)}</td><td className="whitespace-nowrap px-3 py-2">{patient.firstVisit}</td><td className="whitespace-nowrap px-3 py-2">{registeredAt(patient.registeredAt)}</td></tr>)}
          {!query.isPending && !data?.patients.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{t("reportNoNewPatients")}</td></tr>}
          {query.isPending && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted" role="status">{t("loading")}</td></tr>}</tbody></table></div>
      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} busy={query.isFetching} label={t("reportNewPatientsPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
    </section>
  </div>;
}
