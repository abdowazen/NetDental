import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, BarChart3, ChevronDown, ChevronRight, CircleDollarSign, CreditCard, FlaskConical, Package, Receipt, Stethoscope, UsersRound } from "lucide-react";
import { allowed } from "@clinic/shared";
import { useTranslation } from "react-i18next";
import { useAuth } from "../features/auth/AuthProvider";

export function AnalyticsSidebar({ collapsed, expandSidebar }: { collapsed: boolean; expandSidebar: () => void }) {
  const { t } = useTranslation(); const { user } = useAuth(); const { pathname } = useLocation();
  const newPatientsAllowed = allowed(user, "reportNewPatients");
  const patientsStatementAllowed = allowed(user, "reportPatientsStatement");
  const completedBalancesAllowed = allowed(user, "reportCompletedBalances");
  const labStatementAllowed = allowed(user, "reportLabStatement");
  const clinicalDashboardAllowed = allowed(user, "dashboard");
  const clinicalAllowed = clinicalDashboardAllowed || newPatientsAllowed || patientsStatementAllowed || completedBalancesAllowed || labStatementAllowed;
  const billingAllowed = allowed(user, "reportBillingPayments");
  const inventoryAllowed = allowed(user, "reportInventoryAnalytics");
  const [expanded, setExpanded] = useState(pathname.startsWith("/reports"));
  const [clinicalExpanded, setClinicalExpanded] = useState(pathname.startsWith("/reports"));
  const [billingExpanded, setBillingExpanded] = useState(pathname === "/reports/billing-payments");
  const [inventoryExpanded, setInventoryExpanded] = useState(pathname === "/reports/inventory");
  const clinicalActive = ["/reports/clinical", "/reports/new-patients", "/reports/patients-statement", "/reports/completed-balances", "/reports/lab-statement"].includes(pathname);
  if (!clinicalAllowed && !billingAllowed && !inventoryAllowed) return null;
  const visible = !collapsed && expanded;
  return <div>
    <button type="button" className={`nav-item w-full text-left ${pathname.startsWith("/reports") ? "active" : ""}`} aria-label={t("analytics")} title={collapsed ? t("analytics") : undefined} aria-expanded={visible} aria-controls="analytics-submenu" onClick={() => { if (collapsed) { expandSidebar(); setExpanded(true); } else setExpanded((value) => !value); }}>
      <BarChart3 size={20} className="shrink-0" aria-hidden="true"/>{!collapsed && <><span>{t("analytics")}</span>{expanded ? <ChevronDown size={16} className="ml-auto"/> : <ChevronRight size={16} className="ml-auto"/>}</>}
    </button>
    <ul id="analytics-submenu" hidden={!visible} className="ml-5 mt-1 border-l border-white/30 pl-3">
      {clinicalAllowed && <li><button type="button" className={`nav-item w-full text-left ${clinicalActive ? "active" : ""}`} aria-expanded={clinicalExpanded} aria-controls="clinical-analytics-submenu" onClick={() => setClinicalExpanded((value) => !value)}><Stethoscope size={17} className="shrink-0"/><span>{t("analyticsClinical")}</span>{clinicalExpanded ? <ChevronDown size={15} className="ml-auto"/> : <ChevronRight size={15} className="ml-auto"/>}</button>
        <ul id="clinical-analytics-submenu" hidden={!clinicalExpanded} className="ml-5 mt-1 border-l border-white/30 pl-3">
          {clinicalDashboardAllowed && <li><NavLink to="/reports/clinical" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><Activity size={16}/><span>{t("clinicalAnalytics")}</span></NavLink></li>}
          {newPatientsAllowed && <li><NavLink to="/reports/new-patients" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><UsersRound size={16}/><span>{t("reportNewPatients")}</span></NavLink></li>}
          {patientsStatementAllowed && <li><NavLink to="/reports/patients-statement" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><Receipt size={16}/><span>{t("reportPatientsStatement")}</span></NavLink></li>}
          {completedBalancesAllowed && <li><NavLink to="/reports/completed-balances" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><CircleDollarSign size={16}/><span>{t("reportCompletedBalances")}</span></NavLink></li>}
          {labStatementAllowed && <li><NavLink to="/reports/lab-statement" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><FlaskConical size={16}/><span>{t("reportLabStatement")}</span></NavLink></li>}
        </ul>
      </li>}
      {billingAllowed && <li><button type="button" className={`nav-item w-full text-left ${pathname === "/reports/billing-payments" ? "active" : ""}`} aria-expanded={billingExpanded} aria-controls="billing-analytics-submenu" onClick={() => setBillingExpanded((value) => !value)}><CreditCard size={17}/><span>{t("analyticsBilling")}</span>{billingExpanded ? <ChevronDown size={15} className="ml-auto"/> : <ChevronRight size={15} className="ml-auto"/>}</button>
        <ul id="billing-analytics-submenu" hidden={!billingExpanded} className="ml-5 mt-1 border-l border-white/30 pl-3"><li><NavLink to="/reports/billing-payments" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><CreditCard size={16}/><span>{t("billingAnalyticsReport")}</span></NavLink></li></ul>
      </li>}
      {inventoryAllowed && <li><button type="button" className={`nav-item w-full text-left ${pathname === "/reports/inventory" ? "active" : ""}`} aria-expanded={inventoryExpanded} aria-controls="inventory-analytics-submenu" onClick={() => setInventoryExpanded((value) => !value)}><Package size={17}/><span>{t("analyticsInventory")}</span>{inventoryExpanded ? <ChevronDown size={15} className="ml-auto"/> : <ChevronRight size={15} className="ml-auto"/>}</button><ul id="inventory-analytics-submenu" hidden={!inventoryExpanded} className="ml-5 mt-1 border-l border-white/30 pl-3"><li><NavLink to="/reports/inventory" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><Package size={16}/><span>{t("inventoryAnalyticsReport")}</span></NavLink></li></ul></li>}
    </ul>
  </div>;
}
