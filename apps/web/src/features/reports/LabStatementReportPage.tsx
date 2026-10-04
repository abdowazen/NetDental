import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { clinicDate, type LabStatementQuery, type LabStatementReport, type LaboratoryCatalogList } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { ErrorMessage, Field } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useWorkspace } from "../auth/WorkspaceProvider";

export function LabStatementReportPage() {
  const { t } = useTranslation(); const { roomId } = useWorkspace(); const today = clinicDate();
  const [laboratoryId, setLaboratoryId] = useState(""); const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<LabStatementQuery["sort"]>("requestDate"); const [direction, setDirection] = useState<"asc" | "desc">("desc");
  useEffect(() => setPage(1), [laboratoryId, status, from, to]);
  const laboratories = useQuery({ queryKey: ["laboratories", roomId, "report-filter"], queryFn: ({ signal }) => api<LaboratoryCatalogList>("/api/laboratories?pageSize=100&sort=name&direction=asc", { signal }) });
  const params = new URLSearchParams({ status, from, to, page: String(page), pageSize: String(pageSize), sort, direction }); if (laboratoryId) params.set("laboratoryId", laboratoryId);
  const query = useQuery({ queryKey: ["reports", "lab-statement", roomId, laboratoryId, status, from, to, page, pageSize, sort, direction], enabled: Boolean(from && to && to >= from), queryFn: ({ signal }) => api<LabStatementReport>(`/api/reports/lab-statement?${params}`, { signal }) });
  const columns = [["laboratory","labLaboratory"],["patient","patientFullName"],["procedure","twProcedure"],["requestDate","labRequestDate"],["status","twStatus"],["cost","laboratoryCost"]] as const;
  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-ink">{t("reportsListing")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{t("reportLabStatement")}</h2><p className="mt-1 text-sm text-muted">{t("reportLabStatementDescription")}</p></div><div className="flex gap-2">{(["USD","LBP"] as const).map((currency) => <div key={currency} className="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-accent-ink"><p className="text-xs font-medium">{t("reportLabPayable", { currency })}</p><p className="text-xl font-bold tabular-nums">{query.data?.payableTotals.find((total) => total.currency === currency)?.amount ?? "0.00"}</p></div>)}</div></header>
    <section className="card p-4"><div className="grid items-end gap-3 md:grid-cols-4">
      <Field id="lab-report-laboratory" label={t("labLaboratory")}><select id="lab-report-laboratory" className="input" value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)}><option value="">{t("reportAllLaboratories")}</option>{(laboratories.data?.laboratories ?? []).map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}</select></Field>
      <Field id="lab-report-status" label={t("twStatus")}><select id="lab-report-status" className="input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("labStatus_all")}</option>{["to_request","requested","received","voided"].map((value) => <option key={value} value={value}>{t(`labStatus_${value}`)}</option>)}</select></Field>
      <Field id="lab-report-from" label={t("sessionDateFrom")}><input id="lab-report-from" className="input" type="date" max={to} value={from} onChange={(event) => setFrom(event.target.value)}/></Field>
      <Field id="lab-report-to" label={t("sessionDateTo")}><input id="lab-report-to" className="input" type="date" min={from} max={today} value={to} onChange={(event) => setTo(event.target.value)}/></Field>
    </div></section>
    {(query.error || laboratories.error) && <ErrorMessage message={t(errorKey(query.error ?? laboratories.error))}/>} 
    <section className="card overflow-hidden"><div className="border-b border-line px-4 py-3"><div className="flex items-center gap-2"><FlaskConical size={18} className="text-accent-ink"/><h3 className="font-semibold">{t("reportLabActivity")}</h3></div><p className="text-xs text-muted">{t("reportLabPayableHint")}</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr>{columns.map(([column,label]) => <th key={column} className="whitespace-nowrap p-3" aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"}><button className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{t(label)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}</tr></thead><tbody>{query.data?.rows.map((row) => <tr key={row.id} className="border-t border-line"><td className="p-3 font-medium">{row.laboratory}</td><td className="p-3"><Link className="text-accent-ink hover:underline" to={`/patients/${row.patientId}`}>{row.patientName}</Link><span className="block text-xs text-muted">{row.patientFileId}</span></td><td className="p-3"><span className="font-medium">{row.procedureName}</span><span className="block text-xs text-muted">{row.procedureCode}{row.teeth.length ? ` · ${row.teeth.join(", ")}` : ""}</span></td><td className="whitespace-nowrap p-3">{row.requestDate}</td><td className="p-3"><span className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">{t(`labStatus_${row.status}`)}</span></td><td className="whitespace-nowrap p-3 text-right font-medium">{row.cost} {row.currency}</td></tr>)}{!query.isPending && !query.data?.rows.length && <tr><td colSpan={6} className="p-8 text-center text-muted">{t("reportLabNoRows")}</td></tr>}{query.isPending && <tr><td colSpan={6} className="p-8 text-center text-muted">{t("loading")}</td></tr>}</tbody></table></div><Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} busy={query.isFetching} label={t("reportLabPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/></section>
  </div>;
}
