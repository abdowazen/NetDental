import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, landingPath } from "@clinic/shared";
import { useTranslation } from "react-i18next";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useWorkspace } from "./WorkspaceProvider";
import { Brand, Button, ErrorMessage, Field, Input } from "../../components/ui";
import { LanguageSelect } from "../../components/LanguageSelect";
import { errorKey } from "../../lib/api";
export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const { clinicId, selectClinic } = useWorkspace();
  const [chosenClinic, setChosenClinic] = useState("");
  const clinics = [...new Map((user?.access?.rooms ?? []).map((r) => [r.clinicId, r.clinicName])).entries()];
  const needsClinic = !!user && clinics.length > 1 && !clinicId;
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ username: string; password: string }>({
    resolver: zodResolver(loginSchema),
  });
  if (user && !needsClinic) return <Navigate to={landingPath(user)} replace />;
  return (
    <main className="login-grid">
      <aside className="login-brand">
        <Brand />
        <div className="max-w-md">
          <div className="mb-8 h-px w-12 bg-accent-pale/50" />
          <h1 className="whitespace-pre-line text-4xl font-medium leading-tight tracking-tight xl:text-5xl">
            {t("loginBrandTitle")}
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-accent-pale/80">
            {t("loginBrandDescription")}
          </p>
        </div>
        <div aria-hidden="true" />
      </aside>
      <section className="flex min-h-screen flex-col px-8 py-8 lg:px-16">
        <div className="flex items-center justify-between gap-4">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="ml-auto">
            <LanguageSelect />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <p className="eyebrow">{t("loginEyebrow")}</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
            {t(needsClinic ? "selectClinic" : "loginTitle")}
          </h2>
          <p className="mb-9 mt-3 text-muted">{t(needsClinic ? "loginClinicHint" : "loginDescription")}</p>
          {needsClinic ? (
            <form className="space-y-6" onSubmit={(event) => {
              event.preventDefault();
              if (chosenClinic) void selectClinic(Number(chosenClinic));
            }}>
              <Field id="login-clinic" label={t("clinic")}>
                <select id="login-clinic" className="input w-full" required value={chosenClinic} onChange={(event) => setChosenClinic(event.target.value)}>
                  <option value="">{t("selectClinic")}</option>
                  {clinics.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </Field>
              <Button className="w-full justify-between" type="submit" disabled={!chosenClinic}>
                {t("continueToClinic")} <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </form>
          ) : (
          <form
            noValidate
            className="space-y-6"
            onSubmit={handleSubmit(async (values) => {
              setError("");
              try {
                await login(values.username, values.password);
              } catch (e) {
                setError(errorKey(e));
              }
            })}
          >
            {error && <ErrorMessage message={t(error)} />}
            <Field
              id="username"
              label={t("username")}
              error={errors.username ? t("usernameInvalid") : undefined}
            >
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t("usernamePlaceholder")}
                aria-invalid={!!errors.username}
                aria-describedby={
                  errors.username ? "username-error" : undefined
                }
                {...register("username")}
              />
            </Field>
            <Field
              id="password"
              label={t("password")}
              error={errors.password ? t("passwordRequired") : undefined}
            >
              <div className="relative">
                <Input
                  id="password"
                  className="pr-12"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={t("passwordPlaceholder")}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password")}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-md p-3 text-muted"
                  aria-label={t(visible ? "hidePassword" : "showPassword")}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <Button
              className="w-full justify-between"
              disabled={isSubmitting}
              type="submit"
            >
              <span>{t(isSubmitting ? "signingIn" : "signIn")}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
          )}
          <p className="mt-8 text-center text-xs leading-5 text-muted">
            {t("loginNote")}
          </p>
        </div>
      </section>
    </main>
  );
}
