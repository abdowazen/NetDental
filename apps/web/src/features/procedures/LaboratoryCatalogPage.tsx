import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  allowed, laboratoryCatalogSchema, laboratoryRateSchema,
  type LaboratoryCatalog, type LaboratoryCatalogInput, type LaboratoryCatalogList,
  type LaboratoryRate, type LaboratoryRateInput, type ProcedureList,
} from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";

const blank = (): LaboratoryCatalogInput => ({ name: "", defaultCost: "0.00", turnaroundDays: 0, material: "", shade: "", instructions: "", active: true });

export function LaboratoryCatalogPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [editing, setEditing] = useState<LaboratoryCatalog | null | undefined>(undefined);
  const [form, setForm] = useState<LaboratoryCatalogInput>(blank());
  const [formError, setFormError] = useState("");
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const query = useQuery({
    queryKey: ["laboratories", roomId, debounced, page, pageSize],
    queryFn: ({ signal }) => api<LaboratoryCatalogList>(`/api/laboratories?${new URLSearchParams({ q: debounced, page: String(page), pageSize: String(pageSize), sort: "name", direction: "asc" })}`, { signal }),
  });
  const save = useMutation({
    mutationFn: (input: LaboratoryCatalogInput) => api<{ laboratory: LaboratoryCatalog }>(editing ? `/api/laboratories/${editing.id}` : "/api/laboratories", { method: editing ? "PUT" : "POST", body: JSON.stringify(input) }),
    onSuccess: async ({ laboratory }) => { setEditing(laboratory); setForm({ name: laboratory.name, defaultCost: laboratory.defaultCost, turnaroundDays: laboratory.turnaroundDays, material: laboratory.material, shade: laboratory.shade, instructions: laboratory.instructions, active: laboratory.active }); await client.invalidateQueries({ queryKey: ["laboratories"] }); },
  });
  const status = useMutation({
    mutationFn: (laboratory: LaboratoryCatalog) => api(`/api/laboratories/${laboratory.id}/status`, { method: "PATCH", body: JSON.stringify({ active: !laboratory.active }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["laboratories"] }); },
  });
  const field = <K extends keyof LaboratoryCatalogInput>(key: K, value: LaboratoryCatalogInput[K]) => setForm((old) => ({ ...old, [key]: value }));
  const open = (laboratory: LaboratoryCatalog | null) => { setEditing(laboratory); setForm(laboratory ? { name: laboratory.name, defaultCost: laboratory.defaultCost, turnaroundDays: laboratory.turnaroundDays, material: laboratory.material, shade: laboratory.shade, instructions: laboratory.instructions, active: laboratory.active } : blank()); setFormError(""); };
  const canCreate = allowed(user, "laboratoriesCatalog", "create");
  const canModify = allowed(user, "laboratoriesCatalog", "modify");
  const canDelete = allowed(user, "laboratoriesCatalog", "delete");
  return <>
    <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 bg-canvas py-1">
      <h2 className="text-2xl font-semibold tracking-tight">{t("laboratoriesCatalog")}</h2>
      {editing === undefined && canCreate && <Button onClick={() => open(null)}><Plus size={18}/>{t("newLaboratory")}</Button>}
    </div>
    {editing !== undefined && <form className="card mb-3 p-4" onSubmit={(event) => {
      event.preventDefault(); setFormError(""); const parsed = laboratoryCatalogSchema.safeParse(form);
      if (!parsed.success) { setFormError(t(parsed.error.issues[0]?.message ?? "validationError")); return; }
      save.mutate(parsed.data);
    }}>
      <h3 className="mb-4 font-semibold">{t(editing ? "editLaboratory" : "newLaboratory")}</h3>
      {(formError || save.error) && <ErrorMessage message={formError || t(errorKey(save.error))}/>} 
      <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="laboratory-name" label={`${t("labLaboratory")} *`}><input id="laboratory-name" className="input" required maxLength={150} value={form.name} onChange={(e) => field("name", e.target.value)}/></Field>
        <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(e) => field("active", e.target.checked)}/>{t("procedureActive")}</label>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><Button>{t(save.isPending ? "saving" : "save")}</Button><button type="button" onClick={() => setEditing(undefined)}>{t("patientCancel")}</button></div>
      </fieldset>
    </form>}
    {editing !== undefined && <LaboratoryRates laboratory={editing} canCreate={canCreate} canModify={canModify} canDelete={canDelete} />}
    {editing === undefined && <><section className="card mb-3 p-3"><label className="sr-only" htmlFor="laboratory-search">{t("laboratorySearch")}</label><div className="relative"><Search className="absolute left-3 top-3.5 text-muted" size={18}/><input id="laboratory-search" className="input pl-10" placeholder={t("laboratorySearch")} value={search} onChange={(e) => setSearch(e.target.value)}/></div></section>
    {(query.error || status.error) && <ErrorMessage message={t(errorKey(query.error ?? status.error))}/>} 
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr><th className="p-3">{t("labLaboratory")}</th><th className="p-3">{t("laboratoryAssignedProcedures")}</th><th className="p-3">{t("procedureStatus")}</th><th className="p-3">{t("patientActions")}</th></tr></thead>
      <tbody>{(query.data?.laboratories ?? []).map((laboratory) => <tr key={laboratory.id} className="border-t border-line"><td className="p-3 font-medium">{laboratory.name}</td><td className="p-3">{laboratory.rateCount}</td><td className="p-3">{t(laboratory.active ? "procedureActive" : "procedureInactive")}</td><td className="p-2"><div className="flex gap-1">{canModify && <><button className="rounded p-2 text-accent-ink" aria-label={`${t("editLaboratory")} ${laboratory.name}`} onClick={() => open(laboratory)}><Pencil size={16}/></button><button className="rounded p-2 text-accent-ink" aria-label={`${t(laboratory.active ? "procedureDeactivate" : "procedureActivate")} ${laboratory.name}`} onClick={() => status.mutate(laboratory)}><Power size={16}/></button></>}</div></td></tr>)}
      {!query.isPending && !(query.data?.laboratories.length) && <tr><td colSpan={4} className="p-8 text-center text-muted">{t("laboratoryEmpty")}</td></tr>}</tbody></table></div>
      <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} busy={query.isFetching} label={t("laboratoryCatalogPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
    </section></>}
  </>;
}

const blankRate = (): LaboratoryRateInput => ({ procedureId: 0, cost: "0.00", currency: "USD", turnaroundDays: 0, active: true });
function LaboratoryRates({ laboratory, canCreate, canModify, canDelete }: { laboratory: LaboratoryCatalog | null; canCreate: boolean; canModify: boolean; canDelete: boolean }) {
  const { t } = useTranslation(); const { roomId } = useWorkspace(); const client = useQueryClient();
  const [editing, setEditing] = useState<LaboratoryRate | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<LaboratoryRate | null>(null);
  const [form, setForm] = useState<LaboratoryRateInput>(blankRate()); const [formError, setFormError] = useState("");
  const rates = useQuery({ queryKey: ["laboratory-rates", roomId, laboratory?.id], enabled: !!laboratory, queryFn: ({ signal }) => api<{ rates: LaboratoryRate[] }>(`/api/laboratories/${laboratory!.id}/rates`, { signal }) });
  const procedures = useQuery({ queryKey: ["procedures", roomId, "laboratory-rates"], queryFn: ({ signal }) => api<ProcedureList>("/api/procedures?pageSize=100&sort=name&direction=asc", { signal }) });
  const save = useMutation({
    mutationFn: (input: LaboratoryRateInput) => api(`/api/laboratories/${laboratory!.id}/rates${editing ? `/${editing.id}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(input) }),
    onSuccess: async () => { setEditing(undefined); setForm(blankRate()); await Promise.all([client.invalidateQueries({ queryKey: ["laboratory-rates", roomId, laboratory?.id] }), client.invalidateQueries({ queryKey: ["laboratories"] })]); },
  });
  const status = useMutation({ mutationFn: (rate: LaboratoryRate) => api(`/api/laboratories/${laboratory!.id}/rates/${rate.id}/status`, { method: "PATCH", body: JSON.stringify({ active: !rate.active }) }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["laboratory-rates", roomId, laboratory?.id] }); } });
  const remove = useMutation({ mutationFn: (rate: LaboratoryRate) => api(`/api/laboratories/${laboratory!.id}/rates/${rate.id}`, { method: "DELETE" }), onSuccess: async () => { setDeleting(null); await Promise.all([client.invalidateQueries({ queryKey: ["laboratory-rates", roomId, laboratory?.id] }), client.invalidateQueries({ queryKey: ["laboratories"] })]); } });
  const open = (rate: LaboratoryRate | null) => { setEditing(rate); setForm(rate ? { procedureId: rate.procedureId, cost: rate.cost, currency: rate.currency, turnaroundDays: rate.turnaroundDays, active: rate.active } : blankRate()); setFormError(""); };
  return <section className="card mb-3 p-4">
    {deleting && <ConfirmDialog title={t("laboratoryDeleteRateTitle")} message={t("laboratoryDeleteRateMessage", { procedure: deleting.procedureName, laboratory: laboratory?.name })} confirmLabel={t("planDeleteAction")} pending={remove.isPending} error={remove.error ? t(errorKey(remove.error)) : ""} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}/>} 
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{t("laboratoryProcedureRates")}</h3><p className="text-xs text-muted">{laboratory ? t("laboratoryProcedureRatesHint", { name: laboratory.name }) : t("laboratorySaveBeforeRates")}</p></div>{canCreate && <Button type="button" disabled={!laboratory} onClick={() => open(null)}><Plus size={16}/>{t("laboratoryAddProcedure")}</Button>}</div>
    {(rates.error || procedures.error || status.error) && <div className="mt-3"><ErrorMessage message={t(errorKey(rates.error ?? procedures.error ?? status.error))}/></div>}
    {editing !== undefined && <form className="mt-4 rounded-xl border border-line bg-soft p-3" onSubmit={(event) => { event.preventDefault(); const parsed = laboratoryRateSchema.safeParse(form); if (!parsed.success) { setFormError(t(parsed.error.issues[0]?.message ?? "validationError")); return; } setFormError(""); save.mutate(parsed.data); }}>
      {(formError || save.error) && <ErrorMessage message={formError || t(errorKey(save.error))}/>}<fieldset disabled={save.isPending} className="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_7rem_minmax(8rem,1fr)_auto]">
        <Field id="rate-procedure" label={`${t("twProcedure")} *`}><select id="rate-procedure" className="input" required value={form.procedureId || ""} onChange={(event) => setForm((old) => ({ ...old, procedureId: Number(event.target.value) }))}><option value="">{t("procedureSelect")}</option>{(procedures.data?.procedures ?? []).filter((procedure) => procedure.active && procedure.requiresLab).map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.code} · {procedure.name}</option>)}</select></Field>
        <Field id="rate-cost" label={`${t("laboratoryCost")} *`}><input id="rate-cost" className="input" type="number" min="0" step="0.01" required value={form.cost} onChange={(event) => setForm((old) => ({ ...old, cost: event.target.value }))}/></Field>
        <Field id="rate-currency" label={t("paymentCurrency")}><select id="rate-currency" className="input" value={form.currency} onChange={(event) => setForm((old) => ({ ...old, currency: event.target.value as "USD" | "LBP" }))}><option>USD</option><option>LBP</option></select></Field>
        <Field id="rate-days" label={t("labTurnaroundDays")}><input id="rate-days" className="input" type="number" min="0" max="365" value={form.turnaroundDays} onChange={(event) => setForm((old) => ({ ...old, turnaroundDays: Number(event.target.value) }))}/></Field>
        <div className="flex gap-2"><Button>{t(save.isPending ? "saving" : "save")}</Button><button type="button" onClick={() => setEditing(undefined)}>{t("patientCancel")}</button></div>
      </fieldset>
    </form>}
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-soft text-muted"><tr><th className="p-3">{t("twProcedure")}</th><th className="p-3">{t("laboratoryCost")}</th><th className="p-3">{t("labTurnaroundDays")}</th><th className="p-3">{t("procedureStatus")}</th><th className="p-3">{t("patientActions")}</th></tr></thead><tbody>{(rates.data?.rates ?? []).map((rate) => <tr key={rate.id} className="border-t border-line"><td className="p-3"><strong>{rate.procedureName}</strong><span className="block text-xs text-muted">{rate.procedureCode}</span></td><td className="p-3">{rate.cost} {rate.currency}</td><td className="p-3">{rate.turnaroundDays}</td><td className="p-3">{t(rate.active ? "procedureActive" : "procedureInactive")}</td><td className="p-2"><div className="flex gap-1">{canModify && <><button type="button" className="rounded p-2 text-accent-ink" aria-label={`${t("laboratoryEditRate")} ${rate.procedureName}`} onClick={() => open(rate)}><Pencil size={16}/></button><button type="button" className="rounded p-2 text-accent-ink" aria-label={`${t(rate.active ? "procedureDeactivate" : "procedureActivate")} ${rate.procedureName}`} onClick={() => status.mutate(rate)}><Power size={16}/></button></>}{canDelete && <button type="button" className="rounded p-2 text-danger-ink" aria-label={`${t("laboratoryDeleteRate")} ${rate.procedureName}`} onClick={() => setDeleting(rate)}><Trash2 size={16}/></button>}</div></td></tr>)}{!rates.isPending && !(rates.data?.rates.length) && <tr><td colSpan={5} className="p-6 text-center text-muted">{t(laboratory ? "laboratoryNoProcedureRates" : "laboratorySaveBeforeRates")}</td></tr>}</tbody></table></div>
  </section>;
}
