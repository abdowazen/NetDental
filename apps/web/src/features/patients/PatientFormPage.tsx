import { allowed } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { ArrowLeft } from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import {
  patientSchema,
  formatLebanesePhone,
  patientJobs,
  patientPrefill,
  clinicDate,
  type Patient,
  type PatientInput,
} from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field, Input } from "../../components/ui";

export function PatientFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["patients", "detail", roomId, id],
    queryFn: ({ signal }) =>
      api<{ patient: Patient }>(`/api/patients/${id}`, { signal }),
    enabled: Boolean(id),
  });
  if (!id && !allowed(user, "patients", "create"))
    return <ErrorMessage message={t("FORBIDDEN")} />;
  if (id && query.isPending) return <p role="status">{t("loading")}</p>;
  if (id && query.error)
    return (
      <>
        <ErrorMessage message={t(errorKey(query.error))} />
        <Link className="button mt-5" to="/patients">
          <ArrowLeft size={18} aria-hidden="true" />
          {t("patientBack")}
        </Link>
      </>
    );
  return <PatientForm key={id ?? "new"} patient={query.data?.patient} />;
}

function PatientForm({ patient }: { patient?: Patient }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const canSave = allowed(user, "patients", patient ? "modify" : "create");
  const [params] = useSearchParams();
  const client = useQueryClient();
  const defaults: PatientInput = patient
    ? {
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        gender: patient.gender,
        fatherName: patient.fatherName,
        job: patient.job,
        age: patient.age,
        firstVisit: patient.firstVisit,
        notes: patient.notes,
      }
    : {
        firstName: "",
        lastName: "",
        phone: "",
        gender: "" as PatientInput["gender"],
        fatherName: "",
        job: "none",
        age: 0,
        firstVisit: clinicDate(),
        notes: "",
        ...patientPrefill(params.get("prefill") ?? ""),
      };
  const {
    register,
    setValue,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const fullName =
    `${watch("firstName").trim()} ${watch("lastName").trim()}`.trim();
  const mutation = useMutation({
    mutationFn: (input: PatientInput) =>
      api<{ patient: Patient }>(
        patient ? `/api/patients/${patient.id}` : "/api/patients",
        { method: patient ? "PUT" : "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async ({ patient: saved }) => {
      client.setQueryData(["patients", "detail", roomId, String(saved.id)], {
        patient: saved,
      });
      await client.invalidateQueries({ queryKey: ["patients", "list"] });
      navigate("/patients", { state: { saved: true } });
    },
  });
  const busy = mutation.isPending;
  function error(field: keyof PatientInput) {
    if (!errors[field]) return undefined;
    return t(
      field === "firstVisit"
        ? "patientDateInvalid"
        : (errors[field]?.message ?? "VALIDATION_ERROR"),
    );
  }
  function attrs(field: keyof PatientInput) {
    return {
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
      className: errors[field] ? "input border-danger-ink" : "input",
    };
  }
  return (
    <>
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2">
        <div>
          <Link
            to="/patients"
            className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {t("patientBack")}
          </Link>
          <h2 className="text-2xl font-semibold">
            {t(patient ? "patientEdit" : "newPatient")}
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link
            className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink hover:bg-soft"
            to="/patients"
          >
            {t("patientCancel")}
          </Link>
          {canSave && (
            <Button type="submit" form="patient-form" disabled={busy}>
              {t(mutation.isPending ? "saving" : "patientSave")}
            </Button>
          )}
        </div>
      </div>
      <form
        id="patient-form"
        noValidate
        onSubmit={handleSubmit((input) => canSave && mutation.mutate(input))}
        className="patient-form card p-4 sm:p-5"
      >
        <fieldset
          disabled={busy || !canSave}
          className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label={t("patientFileId")} id="fileId">
            <Input
              id="fileId"
              readOnly
              tabIndex={-1}
              value={patient?.fileId ?? t("patientAutoId")}
              className="bg-soft"
            />
          </Field>
          <Field
            label={`${t("patientFirstName")} *`}
            id="firstName"
            error={error("firstName")}
          >
            <input
              id="firstName"
              aria-required="true"
              autoComplete="given-name"
              maxLength={100}
              {...register("firstName")}
              {...attrs("firstName")}
            />
          </Field>
          <Field
            label={`${t("patientLastName")} *`}
            id="lastName"
            error={error("lastName")}
          >
            <input
              id="lastName"
              aria-required="true"
              autoComplete="family-name"
              maxLength={100}
              {...register("lastName")}
              {...attrs("lastName")}
            />
          </Field>
          <Field label={t("patientFullName")} id="fullName">
            <Input
              id="fullName"
              readOnly
              tabIndex={-1}
              value={fullName}
              className="bg-soft"
            />
          </Field>
          <Field
            label={`${t("patientPhone")} *`}
            id="phone"
            error={error("phone")}
          >
            <input
              id="phone"
              type="tel"
              placeholder="+961 70 123 456"
              dir="ltr"
              aria-required="true"
              autoComplete="tel"
              maxLength={40}
              {...register("phone", {
                onBlur: (event) => {
                  const formatted = formatLebanesePhone(event.target.value);
                  if (formatted)
                    setValue("phone", formatted, { shouldValidate: true });
                },
              })}
              {...attrs("phone")}
            />
          </Field>
          <Field
            label={`${t("patientGender")} *`}
            id="gender"
            error={error("gender")}
          >
            <select
              id="gender"
              aria-required="true"
              {...register("gender")}
              {...attrs("gender")}
            >
              <option value="">{t("patientSelectGender")}</option>
              <option value="Male">{t("genderMale")}</option>
              <option value="Female">{t("genderFemale")}</option>
            </select>
          </Field>
          <Field
            label={t("patientFatherName")}
            id="fatherName"
            error={error("fatherName")}
          >
            <input
              id="fatherName"
              maxLength={100}
              {...register("fatherName")}
              {...attrs("fatherName")}
            />
          </Field>
          <Field label={t("patientJob")} id="job" error={error("job")}>
            <select id="job" {...register("job")} {...attrs("job")}>
              {patientJobs.map((job) => (
                <option key={job} value={job}>
                  {t(`job_${job}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("patientAge")} id="age" error={error("age")}>
            <input
              id="age"
              type="number"
              min={0}
              max={150}
              step={1}
              {...register("age", {
                setValueAs: (value) => (value === "" ? 0 : Number(value)),
              })}
              {...attrs("age")}
            />
          </Field>
          <Field
            label={t("patientFirstVisit")}
            id="firstVisit"
            error={error("firstVisit")}
          >
            <input
              id="firstVisit"
              type="date"
              {...register("firstVisit")}
              {...attrs("firstVisit")}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label={t("patientNotes")} id="notes" error={error("notes")}>
              <textarea
                id="notes"
                rows={6}
                maxLength={4000}
                {...register("notes")}
                {...attrs("notes")}
              />
            </Field>
          </div>
        </fieldset>
        {mutation.error && (
          <div className="mt-5">
            <ErrorMessage message={t(errorKey(mutation.error))} />
          </div>
        )}
      </form>
    </>
  );
}
