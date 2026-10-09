import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { allowed, billCategorySchema, type BillCategory, type BillCategoryInput } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";

export function BillCategoryFormPage() {
  const { id } = useParams(); const { user } = useAuth(); const { roomId } = useWorkspace(); const { t } = useTranslation();
  const query = useQuery({ queryKey: ["bill-categories", "detail", roomId, id], enabled: Boolean(id), queryFn: ({ signal }) => api<{ category: BillCategory }>(`/api/bill-categories/${id}`, { signal }) });
  if (!id && !allowed(user, "billsCategories", "create")) return <ErrorMessage message={t("FORBIDDEN")}/>;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error) return <><ErrorMessage message={t(errorKey(query.error))}/><Link className="button mt-5" to="/bill-categories"><ArrowLeft size={18}/>{t("billCategoryBack")}</Link></>;
  return <BillCategoryForm key={id ?? "new"} category={query.data?.category}/>;
}

function BillCategoryForm({ category }: { category?: BillCategory }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { roomId } = useWorkspace(); const navigate = useNavigate(); const client = useQueryClient();
  const canSave = allowed(user, "billsCategories", category ? "modify" : "create");
  const { register, handleSubmit, setError, formState: { errors } } = useForm<BillCategoryInput>({ resolver: zodResolver(billCategorySchema), mode: "onTouched", defaultValues: { name: category?.name ?? "", description: category?.description ?? "", defaultAmount: category?.defaultAmount ?? "", currency: category?.currency ?? "USD", laboratoryBills: category?.laboratoryBills ?? false, active: category?.active ?? true } });
  const mutation = useMutation({ mutationFn: (input: BillCategoryInput) => api<{ category: BillCategory }>(category ? `/api/bill-categories/${category.id}` : "/api/bill-categories", { method: category ? "PUT" : "POST", body: JSON.stringify(input) }), onSuccess: async ({ category: saved }) => { client.setQueryData(["bill-categories", "detail", roomId, String(saved.id)], { category: saved }); await client.invalidateQueries({ queryKey: ["bill-categories"] }); navigate("/bill-categories", { state: { saved: true } }); }, onError: (error) => { if (errorKey(error) === "CONFLICT") setError("name", { message: "billCategoryDuplicate" }, { shouldFocus: true }); } });
  const error = (field: keyof BillCategoryInput) => errors[field] ? t(errors[field]?.message ?? "VALIDATION_ERROR") : undefined;
  const attrs = (field: keyof BillCategoryInput) => ({ "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `${field}-error` : undefined, className: errors[field] ? "input border-danger-ink" : "input" });
  return <>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2"><div><Link to="/bill-categories" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"><ArrowLeft size={18}/>{t("billCategoryBack")}</Link><h2 className="text-2xl font-semibold">{t(category ? "billCategoryEdit" : "billCategoryNew")}</h2></div><div className="ml-auto flex items-center gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold hover:bg-soft" to="/bill-categories">{t("patientCancel")}</Link>{canSave && <Button type="submit" form="bill-category-form" disabled={mutation.isPending}>{t(mutation.isPending ? "saving" : "save")}</Button>}</div></div>
    <form id="bill-category-form" noValidate onSubmit={handleSubmit((input) => canSave && mutation.mutate(input))} className="patient-form card p-4 sm:p-5"><fieldset disabled={mutation.isPending || !canSave} className="space-y-5"><section aria-labelledby="bill-category-details"><h3 id="bill-category-details" className="mb-3 font-semibold">{t("billCategoryDetails")}</h3><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"><Field id="name" label={`${t("billCategoryName")} *`} error={error("name")}><input id="name" maxLength={150} aria-required="true" {...register("name")} {...attrs("name")}/></Field><Field id="defaultAmount" label={t("billCategoryDefaultAmount")} error={error("defaultAmount")}><input id="defaultAmount" type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" placeholder={t("billCategoryAmountOptional")} {...register("defaultAmount")} {...attrs("defaultAmount")}/></Field><Field id="currency" label={t("paymentCurrency")} error={error("currency")}><select id="currency" {...register("currency")} {...attrs("currency")}><option value="USD">USD</option><option value="LBP">LBP</option></select></Field><label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4" {...register("laboratoryBills")}/>{t("billCategoryLaboratoryBills")}</label><label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4" {...register("active")}/>{t("procedureActive")}</label><div className="sm:col-span-2 lg:col-span-3"><Field id="description" label={t("billCategoryDescription")} error={error("description")}><textarea id="description" rows={5} maxLength={2000} {...register("description")} {...attrs("description")}/></Field></div></div><p className="mt-3 text-xs text-muted">{t("billCategoryDefaultHint")}</p><p className="mt-1 text-xs text-muted">{t("billCategoryLaboratoryBillsHint")}</p></section></fieldset>{mutation.error && errorKey(mutation.error) !== "CONFLICT" && <div className="mt-5"><ErrorMessage message={t(errorKey(mutation.error))}/></div>}</form>
  </>;
}
