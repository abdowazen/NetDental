import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { allowed, clinicDate, supplyItemSchema, type UnitOptionList, type BrandOptionList, type ProductOptionList, type SupplierOption, type SupplyItem, type SupplyItemInput } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { SupplierAutocomplete } from "./SupplierAutocomplete";

export function SupplyItemFormPage() {
  const { id } = useParams(); const { user } = useAuth(); const { roomId } = useWorkspace(); const { t } = useTranslation();
  const query = useQuery({ queryKey: ["supplies", "detail", roomId, id], enabled: Boolean(id), queryFn: ({ signal }) => api<{ item: SupplyItem }>(`/api/supplies/${id}`, { signal }) });
  if (!id && !allowed(user, "suppliesMaterials", "create")) return <ErrorMessage message={t("FORBIDDEN")}/>;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error) return <><ErrorMessage message={t(errorKey(query.error))}/><Link className="button mt-5" to="/supplies"><ArrowLeft size={18}/>{t("supplyBack")}</Link></>;
  return <SupplyItemForm key={id ?? "new"} item={query.data?.item}/>;
}

function SupplyItemForm({ item }: { item?: SupplyItem }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { roomId } = useWorkspace(); const navigate = useNavigate(); const client = useQueryClient();
  const canSave = allowed(user, "suppliesMaterials", item ? "modify" : "create");
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<SupplierOption[]>(item?.supplierIds.map((id, index) => ({ id, name: item.supplierNames[index] ?? String(id) })) ?? []);
  const { register, control, handleSubmit, setError, setValue, formState: { errors } } = useForm<SupplyItemInput>({ resolver: zodResolver(supplyItemSchema), mode: "onTouched", defaultValues: { unitId: item?.unitId ?? 1, name: item?.name ?? "", brand: item?.brand ?? "", supplierIds: item?.supplierIds ?? [], openingBalance: item?.openingBalance === "0.000" ? "" : item?.openingBalance ?? "", defaultPrice: item?.defaultPrice ?? "0.00", currency: item?.currency ?? "USD", date: item?.date ?? clinicDate(), expiryDate: item?.expiryDate ?? "" } });
  const units = useQuery({ queryKey: ["supply-units"], queryFn: ({ signal }) => api<UnitOptionList>("/api/supplies/units", { signal }), staleTime: 0 });
  const name = useWatch({ control, name: "name" }) ?? "";
  const brand = useWatch({ control, name: "brand" }) ?? "";
  const products = useQuery({ queryKey: ["supply-products", roomId, name], queryFn: ({ signal }) => api<ProductOptionList>(`/api/supplies/products?${new URLSearchParams({ q: name })}`, { signal }) });
  const brands = useQuery({ queryKey: ["supply-brands", roomId, brand], queryFn: ({ signal }) => api<BrandOptionList>(`/api/supplies/brands?${new URLSearchParams({ q: brand })}`, { signal }) });
  const mutation = useMutation({ mutationFn: (input: SupplyItemInput) => api<{ item: SupplyItem }>(item ? `/api/supplies/${item.id}` : "/api/supplies", { method: item ? "PUT" : "POST", body: JSON.stringify(input) }), onSuccess: async ({ item: saved }) => { client.setQueryData(["supplies", "detail", roomId, String(saved.id)], { item: saved }); await Promise.all([client.invalidateQueries({ queryKey: ["supplies"] }), client.invalidateQueries({ queryKey: ["supply-brands"] })]); navigate("/supplies", { state: { saved: true } }); }, onError: (problem) => { if (errorKey(problem) === "CONFLICT") setError("name", { message: "supplyDuplicate" }, { shouldFocus: true }); } });
  const error = (field: keyof SupplyItemInput) => errors[field] ? t(errors[field]?.message ?? "VALIDATION_ERROR") : undefined;
  const attrs = (field: keyof SupplyItemInput) => ({ "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `${field}-error` : undefined, className: errors[field] ? "input border-danger-ink" : "input" });
  return <>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2"><div><Link to="/supplies" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"><ArrowLeft size={18}/>{t("supplyBack")}</Link><h2 className="text-2xl font-semibold">{t(item ? "supplyEdit" : "supplyNew")}</h2></div><div className="ml-auto flex items-center gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold hover:bg-soft" to="/supplies">{t("patientCancel")}</Link>{canSave && <Button type="submit" form="supply-form" disabled={mutation.isPending || units.isPending || !!units.error}>{t(mutation.isPending ? "saving" : "save")}</Button>}</div></div>
    <form id="supply-form" noValidate onSubmit={handleSubmit((input) => canSave && mutation.mutate(input))} className="patient-form card p-4 sm:p-5"><fieldset disabled={mutation.isPending || !canSave} className="space-y-5"><section aria-labelledby="supply-details"><h3 id="supply-details" className="mb-3 font-semibold">{t("supplyDetails")}</h3><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field id="name" label={`${t("supplyItemName")} *`} error={error("name")}><input id="name" list="supply-product-options" maxLength={150} aria-required="true" autoFocus autoComplete="off" {...register("name")} {...attrs("name")}/><datalist id="supply-product-options">{(products.data?.products ?? []).map((value) => <option key={value.id} value={value.name}/>)}</datalist></Field>
      <Field id="brand" label={`${t("supplyBrand")} *`} error={error("brand")}><input id="brand" list="supply-brand-options" maxLength={100} aria-required="true" autoComplete="off" {...register("brand")} {...attrs("brand")}/><datalist id="supply-brand-options">{(brands.data?.brands ?? []).map((value) => <option key={value} value={value}/>)}</datalist></Field>
      <Field id="supplier" label={t("supplySuppliers")} error={error("supplierIds")}><div className="space-y-2"><SupplierAutocomplete value={supplier} onChange={(value) => { setSupplier(value); if (!value || selectedSuppliers.some((entry) => entry.id === value.id)) return; const next = [...selectedSuppliers, value]; setSelectedSuppliers(next); setValue("supplierIds", next.map((entry) => entry.id), { shouldDirty: true, shouldValidate: true }); setSupplier(null); }}/>{selectedSuppliers.length > 0 && <div className="flex flex-wrap gap-2">{selectedSuppliers.map((entry) => <span key={entry.id} className="inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">{entry.name}<button type="button" className="rounded-full p-0.5 hover:bg-surface" aria-label={`${t("supplyRemoveSupplier")} ${entry.name}`} onClick={() => { const next = selectedSuppliers.filter((value) => value.id !== entry.id); setSelectedSuppliers(next); setValue("supplierIds", next.map((value) => value.id), { shouldDirty: true, shouldValidate: true }); }}><X size={13}/></button></span>)}</div>}</div></Field>
      <Field id="unitId" label={`${t("supplyUnit")} *`} error={error("unitId")}><select id="unitId" aria-required="true" disabled={units.isPending || !!units.error} {...register("unitId", { valueAsNumber: true })} {...attrs("unitId")}>{(units.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</select>{units.isPending && <p role="status">{t("loading")}</p>}{units.error && <><ErrorMessage message={t(errorKey(units.error))}/><button type="button" onClick={() => void units.refetch()}>{t("retry")}</button></>}</Field>
      <Field id="openingBalance" label={`${t("supplyOpeningBalance")} (${t("optional")})`} error={error("openingBalance")}><input id="openingBalance" type="number" min="0" max="999999999999.999" step="0.001" inputMode="decimal" placeholder="0" {...register("openingBalance")} {...attrs("openingBalance")}/></Field>
      <Field id="defaultPrice" label={`${t("supplyDefaultPrice")} *`} error={error("defaultPrice")}><input id="defaultPrice" type="number" min="0" max="999999999999.99" step="0.01" inputMode="decimal" aria-required="true" {...register("defaultPrice")} {...attrs("defaultPrice")}/></Field>
      <Field id="currency" label={`${t("paymentCurrency")} *`} error={error("currency")}><select id="currency" {...register("currency")} {...attrs("currency")}><option value="USD">USD</option><option value="LBP">LBP</option></select></Field>
      <Field id="date" label={`${t("supplyDate")} *`} error={error("date")}><input id="date" type="date" aria-required="true" {...register("date")} {...attrs("date")}/></Field>
      <Field id="expiryDate" label={t("supplyExpiryDate")} error={error("expiryDate")}><input id="expiryDate" type="date" {...register("expiryDate")} {...attrs("expiryDate")}/></Field>
    </div><p className="mt-4 text-xs leading-5 text-muted">{t("supplyDefaultsHint")}</p></section></fieldset>{mutation.error && errorKey(mutation.error) !== "CONFLICT" && <div className="mt-5"><ErrorMessage message={t(errorKey(mutation.error))}/></div>}</form>
  </>;
}
