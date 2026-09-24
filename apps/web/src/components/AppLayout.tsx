import { allowed, type Screen } from "@clinic/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { WorkspaceSelect } from "../features/auth/WorkspaceProvider";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  UsersRound,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  ClipboardList,
  FileChartColumn,
  ChevronDown,
  ChevronRight,
  Wallet,
  Tags,
  CreditCard,
  ChartColumn,
  Package,
  Receipt,
  Boxes,
  Truck,
} from "lucide-react";
import { Brand } from "./ui";
import { LanguageSelect } from "./LanguageSelect";
import { UserMenu } from "./UserMenu";
import { SidebarGroup } from "./SidebarGroup";
import { ToothIcon } from "./ToothIcon";
function Sidebar({
  collapsed,
  toggle,
}: {
  collapsed: boolean;
  toggle: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clinicalExpanded, setClinicalExpanded] = useState(true);
  const clinicalVisible = !collapsed && clinicalExpanded;
  return (
    <aside className={`sidebar ${collapsed ? "w-20" : "w-64"}`}>
      <div className="flex h-24 shrink-0 items-center px-5">
        <Brand compact={collapsed} />
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <nav aria-label={t("workspace")} className="space-y-2">
          <button
          onClick={toggle}
          type="button"
          className="nav-item w-full text-left"
          aria-label={t(collapsed ? "expandSidebar" : "collapseSidebar")}
          title={t(collapsed ? "expandSidebar" : "collapseSidebar")}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} />
          ) : (
            <>
              <PanelLeftClose size={20} />
              <span className="text-xs">{t("collapseSidebar")}</span>
            </>
          )}
        </button>
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
          <div
            hidden={
              ![
                "patients",
                "treatment",
                "actsProcedures",
                "reportsListing",
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
                { label: "patients", icon: UsersRound },
                { label: "treatment", icon: Stethoscope },
                { label: "actsProcedures", icon: ClipboardList },
                { label: "reportsListing", icon: FileChartColumn },
              ]
                .filter(({ label }) => allowed(user, label as Screen))
                .map(({ label, icon: Icon }) => (
                  <li key={label}>
                    {label === "patients" || label === "actsProcedures" || label === "treatment" ? (
                      <NavLink
                        to={label === "patients" ? "/patients" : label === "treatment" ? "/treatment" : "/procedures"}
                        className={({ isActive }) =>
                          `nav-item w-full text-left ${isActive ? "active" : ""}`
                        }
                      >
                        <Icon
                          size={18}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                        <span>{t(label)}</span>
                      </NavLink>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="nav-item w-full text-left opacity-50"
                        title={`${t(label)} — ${t("comingSoon")}`}
                        aria-label={`${t(label)} — ${t("comingSoon")}`}
                      >
                        <Icon
                          size={18}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          <span className="block">{t(label)}</span>
                          <span className="mt-1 block text-[10px] leading-none">
                            {t("comingSoon")}
                          </span>
                        </span>
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
          <SidebarGroup
            label="billingPayments"
            icon={Wallet}
            collapsed={collapsed}
            expandSidebar={toggle}
            items={[
              { label: "billsCategories", icon: Tags },
              { label: "payments", icon: CreditCard },
              { label: "reportsAnalytics", icon: ChartColumn },
            ]}
          />
          <SidebarGroup
            label="inventory"
            icon={Package}
            collapsed={collapsed}
            expandSidebar={toggle}
            items={[
              { label: "purchaseInvoice", icon: Receipt },
              { label: "suppliesMaterials", icon: Boxes },
              { label: "suppliersVendors", icon: Truck },
            ]}
          />
          {allowed(user, "settings") && (
            <NavLink
              to="/settings"
              title={collapsed ? t("settings") : undefined}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Settings size={20} />
              {!collapsed && t("settings")}
            </NavLink>
          )}
          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title={t("administration")}
            >
              <Settings size={20} />
              {!collapsed && t("administration")}
            </NavLink>
          )}
        </nav>
      </div>
    </aside>
  );
}
function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <header className="flex h-24 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-surface px-8 text-ink">
      <div className="min-w-0 space-y-2">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {t(
            pathname === "/admin"
              ? "administration"
              : pathname.startsWith("/patients")
                ? "patients"
                : pathname.startsWith("/procedures")
                  ? "actsProcedures"
                : pathname === "/treatment"
                  ? "treatment"
                : pathname === "/settings"
                  ? "settings"
                  : "dashboard",
          )}
        </h1>
        <WorkspaceSelect />
      </div>
      <div className="flex items-center gap-6">
        <LanguageSelect />
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
  const patientForm = pathname.startsWith("/patients") || pathname.startsWith("/procedures") || pathname === "/treatment";
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
