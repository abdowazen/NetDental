import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarDays, CreditCard, Pencil, Trash2 } from "lucide-react";
import { moneyCents, moneyString, treatmentNet, discountCents, noDiscount, type Treatment, type ChartData } from "@clinic/shared";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { NetPriceFields } from "./NetPriceFields";
import { errorKey } from "../../lib/api";
import { Pagination } from "../../components/Pagination";

export function TreatmentPlanPanel({ treatments, selected, canAdd, canModify, canDelete, onAdd, onNavigate,
  procedureInput, laboratoryInput, laboratoryDetails, busy, addDisabled, planDiscount, onUpdate, plan, onNewPlan, formatMoney,
  treatmentKind, onTreatmentKindChange }: {
  treatmentKind: "unplanned" | "planned";
  onTreatmentKindChange: (kind: "unplanned" | "planned") => void;
  plan: ChartData["plan"]; onNewPlan: () => void;
  treatments: Treatment[]; selected: number[]; canAdd: boolean; canModify: boolean; canDelete: boolean;
  onAdd: () => void; procedureInput: ReactNode; laboratoryInput?: ReactNode; laboratoryDetails?: ReactNode; busy: boolean; addDisabled: boolean;
  planDiscount: ChartData["planDiscount"];
  formatMoney: (amount: bigint) => string;
  onUpdate: (path: string, body: unknown, method?: string) => Promise<void>;
  onNavigate?: (tab: "session" | "payments" | "history") => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Treatment | null>(null);
  const [deleting, setDeleting] = useState<Treatment | null>(null);
  const [confirmNewPlan, setConfirmNewPlan] = useState(false);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [totalNetPrice, setTotalNetPrice] = useState("");
  const [totalEdit, setTotalEdit] = useState(false);
  const [totalVersion, setTotalVersion] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"tooth" | "procedure" | "status" | "price" | null>(null);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const active = treatments.filter((r) => !r.voidReason && r.status !== "cancelled");
  const sorted = sort ? [...active].sort((a, b) => {
    let comparison = 0;
    if (sort === "price") { const left = treatmentNet(a); const right = treatmentNet(b); comparison = left < right ? -1 : left > right ? 1 : 0; }
    else { const value = (row: Treatment) => sort === "tooth" ? row.teeth.map((item) => item.tooth).sort((x,y) => x-y).join(",") : sort === "procedure" ? `${row.code} ${row.name}`.toLocaleLowerCase() : row.status; comparison = value(a).localeCompare(value(b), undefined, { numeric: true }); }
    return direction === "asc" ? comparison : -comparison;
  }) : active;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages);
  const rows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [treatmentKind, treatments.length]);
  const subtotal = active.reduce((sum,r) => sum + treatmentNet(r), 0n);
  const planReduction = discountCents(subtotal, planDiscount?.discount);
  const net = subtotal - planReduction;
  const disabled = pending || busy;
  async function save(path: string, body: unknown, method?: string) {
    setPending(true); setError("");
    try { await onUpdate(path, body, method); setEditing(null); setDeleting(null); setTotalEdit(false); }
    catch (e) { setError(t(errorKey(e))); }
    finally { setPending(false); }
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    {confirmNewPlan && <ConfirmDialog title={t("planNewConfirmTitle")} message={t("planNewConfirmMessage")} confirmLabel={t("planNewConfirmAction")} tone="primary" pending={disabled}
      onCancel={() => setConfirmNewPlan(false)} onConfirm={() => { onNewPlan(); setConfirmNewPlan(false); }} />}
    {deleting && <ConfirmDialog title={t("planDeleteTitle")} message={t("planDeleteConfirm", { name: deleting.name })} confirmLabel={t("planDeleteAction")} pending={pending} error={error}
      onCancel={() => { setDeleting(null); setError(""); }}
      onConfirm={() => void save("treatments/" + deleting.id, {}, "DELETE")} />}
    {error && !deleting && <ErrorMessage message={error} />}
    <section className="card flex flex-1 flex-col">
      <div className="p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="font-semibold">{t("twTreatmentPlan")}</h2>
            {treatmentKind === "planned" && plan && <p className="mt-1 text-xs text-muted">{t("planNumber", { number: plan.number })}</p>}</div>
          {canAdd && <div className="flex w-36 shrink-0 flex-col gap-2">
            {treatmentKind === "planned" && <Button disabled={disabled} className="w-full !min-h-0 !justify-center !px-3 !py-2 text-xs" onClick={() => setConfirmNewPlan(true)}><Plus size={15}/>{t("planNew")}</Button>}
            <Button disabled={disabled || addDisabled} className="w-full !min-h-0 !justify-center !px-3 !py-2 text-xs" onClick={onAdd}><Plus size={15} />{t("twAddProcedure")}</Button>
          </div>}
        </div>
        {canAdd && <fieldset disabled={disabled} className={`grid items-end gap-3 ${laboratoryInput ? "grid-cols-[minmax(9rem,1.2fr)_minmax(0,1.65fr)_minmax(0,1.15fr)]" : "grid-cols-[minmax(9rem,1.25fr)_minmax(0,2.35fr)]"}`}>
          <Field id="treatment-kind" label={t("treatmentKind")}>
            <select id="treatment-kind" className="input" value={treatmentKind}
              onChange={(event) => { setTotalEdit(false); onTreatmentKindChange(event.target.value as "unplanned" | "planned"); }}>
              <option value="unplanned">{t("treatmentKind_unplanned")}</option>
              <option value="planned">{t("treatmentKind_planned")}</option>
            </select>
          </Field>
          {procedureInput}
          {laboratoryInput}
        </fieldset>}
        {canAdd && laboratoryDetails}
        <p className="mt-2 text-xs text-muted">{t("odSelected")}: {selected.join(", ") || t("odNone")}</p>
      </div>
      <div className="max-h-[420px] flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-soft text-muted"><tr>{([['tooth','twTooth'],['procedure','twProcedure'],['status','twStatus'],['price','twNetPrice']] as const).map(([column,key])=><th key={column} aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"} className="px-3 py-2 font-medium"><button type="button" className="inline-flex items-center gap-1" onClick={() => { setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setSort(column); setPage(1); }}>{t(key)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}<th className="px-3 py-2 font-medium">{t("patientActions")}</th></tr></thead>
          <tbody>{rows.map((r)=><Fragment key={r.id}><tr className="border-t border-line">
            <td className="px-3 py-2">{r.teeth.map((a)=>a.tooth).join(", ") || t("procedureScope_" + r.scope)}</td>
            <td className="px-3 py-2"><span className="font-medium">{r.name}</span><span className="mt-1 block text-[10px] text-muted">{r.code} · {r.date}</span>
              {r.notes && <p className="mt-1 whitespace-pre-wrap text-muted">{r.notes}</p>}</td>
            <td className="px-3 py-2"><span className="whitespace-nowrap rounded bg-accent-soft px-2 py-1 text-accent-ink">{t("odStatus_"+r.status)}</span></td>
            <td className="whitespace-nowrap px-3 py-2 text-right"><span>{formatMoney(treatmentNet(r))}</span>
</td>
            <td className="px-2 py-2"><div className="flex gap-1">
              {canModify && ["planned", "completed"].includes(r.status) && <button aria-label={t("planEdit")} title={t("planEdit")}
                disabled={disabled} className="rounded p-2 text-accent-ink hover:bg-accent-soft disabled:opacity-40"
                onClick={() => { setEditing(r); setDate(r.date); setNotes(r.notes); setError(""); }}><Pencil size={15} /></button>}
              {canDelete && <button aria-label={t("planDelete")} title={t("planDelete")} disabled={disabled}
                className="rounded p-2 text-danger-ink hover:bg-soft" onClick={() => { setDeleting(r); setError(""); }}><Trash2 size={15} /></button>}
            </div></td>
          </tr>{editing?.id === r.id && <tr><td colSpan={5} className="border-t border-line bg-soft p-3">
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save("treatments/" + r.id, { discount: r.discount ?? noDiscount, date, notes, expectedVersion: editing.version }); }}>
              <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
                <Field id="plan-row-date" label={t("odDate")}><input id="plan-row-date" className="input" type="date" required value={date} onChange={(e)=>setDate(e.target.value)} /></Field>
                <div className="col-span-2"><Field id="plan-row-notes" label={t("patientNotes")}><textarea id="plan-row-notes" className="input" rows={2} maxLength={4000} value={notes} onChange={(e)=>setNotes(e.target.value)} /></Field></div>
                <div className="col-span-2 flex gap-2"><Button>{t(pending ? "saving" : "save")}</Button><button type="button" onClick={()=>setEditing(null)}>{t("patientCancel")}</button></div>
              </fieldset>
            </form>
          </td></tr>}</Fragment>)}
          {!active.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("twNoPlan")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line"><Pagination page={safePage} pageSize={pageSize} total={sorted.length} busy={disabled} label={t("treatmentPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></div>
      <div className="border-t border-line px-4 py-3 text-sm">
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent-soft p-3 font-semibold text-accent-ink">
          <span>{t(treatmentKind === "planned" ? "planEstimatedTotal" : "treatmentTotal")}</span><span>{formatMoney(net)}</span>
          {canModify && (active.length > 0 || !!planDiscount) && <button aria-label={t("planEditTotal")} title={t("planEditTotal")} disabled={disabled} className="rounded p-2"
            onClick={() => { setTotalNetPrice(moneyString(net)); setTotalVersion(planDiscount?.id ?? null); setTotalEdit(true); setError(""); }}><Pencil size={16}/></button>}
        </div>
        {totalEdit && <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); const enteredNet = moneyCents(totalNetPrice); void save(treatmentKind === "planned" ? "plan-discount" : "unplanned-discount", { discount: { type: "amount", value: moneyString(subtotal - enteredNet) }, expectedId: totalVersion, planId: treatmentKind === "planned" ? plan?.id ?? null : null }); }}>
          <NetPriceFields id="treatment-total" base={subtotal} value={totalNetPrice} onChange={setTotalNetPrice} disabled={disabled} />
          <div className="flex flex-wrap gap-3"><Button disabled={disabled}>{t("save")}</Button><button type="button" disabled={disabled} onClick={()=>setTotalEdit(false)}>{t("patientCancel")}</button>
            <button type="button" disabled={disabled} className="text-accent-ink" onClick={()=>void save(treatmentKind === "planned" ? "plan-discount" : "unplanned-discount", { discount: noDiscount, expectedId: totalVersion, planId: treatmentKind === "planned" ? plan?.id ?? null : null })}>{t("discountRemove")}</button></div>
        </form>}
        {treatmentKind === "planned" && <p className="mt-2 text-xs text-muted">{t("planEstimateHint")}</p>}
      </div>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
      <div><h3 className="text-sm font-semibold">{t("twContinue")}</h3><p className="mt-1 text-xs text-muted">{t("twSessionHint")}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button className="!min-h-0 !px-3 !py-2 text-xs" onClick={()=>onNavigate?.("session")}><CalendarDays size={15}/>{t("planOpenSession")}</Button>
        <button className="inline-flex items-center gap-2 rounded-lg border border-accent-line px-3 py-2 text-xs text-accent-ink" onClick={()=>onNavigate?.("payments")}><CreditCard size={15}/>{t("payments")}</button>
      </div>
    </div>
    </section>
  </div>;
}
