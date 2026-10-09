import { allowed, type Screen } from "@clinic/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { useWorkspace, WorkspaceSelect } from "../features/auth/WorkspaceProvider";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  UserRound,
  UsersRound,
  Settings,
  Stethoscope,
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Tags,
  CreditCard,
  Package,
  Receipt,
  Boxes,
  Truck,
  FlaskConical,
  SlidersHorizontal,
  CircleDollarSign,
  DatabaseBackup,
  CircleHelp,
  UserCog,
  Building2,
  ScrollText,
  CalendarDays,
} from "lucide-react";
import { Brand } from "./ui";
import { LanguageSelect } from "./LanguageSelect";
import { UserMenu } from "./UserMenu";
import { SidebarGroup } from "./SidebarGroup";
import { ToothIcon } from "./ToothIcon";
import { AnalyticsSidebar } from "./AnalyticsSidebar";
import { api } from "../lib/api";
function Sidebar({
  collapsed,
  toggle,
}: {
  collapsed: boolean;
  toggle: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [clinicalExpanded, setClinicalExpanded] = useState(true);
  const [procedureCatalogExpanded, setProcedureCatalogExpanded] = useState(
    pathname.startsWith("/procedures") || pathname.startsWith("/laboratories"),
  );
  const [settingsExpanded, setSettingsExpanded] = useState(
    pathname.startsWith("/settings"),
  );
  const [administrationExpanded, setAdministrationExpanded] = useState(
    pathname.startsWith("/admin"),
  );
  const clinicalVisible = !collapsed && clinicalExpanded;
  const settingsVisible = !collapsed && settingsExpanded;
  const administrationVisible = !collapsed && administrationExpanded;
  return (
    <aside className={`sidebar ${collapsed ? "w-20" : "w-64"}`}>
      <button
        type="button"
        onClick={toggle}
        className="absolute -right-3 top-1/2 z-30 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-accent-ink shadow-md transition-colors hover:bg-accent-soft"
        aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
        title={t(collapsed ? "expandSidebar" : "collapseSidebar")}
        aria-expanded={!collapsed}
        aria-controls="sidebar-navigation"
      >
        {collapsed ? (
          <ChevronRight size={18} aria-hidden="true" />
        ) : (
          <ChevronLeft size={18} aria-hidden="true" />
        )}
      </button>
      <div className="flex h-24 shrink-0 items-center px-5">
        <NavLink
          to="/dashboard"
          className="brand-home-link"
          aria-label={t("appName")}
          title={collapsed ? t("appName") : undefined}
        >
          <Brand compact={collapsed} />
        </NavLink>
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <nav
          id="sidebar-navigation"
          aria-label={t("workspace")}
          className="space-y-2"
        >
          {allowed(user, "dashboard") && (
            <NavLink
              to="/dashboard"
              title={collapsed ? t("dashboard") : undefined}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <LayoutDashboard size={20} />
              {!collapsed && t("dashboard")}
            </NavLink>
          )}
          {allowed(user, "appointments") && (
            <NavLink to="/appointments" title={collapsed ? t("appointments") : undefined} className={({isActive})=>`nav-item ${isActive?"active":""}`}>
              <CalendarDays size={20}/>{!collapsed&&t("appointments")}
            </NavLink>
          )}
          <div
            hidden={
              ![
                "patients",
                "treatment",
                "actsProcedures",
                "laboratoriesCatalog",
              ].some((screen) => allowed(user, screen as Screen))
            }
          >
            <button
              type="button"
              className="nav-item w-full text-left"
              aria-label={t("clinical")}
              title={collapsed ? t("clinical") : undefined}
              aria-expanded={clinicalVisible}
              aria-controls="clinical-submenu"
              onClick={() => {
                if (collapsed) {
                  toggle();
                  setClinicalExpanded(true);
                } else {
                  setClinicalExpanded((expanded) => !expanded);
                }
              }}
            >
              <ToothIcon size={20} className="shrink-0" aria-hidden="true" />
              {!collapsed && (
                <>
                  <span>{t("clinical")}</span>
                  {clinicalExpanded ? (
                    <ChevronDown
                      size={16}
                      className="ml-auto"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRight
                      size={16}
                      className="ml-auto"
                      aria-hidden="true"
                    />
                  )}
                </>
              )}
            </button>
            <ul
              id="clinical-submenu"
              hidden={!clinicalVisible}
              className="ml-5 mt-1 border-l border-white/30 pl-3"
            >
              {[
                { label: "patients", icon: UsersRound, to: "/patients" },
                { label: "treatment", icon: Stethoscope, to: "/treatment" },
              ].filter(({ label }) => allowed(user, label as Screen)).map(({ label, icon: Icon, to }) => (
                <li key={label}>
                  <NavLink to={to} className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}>
                    <Icon size={18} className="shrink-0" aria-hidden="true"/>
                    <span>{t(label)}</span>
                  </NavLink>
                </li>
              ))}
              {(allowed(user, "actsProcedures") || allowed(user, "laboratoriesCatalog")) && (
                <li>
                  <button type="button" className={`nav-item w-full text-left ${pathname.startsWith("/procedures") || pathname.startsWith("/laboratories") ? "active" : ""}`}
                    aria-expanded={procedureCatalogExpanded} aria-controls="procedure-catalog-submenu" onClick={() => setProcedureCatalogExpanded((expanded) => !expanded)}>
                    <ClipboardList size={18} className="shrink-0" aria-hidden="true"/><span>{t("actsProcedures")}</span>
                    {procedureCatalogExpanded ? <ChevronDown size={15} className="ml-auto" aria-hidden="true"/> : <ChevronRight size={15} className="ml-auto" aria-hidden="true"/>}
                  </button>
                  <ul id="procedure-catalog-submenu" hidden={!procedureCatalogExpanded} className="ml-5 mt-1 border-l border-white/30 pl-3">
                    {allowed(user, "actsProcedures") && <li><NavLink to="/procedures" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><ClipboardList size={17} className="shrink-0" aria-hidden="true"/><span>{t("procedures")}</span></NavLink></li>}
                    {allowed(user, "laboratoriesCatalog") && <li><NavLink to="/laboratories" className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}><FlaskConical size={17} className="shrink-0" aria-hidden="true"/><span>{t("laboratoriesCatalog")}</span></NavLink></li>}
                  </ul>
                </li>
              )}
            </ul>
          </div>
          <SidebarGroup
            label="billingPayments"
            icon={Wallet}
            collapsed={collapsed}
            expandSidebar={toggle}
            items={[
              { label: "billsPayments", icon: CreditCard, to: "/bills-payments" },
              { label: "billsCategories", icon: Tags, to: "/bill-categories" },
            ]}
          />
          <SidebarGroup
            label="inventory"
            icon={Package}
            collapsed={collapsed}
            expandSidebar={toggle}
            items={[
              { label: "purchaseInvoice", icon: Receipt, to: "/purchase-invoices" },
              { label: "suppliesMaterials", icon: Boxes, to: "/supplies" },
              { label: "suppliersVendors", icon: Truck, to: "/suppliers" },
            ]}
          />
          <AnalyticsSidebar collapsed={collapsed} expandSidebar={toggle} />
          {(allowed(user, "settings") || allowed(user, "currencySetup") || allowed(user, "backupRestore") || allowed(user, "help")) && (
            <div>
              <button
                type="button"
                className={`nav-item w-full text-left ${pathname.startsWith("/settings") ? "active" : ""}`}
                aria-label={t("settings")}
                title={collapsed ? t("settings") : undefined}
                aria-expanded={settingsVisible}
                aria-controls="settings-submenu"
                onClick={() => {
                  if (collapsed) {
                    toggle();
                    setSettingsExpanded(true);
                  } else {
                    setSettingsExpanded((expanded) => !expanded);
                  }
                }}
              >
                <Settings size={20} className="shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <>
                    <span>{t("settings")}</span>
                    {settingsExpanded ? (
                      <ChevronDown size={16} className="ml-auto" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} className="ml-auto" aria-hidden="true" />
                    )}
                  </>
                )}
              </button>
              <ul
                id="settings-submenu"
                hidden={!settingsVisible}
                className="ml-5 mt-1 border-l border-white/30 pl-3"
              >
                {allowed(user, "settings") && <li>
                  <NavLink
                    to="/settings/general"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <SlidersHorizontal size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("generalSettings")}</span>
                  </NavLink>
                </li>}
                {allowed(user, "currencySetup") && <li>
                  <NavLink
                    to="/settings/currency"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <CircleDollarSign size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("currencySetup")}</span>
                  </NavLink>
                </li>}
                {allowed(user, "backupRestore") && <li>
                  <NavLink
                    to="/settings/backup"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <DatabaseBackup size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("backupRestore")}</span>
                  </NavLink>
                </li>}
                {allowed(user, "help") && <li>
                  <NavLink
                    to="/settings/help"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <CircleHelp size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("help")}</span>
                  </NavLink>
                </li>}
              </ul>
            </div>
          )}
          {user?.role === "ADMIN" && (
            <div>
              <button
                type="button"
                className={`nav-item w-full text-left ${pathname.startsWith("/admin") ? "active" : ""}`}
                aria-label={t("administration")}
                title={collapsed ? t("administration") : undefined}
                aria-expanded={administrationVisible}
                aria-controls="administration-submenu"
                onClick={() => {
                  if (collapsed) {
                    toggle();
                    setAdministrationExpanded(true);
                  } else {
                    setAdministrationExpanded((expanded) => !expanded);
                  }
                }}
              >
                <UserRound size={20} className="shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <>
                    <span>{t("administration")}</span>
                    {administrationExpanded ? (
                      <ChevronDown size={16} className="ml-auto" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} className="ml-auto" aria-hidden="true" />
                    )}
                  </>
                )}
              </button>
              <ul
                id="administration-submenu"
                hidden={!administrationVisible}
                className="ml-5 mt-1 border-l border-white/30 pl-3"
              >
                <li>
                  <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <UserCog size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("manageUsers")}</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/admin/locations"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <Building2 size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("clinicsRooms")}</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/admin/logs"
                    className={({ isActive }) =>
                      `nav-item w-full text-left ${isActive ? "active" : ""}`
                    }
                  >
                    <ScrollText size={18} className="shrink-0" aria-hidden="true" />
                    <span>{t("systemLogs")}</span>
                  </NavLink>
                </li>
              </ul>
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}
function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { roomId } = useWorkspace();
  const currency = useQuery({
    queryKey: ["base-currency", roomId],
    queryFn: () => api<{ baseCurrency: "USD" | "LBP" }>("/api/base-currency"),
    enabled: Boolean(roomId),
  });
  const currencyCode = currency.data?.baseCurrency ?? null;
  return (
    <header className="flex h-24 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-surface px-8 text-ink">
      <div className="min-w-0 space-y-2">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {t(
            pathname.startsWith("/admin/users")
              ? "manageUsers"
              : pathname === "/admin/locations"
                ? "clinicsRooms"
                : pathname === "/admin/logs"
                  ? "systemLogs"
                : pathname === "/admin"
                  ? "administration"
              : pathname.startsWith("/patients")
                ? "patients"
                : pathname.startsWith("/procedures")
                  ? "actsProcedures"
                : pathname.startsWith("/bill-categories")
                  ? "billsCategories"
                : pathname.startsWith("/bills-payments")
                  ? "billsPayments"
                : pathname === "/treatment"
                  ? "treatment"
                : pathname === "/settings/currency"
                  ? "currencySetup"
                : pathname === "/settings/help"
                  ? "help"
                : pathname === "/settings/backup"
                  ? "backupRestore"
                : pathname.startsWith("/settings")
                  ? "generalSettings"
                : pathname.startsWith("/reports")
                  ? "reportsListing"
                  : "dashboard",
          )}
        </h1>
        <WorkspaceSelect />
      </div>
      <div className="flex items-center gap-6">
        <LanguageSelect />
        {currencyCode && (
          <span
            dir="ltr"
            className="inline-flex min-w-8 items-center justify-center text-sm font-semibold text-muted"
            aria-label={`${t("baseCurrency")}: ${currencyCode}`}
            title={`${t("baseCurrency")}: ${currencyCode}`}
          >
            {currencyCode}
          </span>
        )}
        <span className="h-7 w-px bg-line" />
        <UserMenu />
      </div>
    </header>
  );
}
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const patientForm = pathname.startsWith("/patients") || pathname.startsWith("/procedures") || pathname.startsWith("/bill-categories") || pathname.startsWith("/bills-payments") || pathname.startsWith("/reports") || pathname === "/treatment";
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link">
        {t("skipContent")}
      </a>
      <Sidebar collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} />
      <div className="min-w-0 flex-1">
        <Header />
        <main
          id="main"
          className={pathname === "/treatment" ? "w-full px-4 py-3 lg:px-5" : `mx-auto max-w-7xl px-6 lg:px-8 ${patientForm ? "py-4" : "py-10"}`}
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
