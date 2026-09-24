import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthProvider";
import { LanguageSelect } from "../../components/LanguageSelect";
import { AppearanceSettings } from "./AppearanceSettings";
import { CurrencySettings } from "./CurrencySettings";
import { SettingsCard } from "./SettingsCard";
export function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  return (
    <>
      <p className="eyebrow">{t("preferences")}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {t("settingsTitle")}
      </h2>
      <p className="mb-9 mt-3 text-sm text-muted">{t("settingsDescription")}</p>
      <SettingsCard title={t("profile")} className="">
        <p className="mt-2 text-sm text-muted">{t("profileDescription")}</p>
        <dl className="mt-8 grid gap-7 sm:grid-cols-2">
          <div>
            <dt>{t("username")}</dt>
            <dd>{user?.username}</dd>
          </div>
          <div>
            <dt>{t("displayName")}</dt>
            <dd>{user?.displayName}</dd>
          </div>
          <div>
            <dt>{t("role")}</dt>
            <dd>{t(user?.role === "ADMIN" ? "administrator" : (user?.role.toLowerCase() ?? "dentist"))}</dd>
          </div>
        </dl>
      </SettingsCard>
      <AppearanceSettings />
      <CurrencySettings />
      <SettingsCard title={t("languageTitle")}>
        <p className="mb-6 mt-2 text-sm text-muted">
          {t("languageDescription")}
        </p>
        <LanguageSelect full />
      </SettingsCard>
    </>
  );
}
