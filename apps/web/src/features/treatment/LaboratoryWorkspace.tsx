import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EllipsisVertical, Eye, PackageCheck } from "lucide-react";
import { allowed, clinicDate, labDetailsSchema, type LabDetailsInput, type LabRequest, type LabSummary } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Pagination } from "../../components/Pagination";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { FloatingDropdown } from "./FloatingDropdown";

type Sort = "procedure" | "laboratory" | "dueDate" | "status";
const empty: LabSummary = { requests: [], totalCost: "0.00" };
const detailsOf = (request: LabRequest): LabDetailsInput => ({ laboratory: request.laboratory, cost: request.cost, currency: request.currency, material: request.material, shade: request.shade, instructions: request.instructions, requestDate: request.requestDate, dueDate: request.dueDate });

export function LaboratoryWorkspace({ patientId, patientName }: { patientId?: number; patientName?: string }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { roomId } = useWorkspace(); const client = useQueryClient();
  const canView = allowed(user, "treatment", "view"); const canModify = allowed(user, "treatment", "modify");
  const [status, setStatus] = useState("all"); const [sort, setSort] = useState<Sort>("dueDate"); const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [detailRequest, setDetailRequest] = useState<LabRequest | null>(null); const [form, setForm] = useState<LabDetailsInput | null>(null); const [receiving, setReceiving] = useState<LabRequest | null>(null);
  const query = useQuery({ queryKey: ["laboratory", roomId, patientId], enabled: canView && !!patientId,
    queryFn: ({ signal }) => api<LabSummary>(`/api/laboratory/${patientId}`, { signal }) });
  const data = query.data ?? empty;
  useEffect(() => { setPage(1); }, [patientId, status]);
  const details = useMutation({ mutationFn: async () => {
    if (!patientId || !detailRequest || !form) return; const parsed = labDetailsSchema.parse(form);
    await api(`/api/laboratory/${patientId}/${detailRequest.id}`, { method: "PUT", body: JSON.stringify(parsed) });
  }, onSuccess: async () => { setDetailRequest(null); setForm(null); await client.invalidateQueries({ queryKey: ["laboratory", roomId, patientId] }); } });
  const requestLab = useMutation({ mutationFn: (request: LabRequest) => api(`/api/laboratory/${patientId}/${request.id}/status`, { method: "POST", body: JSON.stringify({ action: "requested", date: request.requestDate }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["laboratory", roomId, patientId] }); } });
  const receive = useMutation({ mutationFn: ({ id, date }: { id: string; date: string }) => api(`/api/laboratory/${patientId}/${id}/status`, { method: "POST", body: JSON.stringify({ action: "received", date }) }),
    onSuccess: async () => { setReceiving(null); await client.invalidateQueries({ queryKey: ["laboratory", roomId, patientId] }); } });
  const requests = useMemo(() => data.requests.filter((request) => status === "all" || request.status === status).sort((a, b) => {
    const value = (request: LabRequest) => sort === "procedure" ? `${request.procedureCode} ${request.procedureName}` : sort === "laboratory" ? request.laboratory : sort === "status" ? request.status : request.dueDate;
    const result = value(a).localeCompare(value(b), undefined, { numeric: true }); return direction === "asc" ? result : -result;
  }), [data.requests, status, sort, direction]);
  const pages = Math.max(1, Math.ceil(requests.length / pageSize)); const current = Math.min(page, pages); const rows = requests.slice((current - 1) * pageSize, current * pageSize);
  function openDetails(request: LabRequest) { setForm(detailsOf(request)); setDetailRequest(request); }
  if (!canView) return <div className="card p-8 text-center text-muted">{t("FORBIDDEN")}</div>;
  if (patientId && query.error) return <ErrorMessage message={t(errorKey(query.error))}/>;
  if (patientId && !query.data) return <p>{t("loading")}</p>;
  return <div className="space-y-3">
    {detailRequest && form && <DetailsDialog request={detailRequest} form={form} canModify={canModify} pending={details.isPending} error={details.error ? t(errorKey(details.error)) : ""}
      onField={(key, value) => setForm((old) => old ? { ...old, [key]: value } : old)} onCancel={() => { setDetailRequest(null); setForm(null); }} onSave={() => details.mutate()}/>} 
    {receiving && <ReceivedDialog request={receiving} pending={receive.isPending} error={receive.error ? t(errorKey(receive.error)) : ""} onCancel={() => setReceiving(null)} onConfirm={(date) => receive.mutate({ id: receiving.id, date })}/>} 
    <header><h1 className="text-2xl font-bold tracking-tight">{t("labTitle")}</h1><p className="text-xs text-muted">{patientId ? t("labPatient", { patient: patientName }) : t("paymentNoPatientSelected")}</p></header>
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="font-semibold">{t("labPatientRequests")}</h2><p className="text-xs text-muted">{t("labAllPlans")}</p></div>
        <select className="input w-auto" aria-label={t("labStatusFilter")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("labStatus_all")}</option>{["to_request","requested","received","voided"].map((value) => <option key={value} value={value}>{t(`labStatus_${value}`)}</option>)}</select></div>
      {requestLab.error && <div className="border-b border-line p-3"><ErrorMessage message={t(errorKey(requestLab.error))}/></div>}
      <div className="min-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr><th className="w-12 p-3" aria-label={t("patientActions")}/>
        {([['procedure','labRequest'],['laboratory','labLaboratory'],['dueDate','labDueDate'],['status','twStatus']] as const).map(([column,label]) => <th key={column} aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"} className="p-3"><button className="inline-flex gap-2" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{t(label)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}
      </tr></thead><tbody>{rows.map((request) => <tr key={request.id} className="action-menu-row border-t border-line hover:bg-soft">
        <td className="p-2"><FloatingDropdown closeOnAction label={t("labRowActions", { name: request.procedureName })} className="flex w-8 items-center justify-center rounded p-2 text-muted hover:bg-soft" trigger={<EllipsisVertical size={16}/>}><div className="flex flex-col gap-2"><button className="flex items-center gap-2 text-left text-accent-ink" onClick={() => openDetails(request)}><Eye size={16}/>{t("labShowDetails")}</button>{request.status === "to_request" && canModify && <button disabled={requestLab.isPending || !request.laboratory.trim()} title={!request.laboratory.trim() ? t("labLaboratoryRequired") : undefined} className="flex items-center gap-2 text-left text-accent-ink disabled:opacity-40" onClick={() => requestLab.mutate(request)}><PackageCheck size={16}/>{t("labMarkRequested")}</button>}{request.status === "requested" && canModify && <button className="flex items-center gap-2 text-left text-accent-ink" onClick={() => setReceiving(request)}><PackageCheck size={16}/>{t("labMarkReceived")}</button>}</div></FloatingDropdown></td>
        <td className="p-3"><strong>{request.procedureName}</strong><span className="block text-xs text-muted">{request.procedureCode} · {request.teeth.length ? request.teeth.map((tooth) => `${t("twTooth")} ${tooth}`).join(", ") : t("procedureScope_whole_mouth")}</span></td><td className="p-3">{request.laboratory || "—"}</td><td className="whitespace-nowrap p-3">{request.dueDate}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${request.status === "received" ? "bg-emerald-100 text-emerald-900" : request.status === "requested" ? "bg-blue-100 text-blue-900" : request.status === "voided" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{t(`labStatus_${request.status}`)}</span></td>
      </tr>)}{!rows.length && <tr><td colSpan={5} className="p-8 text-center text-muted">{patientId ? t("labNoRequests") : t("paymentSelectPatient")}</td></tr>}</tbody></table></div>
      <Pagination page={current} pageSize={pageSize} total={requests.length} busy={query.isFetching} label={t("labPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
    </section>
  </div>;
}

function DetailsDialog({ request, form, canModify, pending, error, onField, onCancel, onSave }: { request: LabRequest; form: LabDetailsInput; canModify: boolean; pending: boolean; error: string; onField: (key: keyof LabDetailsInput, value: string) => void; onCancel: () => void; onSave: () => void }) {
  const { t } = useTranslation(); const ref = useRef<HTMLDialogElement>(null); const editable = request.status === "to_request" && canModify;
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}><h2 className="text-xl font-semibold">{t("labRequestDetails")}</h2><p className="text-sm text-muted">{request.procedureName} · {request.teeth.join(", ")}</p>
    {error && <div className="mt-3"><ErrorMessage message={error}/></div>}<fieldset disabled={!editable || pending} className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field id="detail-laboratory" label={t("labLaboratory")}><input id="detail-laboratory" className="input" value={form.laboratory} onChange={(e) => onField("laboratory", e.target.value)}/></Field><div className="grid grid-cols-[1fr_7rem] gap-2"><Field id="detail-cost" label={t("labCost")}><input id="detail-cost" className="input" type="number" min="0" step="0.01" value={form.cost} onChange={(e) => onField("cost", e.target.value)}/></Field><Field id="detail-currency" label={t("paymentCurrency")}><select id="detail-currency" className="input" value={form.currency} onChange={(e) => onField("currency", e.target.value)}><option value="USD">USD</option><option value="LBP">LBP</option></select></Field></div>
      <Field id="detail-shade" label={t("labShade")}><input id="detail-shade" className="input" value={form.shade} onChange={(e) => onField("shade", e.target.value)}/></Field><Field id="detail-material" label={t("labMaterial")}><input id="detail-material" className="input" value={form.material} onChange={(e) => onField("material", e.target.value)}/></Field>
      <Field id="detail-request-date" label={t("labRequestDate")}><input id="detail-request-date" className="input" type="date" value={form.requestDate} onChange={(e) => onField("requestDate", e.target.value)}/></Field><Field id="detail-due-date" label={t("labDueDate")}><input id="detail-due-date" className="input" type="date" min={form.requestDate} value={form.dueDate} onChange={(e) => onField("dueDate", e.target.value)}/></Field>
      <div className="sm:col-span-2"><Field id="detail-instructions" label={t("labInstructions")}><textarea id="detail-instructions" className="input" rows={4} value={form.instructions} onChange={(e) => onField("instructions", e.target.value)}/></Field></div>
    </fieldset><div className="mt-4 rounded-lg bg-soft p-3 text-xs text-muted"><strong>{t("twStatus")}: {t(`labStatus_${request.status}`)}</strong>{request.receivedDate && <span> · {t("labReceivedOn", { date: request.receivedDate })}</span>}</div>
    <div className="mt-6 flex justify-end gap-2"><Button type="button" disabled={pending} onClick={onCancel}>{t("patientCancel")}</Button>{editable && <Button type="button" disabled={pending} onClick={onSave}>{t("labSaveDraft")}</Button>}</div>
  </dialog>;
}

function ReceivedDialog({ request, pending, error, onCancel, onConfirm }: { request: LabRequest; pending: boolean; error: string; onCancel: () => void; onConfirm: (date: string) => void }) {
  const { t } = useTranslation(); const ref = useRef<HTMLDialogElement>(null); const [date, setDate] = useState(clinicDate());
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}><span className="mb-4 inline-flex rounded-full bg-accent-soft p-3 text-accent-ink"><PackageCheck size={24}/></span><h2 className="text-xl font-semibold">{t("labMarkReceived")}</h2><p className="mt-2 text-sm text-muted">{request.procedureName} · {request.laboratory}</p>
    <div className="mt-4"><Field id="receive-lab-date" label={t("labReceivedDate")}><input id="receive-lab-date" className="input" type="date" min={request.requestDate} max={clinicDate()} value={date} onChange={(event) => setDate(event.target.value)}/></Field></div>{error && <div className="mt-3"><ErrorMessage message={error}/></div>}<div className="mt-6 flex justify-end gap-3"><Button type="button" disabled={pending} onClick={onCancel}>{t("patientCancel")}</Button><Button type="button" disabled={pending} onClick={() => onConfirm(date)}>{t(pending ? "saving" : "labMarkReceived")}</Button></div>
  </dialog>;
}
