import { Fragment, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarDays, CreditCard, Pencil, Trash2 } from "lucide-react";
import { clinicDate, moneyCents, moneyString, treatmentNet, discountCents, noDiscount, type Discount, type Treatment, type ChartData } from "@clinic/shared";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DiscountFields } from "./DiscountFields";
import { errorKey } from "../../lib/api";

export function TreatmentPlanPanel({ treatments, selected, canAdd, canModify, canDelete, onAdd, onNavigate,
  procedureInput, busy, addDisabled, planDiscount, onUpdate, plan, onNewPlan }: {
  plan: ChartData["plan"]; onNewPlan: () => void;
  treatments: Treatment[]; selected: number[]; canAdd: boolean; canModify: boolean; canDelete: boolean;
  onAdd: () => void; procedureInput: ReactNode; busy: boolean; addDisabled: boolean;
  planDiscount: ChartData["planDiscount"];
  onUpdate: (path: string, body: unknown, method?: string) => Promise<void>;
  onNavigate?: (tab: "session" | "payments" | "history") => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Treatment | null>(null);
  const [deleting, setDeleting] = useState<Treatment | null>(null);
  const [rowDiscount, setRowDiscount] = useState<Discount>(noDiscount);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [totalDiscount, setTotalDiscount] = useState<Discount>(noDiscount);
  const [totalEdit, setTotalEdit] = useState(false);
  const [totalVersion, setTotalVersion] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = treatments.filter((r) => !r.voidReason && r.status !== "cancelled");
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
    {deleting && <ConfirmDialog message={t("planDeleteConfirm", { name: deleting.name })} pending={pending} error={error}
      onCancel={() => { setDeleting(null); setError(""); }}
      onConfirm={() => void save("treatments/" + deleting.id, { reason: t("planDeleteReason"), date: clinicDate() }, "DELETE")} />}
    {error && !deleting && <ErrorMessage message={error} />}
    <section className="card flex flex-1 flex-col">
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><h2 className="font-semibold">{t("twTreatmentPlan")}</h2>
            {plan && <p className="mt-1 text-xs text-muted">{t("planNumber", { number: plan.number })}</p>}</div>
          {canAdd && <Button disabled={disabled} className="!min-h-0 !px-3 !py-2 text-xs" onClick={onNewPlan}><Plus size={15}/>{t("planNew")}</Button>}
        </div>
        {canAdd && <fieldset disabled={disabled} className="flex items-center gap-2">
          {procedureInput}
          <Button disabled={disabled || addDisabled} className="shrink-0 !min-h-0 !px-3 !py-2 text-xs" onClick={onAdd}><Plus size={15} />{t("twAddProcedure")}</Button>
        </fieldset>}
        <p className="mt-2 text-xs text-muted">{t("odSelected")}: {selected.join(", ") || t("odNone")}</p>
      </div>
      <div className="max-h-[420px] flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-soft text-muted"><tr>{["twTooth","twProcedure","twStatus","twNetPrice","patientActions"].map((key)=><th key={key} className="px-3 py-2 font-medium">{t(key)}</th>)}</tr></thead>
          <tbody>{active.map((r)=><Fragment key={r.id}><tr className="border-t border-line">
            <td className="px-3 py-2">{r.teeth.map((a)=>a.tooth).join(", ") || t("procedureScope_whole_mouth")}</td>
            <td className="px-3 py-2"><span className="font-medium">{r.name}</span><span className="mt-1 block text-[10px] text-muted">{r.code} · {r.date}</span>
              {r.notes && <p className="mt-1 whitespace-pre-wrap text-muted">{r.notes}</p>}</td>
            <td className="px-3 py-2"><span className="whitespace-nowrap rounded bg-accent-soft px-2 py-1 text-accent-ink">{t("odStatus_"+r.status)}</span></td>
            <td className="whitespace-nowrap px-3 py-2 text-right"><span>{moneyString(treatmentNet(r))} USD</span>
</td>
            <td className="px-2 py-2"><div className="flex gap-1">
              {canModify && <button aria-label={t("planEdit")} title={t(r.status === "planned" ? "planEdit" : "planEditLocked")}
                disabled={disabled || r.status !== "planned"} className="rounded p-2 text-accent-ink hover:bg-accent-soft disabled:opacity-40"
                onClick={() => { setEditing(r); setRowDiscount(r.discount ?? noDiscount); setDate(r.date); setNotes(r.notes); setError(""); }}><Pencil size={15} /></button>}
              {canDelete && <button aria-label={t("planDelete")} title={t("planDelete")} disabled={disabled}
                className="rounded p-2 text-danger-ink hover:bg-soft" onClick={() => { setDeleting(r); setError(""); }}><Trash2 size={15} /></button>}
            </div></td>
          </tr>{editing?.id === r.id && <tr><td colSpan={5} className="border-t border-line bg-soft p-3">
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save("treatments/" + r.id, { discount: rowDiscount, date, notes, expectedVersion: editing.version }); }}>
              <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><DiscountFields id="plan-row" base={moneyCents(r.price)} discount={rowDiscount} onChange={setRowDiscount} /></div>
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
      <div className="border-t border-line px-4 py-3 text-sm">
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent-soft p-3 font-semibold text-accent-ink">
          <span>{t("planEstimatedTotal")}</span><span>{moneyString(net)} USD</span>
          {canModify && <button aria-label={t("planEditTotal")} title={t("planEditTotal")} disabled={disabled} className="rounded p-2"
            onClick={() => { setTotalDiscount(planDiscount?.discount ?? noDiscount); setTotalVersion(planDiscount?.id ?? null); setTotalEdit(true); setError(""); }}><Pencil size={16}/></button>}
        </div>
        {totalEdit && <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void save("plan-discount", { discount: totalDiscount, expectedId: totalVersion, planId: plan?.id ?? null }); }}>
          <DiscountFields id="plan" base={subtotal} discount={totalDiscount} onChange={setTotalDiscount} disabled={disabled} />
          <p className="text-xs text-muted">{t("discountPlanHint")}</p>
          <div className="flex flex-wrap gap-3"><Button disabled={disabled}>{t("save")}</Button><button type="button" disabled={disabled} onClick={()=>setTotalEdit(false)}>{t("patientCancel")}</button>
            <button type="button" disabled={disabled} className="text-accent-ink" onClick={()=>void save("plan-discount", { discount: noDiscount, expectedId: totalVersion, planId: plan?.id ?? null })}>{t("discountRemove")}</button></div>
        </form>}
        <p className="mt-2 text-xs text-muted">{t("planEstimateHint")}</p>
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
