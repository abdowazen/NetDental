import { Fragment, lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EllipsisVertical, ChevronDown } from "lucide-react";
import { z, ZodError } from "zod";
import {
  allTeeth, permanentTeeth, primaryTeeth, toothInfo, validSurfaces, surfaceLabel, dentitions,
  convertCurrency, latestToothStates, treatmentSchema, treatmentNet, moneyString,
  treatmentStatusSchema, voidSchema, clinicDate, allowed, labShades,
  type Treatment, type ChartData, type ToothAssociation, type Dentition, type ProcedureList,
  type LaboratoryCatalog, type LaboratoryCatalogList,
} from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import type { CameraView } from "./OdontogramCanvas";
const ChartCanvas = lazy(() => import("./OdontogramCanvas"));
import { FloatingDropdown } from "./FloatingDropdown";
import { ProcedureAutocomplete } from "./ProcedureAutocomplete";
import { TreatmentPlanPanel } from "./TreatmentPlanPanel";
import { procedureVisuals, type ProcedureVisual } from "./procedure-visuals";
const actionColors: Record<string, string> = {
  planned: "bg-amber-100 text-amber-900",
  in_progress: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-slate-200 text-slate-800",
  voided: "bg-red-100 text-red-900",
};
function recordStatus(record: Treatment) {
  return record.voidReason ? "voided" : record.status;
}
type TabNavigate = (tab: "plan" | "session" | "payments" | "laboratory" | "history") => void;
type TreatmentKind = "unplanned" | "planned";

export default function OdontogramWorkspace({ patientId, historyOnly = false, showHistory = false, onNavigate }: { patientId?: number; historyOnly?: boolean; showHistory?: boolean; onNavigate?: TabNavigate }) {
  const { t } = useTranslation();
  const { roomId } = useWorkspace();
  const query = useQuery({
    queryKey: ["odontogram", roomId, patientId, showHistory ? "history" : "current"],
    enabled: !!patientId,
    staleTime: 15_000,
    queryFn: ({ signal }) => api<ChartData>(`/api/odontogram/${patientId}${showHistory ? "?history=true" : ""}`, { signal }),
  });
  if (!patientId) return <ClinicalChart key="preview" patientId={null} data={{ dentition: null, toothEvents: [], findings: [], treatments: [] }} historyOnly={historyOnly} showHistory={showHistory} onNavigate={onNavigate} />;
  if (query.error) return <><ErrorMessage message={t(errorKey(query.error))} /><Button onClick={() => void query.refetch()}>{t("retry")}</Button></>;
  if (!query.data) return <p role="status">{t("loading")}</p>;
  return <ClinicalChart key={`${roomId}-${patientId}`} patientId={patientId} data={query.data} historyOnly={historyOnly} showHistory={showHistory} onNavigate={onNavigate} />;
}

function ClinicalChart({ patientId, data, historyOnly, showHistory, onNavigate }: { patientId: number | null; data: ChartData; historyOnly: boolean; showHistory: boolean; onNavigate?: TabNavigate }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const client = useQueryClient();
  const create = !!patientId && allowed(user, "treatment", "create");
  const modify = !!patientId && allowed(user, "treatment", "modify");
  const baseCurrency = data.baseCurrency ?? "USD";
  const formatMoney = (amount: bigint) => {
    if (baseCurrency === "LBP" && !data.effectiveRate) return `— ${baseCurrency}`;
    return `${convertCurrency(moneyString(amount), "USD", baseCurrency, data.effectiveRate ?? null)} ${baseCurrency}`;
  };
  const [sessionSearch, setSessionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sessionSort, setSessionSort] = useState<"procedure" | "tooth" | "status" | "date" | "price">("date");
  const [sessionDirection, setSessionDirection] = useState<"asc" | "desc">("desc");
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState(10);
  const [historyPlan, setHistoryPlan] = useState("all");
  const [groupHistory, setGroupHistory] = useState(true);
  const [treatmentKind, setTreatmentKind] = useState<TreatmentKind>("unplanned");
  const [filter, setFilter] = useState<Dentition>(data.dentition ?? "adult");
  const [arch, setArch] = useState("both");
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<ToothAssociation[]>([]);
  const [roots, setRoots] = useState(true);
  const [gums, setGums] = useState(false);
  const [view, setView] = useState<CameraView>("front");
  const [reset, setReset] = useState(0);
  const [procedure, setProcedure] = useState<ProcedureList["procedures"][number] | undefined>();
  const [laboratory, setLaboratory] = useState<LaboratoryCatalog | undefined>();
  const [labDetails, setLabDetails] = useState({ material: "", shade: "", instructions: "" });
  const [formKey, setFormKey] = useState(0);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [correction, setCorrection] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; type: "clinical" | "treatment"; status: string; version?: number } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionDate, setActionDate] = useState(clinicDate());
  useEffect(() => {
    const timer = setTimeout(() => setCatalogQuery(catalogSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [catalogSearch]);
  useEffect(() => {
    setSessionSearch("");
    setStatusFilter([]);
    setDateFrom("");
    setDateTo("");
    setSessionPage(1);
  }, [showHistory]);
  useEffect(() => { setSessionPage(1); }, [sessionSearch, statusFilter, dateFrom, dateTo, historyPlan, groupHistory]);
  const catalog = useQuery({
    queryKey: ["procedures", "list", roomId, "chart", catalogQuery],
    enabled: create && allowed(user, "actsProcedures") && !historyOnly,
    queryFn: ({ signal }) => api<ProcedureList>(`/api/procedures?${new URLSearchParams({ q: catalogQuery, pageSize: "100", sort: "name", direction: "asc" })}`, { signal }),
  });
  const laboratories = useQuery({
    queryKey: ["laboratories", roomId, "treatment-active", procedure?.id],
    enabled: create && !!procedure?.requiresLab && allowed(user, "laboratoriesCatalog") && !historyOnly,
    queryFn: ({ signal }) => api<LaboratoryCatalogList>(`/api/laboratories?${new URLSearchParams({ pageSize: "100", sort: "name", direction: "asc", procedureId: String(procedure!.id) })}`, { signal }),
  });
  const mutation = useMutation({
    mutationFn: ({ path, body, method = "POST" }: { path: string; body: unknown; method?: string }) =>
      api(`/api/odontogram/${patientId}/${path}`, { method, body: JSON.stringify(body) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["odontogram", roomId, patientId] });
      resetForm(); setNotice(t("odSaved")); setAction(null);
    },
    onError: (e) => { setNotice(""); setError(t(errorKey(e))); },
  });
  function send(schema: z.ZodTypeAny, input: unknown, path: string, method = "POST") {
    setNotice(""); setError("");
    try { mutation.mutate({ path, body: schema.parse(input), method }); }
    catch (e) {
      const key = e instanceof ZodError ? e.issues[0].message : "VALIDATION_ERROR";
      setError(t(i18n.exists(key) ? key : "VALIDATION_ERROR"));
    }
  }
  const states = latestToothStates(data.toothEvents);
  const visible = (filter === "adult" ? permanentTeeth : filter === "pediatric" ? primaryTeeth : allTeeth)
    .filter((id) => arch === "both" || toothInfo(id).upper === (arch === "upper"));
  const ids = selected.map((s) => s.tooth);
  const indicators: Record<number, ProcedureVisual[]> = {};
  for (const record of (data.sessions ?? data.treatments).filter((r) => !r.voidReason && r.status !== "cancelled")) {
    const visual = procedureVisuals[record.category ?? "other"];
    for (const association of record.teeth) {
      const list = indicators[association.tooth] ??= [];
      if (!list.some((v) => v.category === visual.category)) list.push(visual);
    }
  }
  if (procedure && procedure.scope !== "whole_mouth")
    for (const id of ids) indicators[id] = [procedureVisuals[procedure.category], ...(indicators[id] ?? []).filter((v) => v.category !== procedure.category)];
  function resetForm() {
    setProcedure(undefined); setLaboratory(undefined); setLabDetails({ material: "", shade: "", instructions: "" }); setCatalogSearch(""); setCatalogQuery("");
    setCorrection(null); setError(""); setNotice(""); setFormKey((n) => n + 1);
  }
  function changeSelection(next: ToothAssociation[]) {
    if (mutation.isPending) return;
    resetForm(); setSelected(next.map((a) => ({ tooth: a.tooth, surfaces: [], role: "target" })));
  }
  function select(id: number) {
    changeSelection(selected.some((r) => r.tooth === id) ? selected.filter((r) => r.tooth !== id) :
      [...(multi ? selected : []), { tooth: id, surfaces: [], role: "target" }]);
  }
  const recorded = [...new Set([...data.findings.filter((f) => !f.voidReason).flatMap((f) => f.teeth.map((r) => r.tooth)),
    ...(data.sessions ?? data.treatments).filter((r) => !r.voidReason && r.status !== "cancelled").flatMap((r) => r.teeth.map((a) => a.tooth))])];
  const unavailable = [...states.values()].filter((r) => ["missing", "extracted", "exfoliated", "unerupted"].includes(r.state)).map((r) => r.tooth);
  const busy = mutation.isPending;
  function addProcedure() {
    const standalone = !!correction && data.sessions?.some((r) => r.id === correction && r.planId === null);
    if (!procedure) { setError(t("odSelectProcedure")); return; }
    if (procedure.requiresLab && !laboratory) { setError(t("laboratoryRequired")); return; }
    if (!["multiple_teeth", "whole_mouth"].includes(procedure.scope) && !selected.length) { setError(t("treatmentSelectTooth")); return; }
    const procedureTeeth = procedure.scope === "whole_mouth" ||
      (procedure.scope === "multiple_teeth" && selected.length < 2) ? [] : selected;
    const unplanned = treatmentKind === "unplanned" && !correction;
    send(treatmentSchema, { procedureId: procedure.id, planId: standalone || unplanned ? null : data.plan?.id ?? null,
      mode: ["multiple_teeth", "whole_mouth"].includes(procedure.scope) ? "group" : "independent",
      teeth: procedureTeeth, date: clinicDate(), notes: "", price: procedure.defaultPrice,
      ...(laboratory ? { laboratoryId: laboratory.id, labMaterial: labDetails.material, labShade: labDetails.shade, labInstructions: labDetails.instructions } : {}),
      ...(correction ? { replacesId: correction } : {}) }, standalone ? "sessions" : unplanned ? "completed-treatments" : "treatments");
  }
  async function updatePlan(path: string, body: unknown, method = "PUT") {
    await api("/api/odontogram/" + patientId + "/" + path, { method, body: JSON.stringify(body) });
    await client.invalidateQueries({ queryKey: ["odontogram", roomId, patientId] });
  }
  function openAction(id: string, type: "clinical" | "treatment", status: string, version?: number) {
    setAction({ id, type, status, version }); setActionNotes(""); setActionDate(clinicDate()); setError(""); setNotice("");
  }
  const searchTerm = sessionSearch.trim().toLocaleLowerCase();
  const planNumbers = new Map((data.plans ?? []).map((plan) => [plan.id, plan.number]));
  const historySource = showHistory ? data.historyTreatments ?? data.sessions ?? data.treatments : data.sessions ?? data.treatments;
  const historyPlanRanges = new Map<string, { from: string; to: string }>();
  if (showHistory) for (const record of historySource) {
    const key = record.planId ?? "standalone";
    const range = historyPlanRanges.get(key);
    historyPlanRanges.set(key, range
      ? { from: record.date < range.from ? record.date : range.from, to: record.date > range.to ? record.date : range.to }
      : { from: record.date, to: record.date });
  }
  const filteredSessions = historySource.filter((record) =>
    (!showHistory || historyPlan === "all" || (historyPlan === "standalone" ? record.planId === null : record.planId === historyPlan)) &&
    (!statusFilter.length || statusFilter.includes(recordStatus(record))) &&
    (!dateFrom || record.date >= dateFrom) && (!dateTo || record.date <= dateTo) &&
    (!searchTerm || record.teeth.some((a) => String(a.tooth).includes(searchTerm)) ||
      record.code.toLocaleLowerCase().includes(searchTerm) || record.name.toLocaleLowerCase().includes(searchTerm)));
  const sessionRecords = [...filteredSessions].sort((a, b) => {
    if (showHistory && groupHistory) {
      const planComparison = (planNumbers.get(b.planId ?? "") ?? -1) - (planNumbers.get(a.planId ?? "") ?? -1);
      if (planComparison) return planComparison;
    }
    let comparison = 0;
    if (sessionSort === "price") {
      const left = treatmentNet(a); const right = treatmentNet(b);
      comparison = left < right ? -1 : left > right ? 1 : 0;
    } else {
      const value = (record: Treatment) => sessionSort === "procedure" ? `${record.code} ${record.name}`.toLocaleLowerCase()
        : sessionSort === "tooth" ? record.teeth.map((tooth) => tooth.tooth).sort((x, y) => x - y).join(",")
        : sessionSort === "status" ? recordStatus(record) : record.date;
      comparison = value(a).localeCompare(value(b), undefined, { numeric: true });
    }
    return sessionDirection === "asc" ? comparison : -comparison;
  });
  const sessionPages = Math.max(1, Math.ceil(sessionRecords.length / sessionPageSize));
  const safeSessionPage = Math.min(sessionPage, sessionPages);
  const sessionRows = sessionRecords.slice((safeSessionPage - 1) * sessionPageSize, safeSessionPage * sessionPageSize);
  const historyPlanLabel = (planId: string | null | undefined) => planId ? t("planNumber", { number: planNumbers.get(planId) ?? "—" }) : t("historyWithoutPlan");
  const historyPlanRange = (planId: string | null | undefined) => historyPlanRanges.get(planId ?? "standalone");
  const historyGroupLabel = (planId: string | null | undefined) => {
    const range = historyPlanRange(planId);
    return range ? `${historyPlanLabel(planId)} · ${t("sessionDateFrom")}: ${range.from} · ${t("sessionDateTo")}: ${range.to}` : historyPlanLabel(planId);
  };
  function associations(rows: ToothAssociation[], scope: string) {
    return rows.length ? rows.map((a) => `${a.tooth}${a.surfaces.length ? " (" + a.surfaces.map((s) => t("odSurface_" + surfaceLabel(a.tooth, s))).join(", ") + ")" : ""} · ${t("odRole_" + a.role)}`).join("; ") : t("procedureScope_" + scope);
  }
  const associationControls = !!selected.length && <details className="rounded-lg border border-line p-2">
          <summary className="text-sm font-semibold">{t("odSurfaces")}</summary>
          <p className="my-2 text-xs text-muted">{t("odSurfacesHint")}</p>
          {selected.map((association) => <fieldset key={association.tooth} className="mb-2 rounded border border-line p-2">
            <legend className="text-xs font-semibold">{t("odTooth", { id: association.tooth })}</legend>
            <div className="flex flex-wrap gap-2 text-xs">{validSurfaces(association.tooth).map((surface) => <label key={surface}>
              <input type="checkbox" checked={association.surfaces.includes(surface)} onChange={(e) => setSelected((old) => old.map((r) => r.tooth === association.tooth ? { ...r, surfaces: e.target.checked ? [...r.surfaces, surface] : r.surfaces.filter((s) => s !== surface) } : r))} /> {t("odSurface_" + surfaceLabel(association.tooth, surface))}
            </label>)}</div>
            <label className="mt-2 block text-xs">{t("odRole")} <select className="rounded border border-line bg-surface p-1" value={association.role} onChange={(e) => setSelected((old) => old.map((r) => r.tooth === association.tooth ? { ...r, role: e.target.value as ToothAssociation["role"] } : r))}>
              {["target","abutment","pontic"].map((role) => <option key={role} value={role}>{t("odRole_" + role)}</option>)}
            </select></label>
          </fieldset>)}
        </details>;
  return <div className="space-y-3">
    {!patientId && <p className="text-sm text-muted">{t(historyOnly ? "twChoosePatient" : "odPreview")}</p>}
    {error && <ErrorMessage message={error} />}
    {notice && <p role="status" className="text-sm text-accent-ink">{notice}</p>}
    {action && <form className="card space-y-3 p-4" onSubmit={(e) => {
      e.preventDefault();
      if (action.status === "voided") send(voidSchema, { reason: actionNotes, date: actionDate }, `${action.type === "clinical" ? "clinical" : "treatments"}/${action.id}/void`);
      else send(treatmentStatusSchema, { status: action.status, date: actionDate, notes: actionNotes, expectedVersion: action.version }, `treatments/${action.id}/status`);
    }}>
      <h3 className="font-semibold">{t("odStatus_" + action.status)} · {action.id.slice(0, 8)}</h3>
      <p className="text-xs text-muted">{t("odAuditHint")}</p>
      <Field id="action-date" label={t("odDate")}><input className="input" id="action-date" type="date" required value={actionDate} onChange={(e) => setActionDate(e.target.value)} /></Field>
      <Field id="action-notes" label={t("odReason")}><textarea className="input" id="action-notes" required={["voided", "cancelled"].includes(action.status)} maxLength={2000} value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} /></Field>
      <div className="flex gap-2"><Button disabled={busy}>{t("save")}</Button><Button type="button" disabled={busy} onClick={() => setAction(null)}>{t("patientCancel")}</Button></div>
    </form>}
    {!historyOnly && <div className="grid items-stretch gap-3 xl:grid-cols-[1.3fr_1fr]">
      <section className="card min-w-0 space-y-3 p-3">
        <h2 className="font-semibold">{t("twOdontogram")}</h2>
        <Suspense fallback={<p>{t("loading")}</p>}><ChartCanvas teeth={visible} selected={ids} mixed={filter === "mixed"} roots={roots} gums={gums} absent={unavailable} recorded={recorded} indicators={indicators} view={view} reset={reset} onSelect={select}
          onReset={() => { setView("front"); setArch("both"); setReset((n) => n + 1); }}
          displayControl={<div role="group" aria-label={t("odDisplay")} className="flex rounded-lg border border-line bg-surface p-0.5 shadow-sm">
            {dentitions.map((d) => <button type="button" key={d} aria-pressed={filter === d}
              className={filter === d ? "rounded-md bg-accent-solid px-3 py-1 text-xs font-medium text-white" : "rounded-md px-3 py-1 text-xs text-muted hover:bg-soft"}
              onClick={() => setFilter(d)}>{t("odDentition_" + d)}</button>)}
          </div>} /></Suspense>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label>{t("odArch")} <select aria-label={t("odArch")} className="rounded border border-line bg-surface p-1" value={arch} onChange={(e) => setArch(e.target.value)}>{["both","upper","lower"].map((a) => <option key={a} value={a}>{t("odArch_" + a)}</option>)}</select></label>
          <label>{t("odCameraView")} <select aria-label={t("odCameraView")} className="rounded border border-line bg-surface p-1" value={view} onChange={(e) => {
            const next = e.target.value as CameraView; setView(next); setArch(next === "front" ? "both" : next); setReset((n) => n + 1);
          }}>{(["front","upper","lower"] as const).map((v) => <option key={v} value={v}>{t("odView_" + v)}</option>)}</select></label>
          <label><input type="checkbox" checked={roots} onChange={(e) => setRoots(e.target.checked)} /> {t("odRoots")}</label>
          <label><input type="checkbox" checked={gums} onChange={(e) => setGums(e.target.checked)} /> {t("odGums")}</label>
        </div>
        {procedure && <p className="text-xs text-accent-ink">{t("planVisualPreview")}</p>}
        {ids.some((id) => indicators[id]?.length) && <div className="text-xs text-muted" aria-label={t("planIndicators")}>{ids.map((id) => indicators[id]?.length ? <p key={id}>{id}: {indicators[id].map((v) => t("procedureCategory_" + v.category)).join(", ")}</p> : null)}</div>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label><input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); changeSelection(e.target.checked ? selected : selected.slice(-1)); }} /> {t("odMultiSelect")}</label>
          <button className="text-accent-ink" onClick={() => changeSelection([])}>{t("odClearSelection")}</button>
          <span role="status">{t("odSelected")}: {ids.join(", ") || t("odNone")}</span>
        </div>
        {ids.some((id) => !visible.includes(id)) && <p className="text-xs text-muted">{t("odHiddenSelection")}</p>}
        <div className="max-h-52 space-y-2 overflow-y-auto" aria-label={t("odToothPicker")}>
          {[false, true].filter((primary) => filter === "mixed" || primary === (filter === "pediatric")).map((primary) => <div key={String(primary)}>
            <h3 className="text-xs font-semibold">{t(primary ? "odPrimary" : "odPermanent")}</h3>
            {["upper", "lower"].filter((a) => arch === "both" || a === arch).map((a) => {
              const teeth = visible.filter((id) => toothInfo(id).primary === primary && toothInfo(id).upper === (a === "upper"))
                .sort((x,y) => {
                  const ix = toothInfo(x), iy = toothInfo(y);
                  return (ix.right ? -ix.position : ix.position) - (iy.right ? -iy.position : iy.position);
                });
              return <div key={a} className="mt-1">
                <div className="flex justify-between text-[10px] text-muted"><span>{t("odPatientRight")}</span><span>{t("odArch_" + a)}</span><span>{t("odPatientLeft")}</span></div>
                <div className={`grid gap-0.5 ${primary ? "grid-cols-[repeat(10,minmax(0,1fr))]" : "grid-cols-[repeat(16,minmax(0,1fr))]"}`}>{teeth.map((id) => <button key={id} type="button" aria-pressed={ids.includes(id)} aria-label={t("odTooth", { id }) + " · " + t("odState_" + (states.get(id)?.state ?? "unrecorded"))} className={`min-w-0 rounded border px-0 py-1 text-[10px] ${ids.includes(id) ? "border-accent-solid bg-accent-soft font-bold text-accent-ink" : "border-line"}`} onClick={() => select(id)}>
                  {ids.includes(id) ? "✓ " : ""}{id}{recorded.includes(id) ? " •" : ""}<span className="block truncate text-[8px]">{t("odState_" + (states.get(id)?.state ?? "unrecorded"))}</span>
                </button>)}</div>
              </div>;
            })}
          </div>)}
        </div>
        {associationControls}

      </section>
      <div className="flex min-w-0 flex-col gap-3">
      <TreatmentPlanPanel
        treatmentKind={treatmentKind}
        onTreatmentKindChange={(kind) => { setTreatmentKind(kind); resetForm(); }}
        treatments={treatmentKind === "planned" ? data.treatments : (data.sessions ?? []).filter((record) => record.planId === null)}
        selected={ids} canAdd={create}
        canModify={modify} canDelete={!!patientId && allowed(user, "treatment", "delete")}
        plan={data.plan} onNewPlan={() => mutation.mutate({ path: "plans", body: { expectedPlanId: data.plan?.id ?? null } })}
        planDiscount={treatmentKind === "planned" ? data.planDiscount : data.unplannedDiscount} onUpdate={updatePlan} busy={busy} formatMoney={formatMoney}
        addDisabled={!procedure || (procedure.requiresLab && !laboratory)}
        onAdd={() => addProcedure()} onNavigate={onNavigate}
        procedureInput={<div className="min-w-0">
          <label className="mb-2 block text-sm font-medium" htmlFor="record-procedure">{t("twProcedure")}</label>
          <ProcedureAutocomplete key={formKey} value={procedure} search={catalogSearch}
            onSearch={(value) => { setCatalogSearch(value); setProcedure(undefined); setLaboratory(undefined); setLabDetails({ material: "", shade: "", instructions: "" }); }}
            options={catalog.data?.procedures.filter((p) => p.active) ?? []}
            loading={catalog.isFetching || catalogSearch.trim() !== catalogQuery}
            onSelect={(value) => { setProcedure(value); setLaboratory(undefined); setLabDetails({ material: "", shade: "", instructions: "" }); }} />
        </div>}
        laboratoryDetails={procedure?.requiresLab ? <section className="mt-3 rounded-xl border border-accent-line bg-accent-soft/40 p-3">
          <div className="mb-3"><h3 className="text-sm font-semibold">{t("treatmentLaboratoryDetails")}</h3><p className="text-xs text-muted">{laboratory ? t("treatmentLaboratoryDetailsHint", { laboratory: laboratory.name }) : t("treatmentSelectLaboratoryHint")}</p></div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="sm:col-span-2"><Field id="record-laboratory" label={`${t("labLaboratory")} *`}><select id="record-laboratory" className="input" required aria-required="true" disabled={laboratories.isFetching} value={laboratory?.id ?? ""} onChange={(event) => { const selectedLaboratory = laboratories.data?.laboratories.find((item) => item.id === Number(event.target.value)); setLaboratory(selectedLaboratory); setLabDetails(selectedLaboratory ? { material: selectedLaboratory.material, shade: selectedLaboratory.shade, instructions: selectedLaboratory.instructions } : { material: "", shade: "", instructions: "" }); }}><option value="">{t("selectLaboratory")}</option>{(laboratories.data?.laboratories ?? []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
            <Field id="treatment-lab-material" label={t("labMaterial")}><input id="treatment-lab-material" className="input" disabled={!laboratory} maxLength={100} value={labDetails.material} onChange={(event) => setLabDetails((old) => ({ ...old, material: event.target.value }))}/></Field>
            <Field id="treatment-lab-shade" label={t("labShade")}><select id="treatment-lab-shade" className="input" disabled={!laboratory} value={labDetails.shade} onChange={(event) => setLabDetails((old) => ({ ...old, shade: event.target.value }))}><option value="">—</option>{labShades.map((shade) => <option key={shade}>{shade}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field id="treatment-lab-instructions" label={t("labInstructions")}><textarea id="treatment-lab-instructions" className="input" disabled={!laboratory} rows={2} maxLength={2000} value={labDetails.instructions} onChange={(event) => setLabDetails((old) => ({ ...old, instructions: event.target.value }))}/></Field></div>
          </div>
        </section> : undefined} />
      {(catalog.error || laboratories.error) && <ErrorMessage message={t(errorKey(catalog.error ?? laboratories.error))} />}
      {create && !allowed(user, "actsProcedures") && <p className="text-xs text-muted">{t("odCatalogPermission")}</p>}
      {procedure && <p className="text-xs text-muted">{t("procedureScope_" + procedure.scope)} ? {t(["multiple_teeth", "whole_mouth"].includes(procedure.scope) ? "odGroupHint" : "odIndependentHint", { count: ids.length })}</p>}
      {correction && <p className="text-xs">{t("odCorrecting")}: {correction}<button onClick={() => setCorrection(null)} className="ml-2 underline">{t("patientCancel")}</button></p>}
      </div>
    </div>}
    {historyOnly && <><section className="card overflow-hidden">
      <div className={`grid items-end gap-2 px-4 pb-4 pt-3 sm:grid-cols-2 ${showHistory ? "lg:grid-cols-[minmax(10rem,1.35fr)_minmax(8rem,.9fr)_auto_minmax(8rem,.8fr)_minmax(8rem,.72fr)_minmax(8rem,.72fr)]" : "lg:grid-cols-[minmax(12rem,1fr)_minmax(9rem,.65fr)_minmax(8rem,.55fr)_minmax(8rem,.55fr)]"}`}>
        <div className="min-w-0"><Field id="session-search" label={t("sessionSearch")}><input id="session-search" className="input !min-h-10 w-full !py-2" type="search" value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} /></Field></div>
        {showHistory && <><div className="min-w-0"><Field id="history-plan" label={t("historyPlanFilter")}><select id="history-plan" className="input !min-h-10 w-full !py-2" value={historyPlan} onChange={(event) => setHistoryPlan(event.target.value)}><option value="all">{t("historyAll")}</option>{(data.plans ?? []).map((plan) => <option key={plan.id} value={plan.id}>{t("planNumber", { number: plan.number })}</option>)}<option value="standalone">{t("historyWithoutPlan")}</option></select></Field></div><label className="flex h-10 whitespace-nowrap items-center gap-2 text-sm"><input type="checkbox" checked={groupHistory} onChange={(event) => setGroupHistory(event.target.checked)}/>{t("historyGroupByPlan")}</label></>}
        <div className="min-w-0"><span className="mb-2 block text-sm font-medium">{t("twStatus")}</span>
          <FloatingDropdown label={t("sessionFilterStatus")} className="input !min-h-10 !py-2 flex w-full items-center justify-between gap-2"
            trigger={<><span>{statusFilter.length ? statusFilter.map((status) => t("odStatus_" + status)).join(", ") : t("sessionAllStatuses")}</span><ChevronDown size={16}/></>}>
            <div className="space-y-2">
              <button type="button" className="text-accent-ink" onClick={() => setStatusFilter([])}>{t("sessionAllStatuses")}</button>
              {Object.keys(actionColors).map((status) => <label key={status} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={statusFilter.includes(status)} onChange={(e) => setStatusFilter((old) => e.target.checked ? [...old, status] : old.filter((s) => s !== status))}/>{t("odStatus_" + status)}
              </label>)}
            </div>
          </FloatingDropdown>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
          <div className="min-w-0"><Field id="session-from" label={t("sessionDateFrom")}><input id="session-from" className="input !min-h-10 w-full min-w-0 !py-2" type="date" max={dateTo || undefined} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field></div>
          <div className="min-w-0"><Field id="session-to" label={t("sessionDateTo")}><input id="session-to" className="input !min-h-10 w-full min-w-0 !py-2" type="date" min={dateFrom || undefined} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field></div>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr>
        {!showHistory && <th className="w-12 p-3" aria-label={t("patientActions")} />}
        {([['procedure','twProcedure'],['tooth','twTooth'],['status','twStatus'],['date','odDate'],['price','twNetPrice']] as const).map(([column, label]) => <th key={column} scope="col" aria-sort={sessionSort === column ? sessionDirection === "asc" ? "ascending" : "descending" : "none"} className="whitespace-nowrap p-3 font-medium"><button type="button" className="inline-flex items-center gap-2 rounded" onClick={() => { setSessionDirection(sessionSort === column && sessionDirection === "asc" ? "desc" : "asc"); setSessionSort(column); setSessionPage(1); }}>{t(label)}<span aria-hidden="true">{sessionSort === column ? sessionDirection === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}
      </tr></thead><tbody>
        {!sessionRecords.length && <tr><td colSpan={showHistory ? 5 : 6} className="p-5 text-center text-muted">{t("sessionNoResults")}</td></tr>}
        {sessionRows.map((record, index) => <Fragment key={record.id}>{showHistory && groupHistory && (index === 0 || sessionRows[index - 1].planId !== record.planId) && <tr className="border-t border-line bg-accent-soft"><td colSpan={5} className="px-3 py-2 text-xs font-semibold text-accent-ink">{historyGroupLabel(record.planId)}</td></tr>}<tr className="action-menu-row border-t border-line align-top">
          {!showHistory && <td className="p-3">
            {((modify && !record.voidReason) || (create && record.voidReason)) && <FloatingDropdown closeOnAction label={t("sessionRowActions", { name: record.name })}
              className="flex w-8 items-center justify-center rounded p-2 text-muted hover:bg-soft" trigger={<EllipsisVertical size={16}/>}>
              <div className="flex flex-col gap-2">
            {modify && !record.voidReason && ["planned","in_progress"].includes(record.status) && (record.status === "planned" ? ["in_progress","completed","cancelled"] : ["completed","cancelled"]).map((status) => <button key={status} className="text-left text-accent-ink" disabled={busy} onClick={() => openAction(record.id, "treatment", status, record.version)}>{t("odStatus_" + status)}</button>)}
            {!record.voidReason && record.requiresLab && <button className="text-left text-accent-ink" onClick={() => onNavigate?.("laboratory")}>{t("labOpenRequest")}</button>}
            {modify && !record.voidReason && <button disabled={busy} className="text-left text-danger-ink" onClick={() => openAction(record.id, "treatment", "voided")}>{t("odVoid")}</button>}
            {create && record.voidReason && <button className="text-left text-accent-ink" onClick={() => { resetForm(); setCorrection(record.id); setSelected(record.teeth); setMulti(record.teeth.length > 1); onNavigate?.("plan"); }}>{t("odCorrection")}</button>}
              </div>
            </FloatingDropdown>}
          </td>}
          <td className="p-3"><strong>{record.code} · {record.name}</strong>          </td>
          <td className="max-w-xs p-3">{associations(record.teeth, record.scope)}</td>
          <td className="p-3"><span className={"inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " + (actionColors[recordStatus(record)] ?? actionColors.planned)}>{t("odStatus_" + recordStatus(record))}</span></td>
          <td className="p-3">{record.date}</td><td className="whitespace-nowrap p-3">{formatMoney(treatmentNet(record))}</td>
        </tr></Fragment>)}
      </tbody></table></div>
      <Pagination page={safeSessionPage} pageSize={sessionPageSize} total={sessionRecords.length} busy={busy} label={t("sessionPagination")} onPageChange={setSessionPage} onPageSizeChange={(size) => { setSessionPageSize(size); setSessionPage(1); }} />
    </section></>}
  </div>;
}
