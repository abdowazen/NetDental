import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import {
  allowed, procedureSchema, procedureCategories, procedureDentitions,
  procedureScopes, chartIndicators, type Procedure, type ProcedureInput,
} from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";

export function ProcedureFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["procedures", "detail", roomId, id],
    queryFn: ({ signal }) => api<{ procedure: Procedure }>(`/api/procedures/${id}`, { signal }),
    enabled: Boolean(id),
  });
  if (!id && !allowed(user, "actsProcedures", "create"))
    return <ErrorMessage message={t("FORBIDDEN")} />;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error) return <>
    <ErrorMessage message={t(errorKey(query.error))} />
    <Link className="button mt-5" to="/procedures"><ArrowLeft size={18} />{t("procedureBack")}</Link>
  </>;
  return <ProcedureForm key={id ?? "new"} procedure={query.data?.procedure} />;
}

function ProcedureForm({ procedure }: { procedure?: Procedure }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const navigate = useNavigate();
  const client = useQueryClient();
  const canSave = allowed(user, "actsProcedures", procedure ? "modify" : "create");
  const defaults: ProcedureInput = {
    code: procedure?.code ?? "", name: procedure?.name ?? "",
    category: procedure?.category ?? "other", description: procedure?.description ?? "",
    defaultPrice: procedure?.defaultPrice ?? "", dentition: procedure?.dentition ?? "both",
    scope: procedure?.scope ?? "single_tooth", requiresLab: procedure?.requiresLab ?? false,
    labLaboratory: procedure?.labLaboratory ?? "",
    labDefaultCost: procedure?.labDefaultCost ?? "0.00", labTurnaroundDays: procedure?.labTurnaroundDays ?? 0,
    labMaterial: procedure?.labMaterial ?? "", labShade: procedure?.labShade ?? "", labInstructions: procedure?.labInstructions ?? "",
    chartIndicator: procedure?.chartIndicator ?? "generic", active: procedure?.active ?? true,
  };
  const { register, handleSubmit, setError, formState: { errors } } = useForm<ProcedureInput>({
    resolver: zodResolver(procedureSchema), defaultValues: defaults, mode: "onTouched",
  });
  const mutation = useMutation({
    mutationFn: (input: ProcedureInput) => api<{ procedure: Procedure }>(
      procedure ? `/api/procedures/${procedure.id}` : "/api/procedures",
      { method: procedure ? "PUT" : "POST", body: JSON.stringify(input) }),
    onSuccess: async ({ procedure: saved }) => {
      client.setQueryData(["procedures", "detail", roomId, String(saved.id)], { procedure: saved });
      await client.invalidateQueries({ queryKey: ["procedures", "list"] });
      navigate("/procedures", { state: { saved: true } });
    },
    onError: (error) => {
      if (errorKey(error) === "CONFLICT") setError("code", { message: "procedureCodeDuplicate" }, { shouldFocus: true });
    },
  });
  function error(field: keyof ProcedureInput) {
    return errors[field] ? t(errors[field]?.message ?? "VALIDATION_ERROR") : undefined;
  }
  function attrs(field: keyof ProcedureInput) {
    return { "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `${field}-error` : undefined,
      className: errors[field] ? "input border-danger-ink" : "input" };
  }
  return <>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2">
      <div>
        <Link to="/procedures" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink">
          <ArrowLeft size={18} aria-hidden="true" />{t("procedureBack")}
        </Link>
        <h2 className="text-2xl font-semibold">{t(procedure ? "procedureEdit" : "newProcedure")}</h2>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink hover:bg-soft" to="/procedures">{t("patientCancel")}</Link>
        {canSave && <Button type="submit" form="procedure-form" disabled={mutation.isPending}>{t(mutation.isPending ? "saving" : "save")}</Button>}
      </div>
    </div>
    <form id="procedure-form" noValidate onSubmit={handleSubmit((input) => canSave && mutation.mutate(input))} className="patient-form card p-4 sm:p-5">
      <fieldset disabled={mutation.isPending || !canSave} className="space-y-5">
        <section aria-labelledby="procedure-details-heading">
          <h3 id="procedure-details-heading" className="mb-3 font-semibold">{t("procedureDetails")}</h3>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="code" label={`${t("procedureCode")} *`} error={error("code")}><input id="code" aria-required="true" maxLength={40} {...register("code")} {...attrs("code")} /></Field>
            <Field id="name" label={`${t("procedureName")} *`} error={error("name")}><input id="name" aria-required="true" maxLength={150} {...register("name")} {...attrs("name")} /></Field>
            <Field id="category" label={t("procedureCategory")} error={error("category")}><select id="category" {...register("category")} {...attrs("category")}>{procedureCategories.map((value) => <option key={value} value={value}>{t(`procedureCategory_${value}`)}</option>)}</select></Field>
            <Field id="defaultPrice" label={`${t("procedurePrice")} *`} error={error("defaultPrice")}><input id="defaultPrice" type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" aria-required="true" {...register("defaultPrice")} {...attrs("defaultPrice")} /></Field>
            <Field id="dentition" label={t("procedureDentition")} error={error("dentition")}><select id="dentition" {...register("dentition")} {...attrs("dentition")}>{procedureDentitions.map((value) => <option key={value} value={value}>{t(`procedureDentition_${value}`)}</option>)}</select></Field>
            <Field id="scope" label={t("procedureScope")} error={error("scope")}><select id="scope" {...register("scope")} {...attrs("scope")}>{procedureScopes.map((value) => <option key={value} value={value}>{t(`procedureScope_${value}`)}</option>)}</select></Field>
            <Field id="chartIndicator" label={t("procedureChartIndicator")} error={error("chartIndicator")}><select id="chartIndicator" {...register("chartIndicator")} {...attrs("chartIndicator")}>{chartIndicators.map((value) => <option key={value} value={value}>{t(`procedureIndicator_${value}`)}</option>)}</select></Field>
            <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...register("requiresLab")} />{t("procedureRequiresLab")}</label>
            <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-line bg-soft px-3 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...register("active")} />{t("procedureActive")}</label>
            <div className="sm:col-span-2 lg:col-span-3"><Field id="description" label={t("procedureDescription")} error={error("description")}><textarea id="description" rows={4} maxLength={4000} {...register("description")} {...attrs("description")} /></Field></div>
          </div>
        </section>
      </fieldset>
      {mutation.error && errorKey(mutation.error) !== "CONFLICT" && <div className="mt-5"><ErrorMessage message={t(errorKey(mutation.error))} /></div>}
    </form>
  </>;
}
