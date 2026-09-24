import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, SlidersHorizontal, Sparkles } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { allowed } from "@clinic/shared";
export function DashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const today = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">{t("overview")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            {t("welcome", { name: user?.displayName })}
          </h2>
          <p className="mt-3 text-sm text-muted">{t("welcomeDescription")}</p>
        </div>
        <p className="text-xs text-muted">
          <span className="mb-1 block font-medium text-ink">{t("today")}</span>
          {today}
        </p>
      </div>
      <section className="card flex min-h-[370px] flex-col items-center justify-center px-8 py-12 text-center">
        <div className="relative mb-7 flex h-20 w-20 items-center justify-center rounded-2xl border border-accent-line bg-accent-soft text-accent-ink">
          <Sparkles size={33} strokeWidth={1.3} aria-hidden="true" />
          <span className="absolute -bottom-2 -right-2 rounded-full border-4 border-surface bg-accent-solid p-1.5 text-white">
            <Check size={13} />
          </span>
        </div>
        <p className="eyebrow text-[10px]">{t("readyLabel")}</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">
          {t("workspaceReady")}
        </h3>
        <p className="mt-4 max-w-lg text-sm leading-7 text-muted">
          {t("workspaceReadyDescription")}
        </p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs text-accent-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-solid" />
          {t("accountConnected")}
        </span>
      </section>
      {allowed(user, "settings") && (
        <section className="card mt-6 flex flex-wrap items-center gap-5 p-6">
          <span className="rounded-xl bg-soft p-3 text-muted">
            <SlidersHorizontal size={22} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">{t("accountTitle")}</h3>
            <p className="mt-1.5 text-sm text-muted">
              {t("accountDescription")}
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-2 rounded-md px-2 py-3 text-sm font-medium text-accent-ink"
            to="/settings"
          >
            {t("managePreferences")}
            <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </>
  );
}
