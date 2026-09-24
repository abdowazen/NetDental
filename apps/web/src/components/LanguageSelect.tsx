import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe2 } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { errorKey } from "../lib/api";
import type { Language } from "@clinic/shared";
export function LanguageSelect({ full = false, inverted = false }: { full?: boolean; inverted?: boolean }) {
  const { t, i18n } = useTranslation();
  const { changeLanguage, saving } = useAuth();
  const id = useId();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <div className={`flex items-center gap-2 ${inverted ? "text-white" : "text-muted"}`}>
        <Globe2 size={17} aria-hidden="true" />
        <label className={full ? "text-sm" : "sr-only"} htmlFor={id}>
          {t("language")}
        </label>
        <select
          className="language-select"
          id={id}
          value={i18n.language}
          disabled={saving}
          onChange={async (e) => {
            setError("");
            setSaved(false);
            try {
              await changeLanguage(e.target.value as Language);
              setSaved(true);
            } catch (e) {
              setError(errorKey(e));
            }
          }}
        >
          <option className="bg-surface text-ink" value="en">{t("english")}</option>
          <option className="bg-surface text-ink" value="fr">{t("french")}</option>
        </select>
      </div>
      {full && (
        <p className="mt-3 text-sm text-accent-ink" role="status">
          {saving ? t("saving") : saved ? t("saved") : ""}
        </p>
      )}
      {error && (
        <p className={`mt-2 text-sm ${inverted ? "text-white" : "text-danger-ink"}`} role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
