import { useTranslation } from "react-i18next";
import { CurrencySettings } from "./CurrencySettings";

export function CurrencySetupPage() {
  const { t } = useTranslation();

  return (
    <>
      <p className="eyebrow">{t("settings")}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {t("currencySetup")}
      </h2>
      <p className="mb-9 mt-3 text-sm text-muted">
        {t("currencySetupDescription")}
      </p>
      <CurrencySettings />
    </>
  );
}
