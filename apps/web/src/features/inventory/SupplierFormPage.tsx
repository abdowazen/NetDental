import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { allowed, supplierSchema, type Supplier, type SupplierInput } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";

export function SupplierFormPage() {
  const { id } = useParams(); const { user } = useAuth(); const { roomId } = useWorkspace(); const { t } = useTranslation();
  const query = useQuery({ queryKey: ["suppliers", "detail", roomId, id], enabled: Boolean(id), queryFn: ({ signal }) => api<{ supplier: Supplier }>(`/api/suppliers/${id}`, { signal }) });
  if (!id && !allowed(user, "suppliersVendors", "create")) return <ErrorMessage message={t("FORBIDDEN")}/>;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error) return <><ErrorMessage message={t(errorKey(query.error))}/><Link className="button mt-5" to="/suppliers"><ArrowLeft size={18}/>{t("supplierBack")}</Link></>;
  return <SupplierForm key={id ?? "new"} supplier={query.data?.supplier}/>;
}

function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { roomId } = useWorkspace(); const navigate = useNavigate(); const client = useQueryClient(); const canSave = allowed(user, "suppliersVendors", supplier ? "modify" : "create");
  const { register, handleSubmit, setError, formState: { errors } } = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema), mode: "onTouched", defaultValues: { name: supplier?.name ?? "", phone: supplier?.phone ?? "", address: supplier?.address ?? "", active: supplier?.active ?? true } });
  const mutation = useMutation({ mutationFn: (input: SupplierInput) => api<{ supplier: Supplier }>(supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers", { method: supplier ? "PUT" : "POST", body: JSON.stringify(input) }), onSuccess: async ({ supplier: saved }) => { client.setQueryData(["suppliers", "detail", roomId, String(saved.id)], { supplier: saved }); await Promise.all([client.invalidateQueries({ queryKey: ["suppliers"] }), client.invalidateQueries({ queryKey: ["supplier-options"] })]); navigate("/suppliers", { state: { saved: true } }); }, onError: (problem) => { if (errorKey(problem) === "CONFLICT") setError("name", { message: "supplierDuplicate" }, { shouldFocus: true }); } });
  const error = (field: keyof SupplierInput) => errors[field] ? t(errors[field]?.message ?? "VALIDATION_ERROR") : undefined; const attrs = (field: keyof SupplierInput) => ({ "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `${field}-error` : undefined, className: errors[field] ? "input border-danger-ink" : "input" });
  return <>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2"><div><Link to="/suppliers" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"><ArrowLeft size={18}/>{t("supplierBack")}</Link><h2 className="text-2xl font-semibold">{t(supplier ? "supplierEdit" : "supplierNew")}</h2></div><div className="ml-auto flex items-center gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold hover:bg-soft" to="/suppliers">{t("patientCancel")}</Link>{canSave && <Button type="submit" form="supplier-form" disabled={mutation.isPending}>{t(mutation.isPending ? "saving" : "save")}</Button>}</div></div>
    <form id="supplier-form" noValidate onSubmit={handleSubmit((input) => canSave && mutation.mutate(input))} className="patient-form card p-4 sm:p-5"><fieldset disabled={mutation.isPending || !canSave}><section aria-labelledby="supplier-details"><h3 id="supplier-details" className="mb-3 font-semibold">{t("supplierDetails")}</h3><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"><Field id="name" label={`${t("supplierName")} *`} error={error("name")}><input id="name" maxLength={150} aria-required="true" autoFocus {...register("name")} {...attrs("name")}/></Field><Field id="phone" label={t("supplierPhone")} error={error("phone")}><input id="phone" type="tel" inputMode="tel" dir="ltr" maxLength={40} placeholder="+961 3 123 456" {...register("phone")} {...attrs("phone")}/></Field><label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...register("active")}/>{t("procedureActive")}</label><div className="sm:col-span-2 lg:col-span-3"><Field id="address" label={t("supplierAddress")} error={error("address")}><textarea id="address" rows={4} maxLength={500} {...register("address")} {...attrs("address")}/></Field></div></div></section></fieldset>{mutation.error && errorKey(mutation.error) !== "CONFLICT" && <div className="mt-5"><ErrorMessage message={t(errorKey(mutation.error))}/></div>}</form>
  </>;
}
