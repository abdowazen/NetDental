import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock3 } from "lucide-react";

const currentBehaviorKeys = [
  "helpCurrentPatients",
  "helpCurrentTreatment",
  "helpCurrentSessions",
  "helpCurrentFinance",
  "helpCurrentFiles",
  "helpCurrentAccess",
  "helpCurrentBackup",
] as const;

const futureBehaviorKeys = [
  "helpFutureStatements",
  "helpFutureBilling",
  "helpFutureInventory",
] as const;

export function HelpPage() {
  const { t } = useTranslation();

  return (
    <>
      <p className="eyebrow">{t("settings")}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {t("help")}
      </h2>
      <p className="mb-9 mt-3 text-sm text-muted">{t("helpDescription")}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <HelpSection
          icon={CheckCircle2}
          title={t("helpCurrentBehavior")}
          description={t("helpCurrentBehaviorDescription")}
          items={currentBehaviorKeys.map((key) => t(key))}
          tone="current"
        />
        <HelpSection
          icon={Clock3}
          title={t("helpFutureBehavior")}
          description={t("helpFutureBehaviorDescription")}
          items={futureBehaviorKeys.map((key) => t(key))}
          tone="future"
        />
      </div>
    </>
  );
}

function HelpSection({
  icon: Icon,
  title,
  description,
  items,
  tone,
}: {
  icon: typeof CheckCircle2;
  title: string;
  description: string;
  items: string[];
  tone: "current" | "future";
}) {
  const iconClass =
    tone === "current"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";

  return (
    <section className="card p-7">
      <div className="flex items-start gap-4">
        <span className={`rounded-full p-3 ${iconClass}`}>
          <Icon size={21} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      <ul className="mt-6 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-3 rounded-lg bg-soft px-4 py-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-solid" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
