import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { allowed, billExpenseSchema, clinicDate, type BillCategoryList, type BillExpense, type BillExpenseInput, type LaboratoryCatalogList } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";

export function BillExpenseFormPage() {
  const { id } = useParams(); const { user } = useAuth(); const { roomId } = useWorkspace(); const { t } = useTranslation();
  const query = useQuery({ queryKey: ["bill-expenses", "detail", roomId, id], enabled: Boolean(id), queryFn: ({ signal }) => api<{ expense: BillExpense }>(`/api/bill-expenses/${id}`, { signal }) });
  if (!id && !allowed(user, "billsPayments", "create")) return <ErrorMessage message={t("FORBIDDEN")}/>;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error) return <><ErrorMessage message={t(errorKey(query.error))}/><Link className="button mt-5" to="/bills-payments"><ArrowLeft size={18}/>{t("billExpenseBack")}</Link></>;
  return <BillExpenseForm key={id ?? "new"} expense={query.data?.expense}/>;
}

function BillExpenseForm({ expense }: { expense?: BillExpense }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { roomId } = useWorkspace(); const navigate = useNavigate(); const client = useQueryClient();
  const canSave = allowed(user, "billsPayments", expense ? "modify" : "create");
  const categories = useQuery({ queryKey: ["bill-categories", roomId, "expense-form"], queryFn: ({ signal }) => api<BillCategoryList>("/api/bill-categories?pageSize=100&sort=name&direction=asc", { signal }) });
  const laboratories = useQuery({ queryKey: ["laboratories", roomId, "expense-form"], queryFn: ({ signal }) => api<LaboratoryCatalogList>("/api/bill-expense-laboratories?pageSize=100&sort=name&direction=asc", { signal }) });
  const { register, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors } } = useForm<BillExpenseInput>({ resolver: zodResolver(billExpenseSchema), mode: "onTouched", defaultValues: { categoryId: expense?.categoryId ?? 0, laboratoryId: expense?.laboratoryId, amount: expense?.amount ?? "", currency: expense?.currency ?? "USD", method: expense?.method ?? "cash", date: expense?.date ?? clinicDate(), note: expense?.note ?? "" } });
  const mutation = useMutation({ mutationFn: (input: BillExpenseInput) => api<{ expense: BillExpense }>(expense ? `/api/bill-expenses/${expense.id}` : "/api/bill-expenses", { method: expense ? "PUT" : "POST", body: JSON.stringify(input) }), onSuccess: async ({ expense: saved }) => { client.setQueryData(["bill-expenses", "detail", roomId, saved.id], { expense: saved }); await Promise.all([client.invalidateQueries({ queryKey: ["bill-expenses"] }), client.invalidateQueries({ queryKey: ["reports", "lab-statement"] })]); navigate("/bills-payments", { state: { saved: true } }); } });
  const error = (field: keyof BillExpenseInput) => errors[field] ? t(errors[field]?.message ?? "VALIDATION_ERROR") : undefined;
  const attrs = (field: keyof BillExpenseInput) => ({ "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `${field}-error` : undefined, className: errors[field] ? "input border-danger-ink" : "input" });
  const categoryRegistration = register("categoryId");
  const selectedCategory = categories.data?.categories.find((category) => category.id === Number(watch("categoryId")));
  const laboratoryRequired = selectedCategory?.laboratoryBills ?? false;
  return <>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2"><div><Link to="/bills-payments" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"><ArrowLeft size={18}/>{t("billExpenseBack")}</Link><h2 className="text-2xl font-semibold">{t(expense ? "billExpenseEdit" : "billExpenseNew")}</h2></div><div className="ml-auto flex items-center gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold hover:bg-soft" to="/bills-payments">{t("patientCancel")}</Link>{canSave && <Button type="submit" form="bill-expense-form" disabled={mutation.isPending}>{t(mutation.isPending ? "saving" : "save")}</Button>}</div></div>
    <form id="bill-expense-form" noValidate onSubmit={handleSubmit((input) => { if (!canSave) return; if (laboratoryRequired && !input.laboratoryId) { setError("laboratoryId", { message: "billExpenseLaboratoryRequired" }, { shouldFocus: true }); return; } mutation.mutate(input); })} className="patient-form card p-4 sm:p-5"><fieldset disabled={mutation.isPending || !canSave} className="space-y-5"><section aria-labelledby="bill-expense-details"><h3 id="bill-expense-details" className="mb-3 font-semibold">{t("billExpenseDetails")}</h3><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field id="categoryId" label={`${t("billCategoryName")} *`} error={error("categoryId")}><select id="categoryId" aria-required="true" {...categoryRegistration} {...attrs("categoryId")} onChange={(event) => { void categoryRegistration.onChange(event); const selected = categories.data?.categories.find((category) => category.id === Number(event.target.value)); if (selected) { setValue("amount", selected.defaultAmount ?? "", { shouldDirty: true, shouldValidate: selected.defaultAmount != null }); setValue("currency", selected.currency, { shouldDirty: true, shouldValidate: true }); if (!selected.laboratoryBills) { setValue("laboratoryId", undefined, { shouldDirty: true, shouldValidate: false }); clearErrors("laboratoryId"); } } }}><option value="">{t("billExpenseSelectCategory")}</option>{(categories.data?.categories ?? []).filter((category) => category.active || category.id === expense?.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      {laboratoryRequired && <Field id="laboratoryId" label={`${t("labLaboratory")} *`} error={error("laboratoryId")}><select id="laboratoryId" aria-required="true" {...register("laboratoryId")} {...attrs("laboratoryId")}><option value="">{t("billExpenseSelectLaboratory")}</option>{(laboratories.data?.laboratories ?? []).filter((laboratory) => laboratory.active || laboratory.id === expense?.laboratoryId).map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.name}</option>)}</select></Field>}
      <Field id="amount" label={`${t("billExpenseAmount")} *`} error={error("amount")}><input id="amount" type="number" min="0.01" max="999999999999.99" step="0.01" inputMode="decimal" aria-required="true" {...register("amount")} {...attrs("amount")}/></Field>
      <Field id="currency" label={`${t("paymentCurrency")} *`} error={error("currency")}><select id="currency" {...register("currency")} {...attrs("currency")}><option value="USD">USD</option><option value="LBP">LBP</option></select></Field>
      <Field id="method" label={`${t("paymentMethod")} *`} error={error("method")}><select id="method" {...register("method")} {...attrs("method")}><option value="cash">{t("billPaymentMethod_cash")}</option><option value="card">{t("billPaymentMethod_card")}</option><option value="cheque">{t("billPaymentMethod_cheque")}</option></select></Field>
      <Field id="date" label={`${t("odDate")} *`} error={error("date")}><input id="date" type="date" max={clinicDate()} aria-required="true" {...register("date")} {...attrs("date")}/></Field>
      <div className="sm:col-span-2 lg:col-span-3"><Field id="note" label={`${t("patientNotes")} (${t("optional")})`} error={error("note")}><textarea id="note" rows={5} maxLength={4000} {...register("note")} {...attrs("note")}/></Field></div>
    </div>{laboratoryRequired && <p className="mt-3 text-xs text-muted">{t("billExpenseLaboratoryHint")}</p>}<p className="mt-1 text-xs text-muted">{t("billExpenseConversionHint")}</p></section></fieldset>{(mutation.error || categories.error || laboratories.error) && <div className="mt-5"><ErrorMessage message={t(errorKey(mutation.error ?? categories.error ?? laboratories.error))}/></div>}</form>
  </>;
}
