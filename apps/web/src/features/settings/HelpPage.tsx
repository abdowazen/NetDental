import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { allowed, type Screen } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import {
  BarChart3, CalendarDays, ChevronDown, CircleDollarSign, DatabaseBackup,
  FileQuestion, FlaskConical, Package, Search, Settings2,
  Stethoscope, UserRound, UsersRound,
} from "lucide-react";

type HelpAccess = Screen[] | "admin" | null;
const sections: { id: string; icon: typeof FileQuestion; items: HelpAccess[] }[] = [
  { id: "start", icon: FileQuestion, items: [null, null, null, null, null] },
  { id: "workspace", icon: Stethoscope, items: Array<HelpAccess>(4).fill(["dashboard"]) },
  { id: "appointments", icon: CalendarDays, items: Array<HelpAccess>(6).fill(["appointments"]) },
  { id: "patients", icon: UserRound, items: Array<HelpAccess>(5).fill(["patients"]) },
  { id: "treatment", icon: Stethoscope, items: [["actsProcedures"], ["treatment"], ["treatment"], ["treatment"], ["treatment"], ["treatment"], ["treatment"]] },
  { id: "laboratory", icon: FlaskConical, items: [["treatment"], ["laboratoriesCatalog"], ["treatment"], ["treatment"], ["treatment"]] },
  { id: "payments", icon: CircleDollarSign, items: [["payments"], ["payments"], ["currencySetup"], ["payments", "billsPayments", "purchaseInvoice"], ["billsPayments", "billsCategories"], ["payments", "billsPayments"]] },
  { id: "inventory", icon: Package, items: [["suppliersVendors"], ["suppliesMaterials"], ["purchaseInvoice"], ["purchaseInvoice"], ["purchaseInvoice"], ["purchaseInvoice"]] },
  { id: "analytics", icon: BarChart3, items: [["dashboard"], ["reportNewPatients"], ["reportPatientsStatement", "reportCompletedBalances", "reportLabStatement"], ["reportBillingPayments", "reportInventoryAnalytics"], ["reportNewPatients", "reportPatientsStatement", "reportCompletedBalances", "reportLabStatement", "reportBillingPayments", "reportInventoryAnalytics"]] },
  { id: "administration", icon: UsersRound, items: ["admin", "admin", "admin", "admin", "admin", "admin"] },
  { id: "settings", icon: Settings2, items: [["settings"], ["settings"], ["settings"], ["currencySetup"], ["currencySetup"]] },
  { id: "backup", icon: DatabaseBackup, items: Array<HelpAccess>(5).fill(["backupRestore"]) },
] as const;

export function HelpPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["start"]));
  const canRead = (access: HelpAccess) => access === null || access === "admin" ? access === null || user?.role === "ADMIN" : access.some((screen) => allowed(user, screen));
  const visibleSections = useMemo(() => sections.map((section) => ({ ...section, visibleItems: section.items.map((access, index) => canRead(access) ? index : -1).filter((index) => index >= 0) })).filter((section) => section.visibleItems.length > 0), [user]);
  const results = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return visibleSections;
    return visibleSections.filter((section) =>
      [t(`helpGuide_${section.id}_title`), t(`helpGuide_${section.id}_description`), ...section.visibleItems.map((index) => t(`helpGuide_${section.id}_${index + 1}`))]
        .some((value) => value.toLocaleLowerCase().includes(search)),
    );
  }, [query, t, visibleSections]);
  const allOpen = results.length > 0 && results.every((section) => open.has(section.id));
  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setOpen((current) => {
      const next = new Set(current);
      if (allOpen) results.forEach((section) => next.delete(section.id));
      else results.forEach((section) => next.add(section.id));
      return next;
    });
  }
  return <div className="space-y-5">
    <header>
      <p className="eyebrow">{t("settings")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t("helpGuideTitle")}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("helpGuideDescription")}</p>
    </header>
    <section className="card sticky top-0 z-10 flex flex-wrap items-center gap-3 p-3" aria-label={t("helpSearchLabel")}>
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute left-3 top-3 text-muted" size={18} aria-hidden="true"/>
        <input className="input !min-h-10 py-2 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("helpSearchPlaceholder")}/>
      </div>
      <button type="button" className="button-secondary !min-h-10" onClick={toggleAll}>{t(allOpen ? "helpCollapseAll" : "helpExpandAll")}</button>
    </section>
    {results.length === 0 ? <section className="card py-14 text-center"><Search className="mx-auto text-muted" size={28}/><h2 className="mt-3 font-semibold">{t("helpNoResults")}</h2><p className="mt-1 text-sm text-muted">{t("helpNoResultsHint")}</p></section> :
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {results.map((section) => {
          const Icon = section.icon;
          const expanded = Boolean(query.trim()) || open.has(section.id);
          return <section key={section.id} className="card overflow-hidden">
            <button type="button" className="flex w-full items-start gap-4 p-5 text-left hover:bg-soft" aria-expanded={expanded} aria-controls={`help-${section.id}`} onClick={() => toggle(section.id)}>
              <span className="rounded-xl bg-accent-soft p-3 text-accent-ink"><Icon size={21} aria-hidden="true"/></span>
              <span className="min-w-0 flex-1"><strong className="block text-base">{t(`helpGuide_${section.id}_title`)}</strong><span className="mt-1 block text-sm leading-5 text-muted">{t(`helpGuide_${section.id}_description`)}</span></span>
              <ChevronDown className={`mt-2 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} size={18}/>
            </button>
            {expanded && <ul id={`help-${section.id}`} className="space-y-2 border-t border-line p-5 text-sm leading-6">
              {section.visibleItems.map((index) => <li key={index} className="flex gap-3 rounded-lg bg-soft px-4 py-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-solid"/><span>{t(`helpGuide_${section.id}_${index + 1}`)}</span></li>)}
            </ul>}
          </section>;
        })}
      </div>}
  </div>;
}
