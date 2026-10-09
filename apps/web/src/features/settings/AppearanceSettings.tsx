import { useState } from "react";
import { SettingsCard } from "./SettingsCard";
import { Check, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  readAppearance,
  saveAppearance,
  themeColors,
  type Appearance,
} from "../../lib/appearance";

export function AppearanceSettings() {
  const { t } = useTranslation();
  const [appearance, setAppearance] = useState(readAppearance);
  const [saved, setSaved] = useState<boolean | null>(null);

  function update(next: Appearance) {
    setAppearance(next);
    setSaved(saveAppearance(next));
  }

  return (
    <SettingsCard title={t("appearanceTitle")}>
      <p className="mt-2 text-sm text-muted">{t("appearanceDescription")}</p>
      <fieldset className="mt-7">
        <legend className="mb-3 text-sm font-medium">{t("themeColor")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {themeColors.map((color) => (
            <label key={color} className="relative cursor-pointer">
              <input
                type="radio"
                name="theme-color"
                value={color}
                checked={appearance.color === color}
                onChange={() => update({ ...appearance, color })}
                className="peer sr-only"
              />
              <span className="appearance-option">
                <span
                  className={`theme-swatch theme-swatch-${color}`}
                  aria-hidden="true"
                />
                {t(`theme_${color}`)}
                {appearance.color === color && (
                  <Check
                    size={16}
                    className="ml-auto text-accent-ink"
                    aria-hidden="true"
                  />
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-7">
        <legend className="mb-3 text-sm font-medium">{t("themeMode")}</legend>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          {(["light", "dark"] as const).map((mode) => {
            const Icon = mode === "light" ? Sun : Moon;
            return (
              <label key={mode} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="theme-mode"
                  value={mode}
                  checked={appearance.mode === mode}
                  onChange={() => update({ ...appearance, mode })}
                  className="peer sr-only"
                />
                <span className="appearance-option">
                  <Icon size={20} aria-hidden="true" />
                  {t(`mode_${mode}`)}
                  {appearance.mode === mode && (
                    <Check
                      size={16}
                      className="ml-auto text-accent-ink"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p role="status" className="mt-5 text-xs text-muted">
        {saved === null
          ? t("appearanceInstant")
          : saved
            ? t("appearanceSaved")
            : t("appearanceUnsaved")}
      </p>
    </SettingsCard>
  );
}
