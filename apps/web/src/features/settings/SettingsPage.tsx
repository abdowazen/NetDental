import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  canUseDefaultPage,
  defaultPageOptions,
  type DefaultPage,
} from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { LanguageSelect } from "../../components/LanguageSelect";
import { AppearanceSettings } from "./AppearanceSettings";
import { SettingsCard } from "./SettingsCard";
export function GeneralSettingsPage() {
  const { user, changeDefaultPage, saving } = useAuth();
  const { t } = useTranslation();
  const [defaultPageSaved, setDefaultPageSaved] = useState(false);
  const [defaultPageError, setDefaultPageError] = useState(false);
  const availableDefaultPages = defaultPageOptions.filter((option) =>
    canUseDefaultPage(user, option.value),
  );
  async function updateDefaultPage(defaultPage: DefaultPage) {
    setDefaultPageSaved(false);
    setDefaultPageError(false);
    try {
      await changeDefaultPage(defaultPage);
      setDefaultPageSaved(true);
    } catch {
      setDefaultPageError(true);
    }
  }
  return (
    <>
      <p className="eyebrow">{t("settings")}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {t("generalSettings")}
      </h2>
      <p className="mb-9 mt-3 text-sm text-muted">{t("generalSettingsDescription")}</p>
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
      <SettingsCard title={t("defaultPageTitle")}>
        <p className="mb-6 mt-2 text-sm text-muted">
          {t("defaultPageDescription")}
        </p>
        <label className="block max-w-lg text-sm font-medium" htmlFor="default-page">
          <span className="mb-2 block">{t("defaultPageLabel")}</span>
          <select
            id="default-page"
            className="input w-full"
            value={user?.defaultPage ?? "automatic"}
            disabled={saving}
            onChange={(event) =>
              void updateDefaultPage(event.target.value as DefaultPage)
            }
          >
            <option value="automatic">{t("defaultPageAutomatic")}</option>
            {availableDefaultPages.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
        <p
          role="status"
          className={`mt-4 text-xs ${defaultPageError ? "text-red-600 dark:text-red-400" : "text-muted"}`}
        >
          {defaultPageError
            ? t("defaultPageSaveFailed")
            : defaultPageSaved
              ? t("defaultPageSaved")
              : t("defaultPageHint")}
        </p>
      </SettingsCard>
      <AppearanceSettings />
      <SettingsCard title={t("languageTitle")}>
        <p className="mb-6 mt-2 text-sm text-muted">
          {t("languageDescription")}
        </p>
        <LanguageSelect full />
      </SettingsCard>
    </>
  );
}
