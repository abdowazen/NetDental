import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
let language = "en";
try {
  language = localStorage.getItem("clinic.language") === "fr" ? "fr" : "en";
} catch {
  /* optional device storage */
}
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: language,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  document.title = i18n.t("appName");
  try {
    localStorage.setItem("clinic.language", lng);
  } catch {
    /* optional device storage */
  }
});
document.documentElement.lang = language;
document.title = i18n.t("appName");
export default i18n;
