import { allowed, type Screen } from "@clinic/shared";
import { useAuth } from "../features/auth/AuthProvider";
import { useId, useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

export function SidebarGroup({
  label,
  icon: Icon,
  items,
  collapsed,
  expandSidebar,
}: {
  label: string;
  icon: LucideIcon;
  items: { label: string; icon: LucideIcon; to?: string }[];
  collapsed: boolean;
  expandSidebar: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(items.some((item) => item.to && pathname.startsWith(item.to)));
  const id = useId();
  const { user } = useAuth();
  const visibleItems = items.filter((item) =>
    allowed(user, item.label as Screen),
  );
  if (!visibleItems.length) return null;
  return (
    <div>
      <button
        type="button"
        className={`nav-item w-full text-left ${items.some((item) => item.to && pathname.startsWith(item.to)) ? "active" : ""}`}
        aria-label={t(label)}
        title={collapsed ? t(label) : undefined}
        aria-expanded={!collapsed && expanded}
        aria-controls={id}
        onClick={() => {
          if (collapsed) {
            expandSidebar();
            setExpanded(true);
          } else setExpanded((value) => !value);
        }}
      >
        <Icon size={20} className="shrink-0" aria-hidden="true" />
        {!collapsed && (
          <>
            <span>{t(label)}</span>
            {expanded ? (
              <ChevronDown
                size={16}
                className="ml-auto shrink-0"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                size={16}
                className="ml-auto shrink-0"
                aria-hidden="true"
              />
            )}
          </>
        )}
      </button>
      <ul
        id={id}
        hidden={collapsed || !expanded}
        className="ml-5 mt-1 border-l border-white/30 pl-3"
      >
        {visibleItems.map(({ label: item, icon: ItemIcon, to }) => (
          <li key={item}>
            {to ? <NavLink to={to} className={({ isActive }) => `nav-item w-full text-left ${isActive ? "active" : ""}`}>
              <ItemIcon size={18} className="shrink-0" aria-hidden="true" />
              <span>{t(item)}</span>
            </NavLink> : <button
              type="button"
              disabled
              className="nav-item w-full text-left opacity-50"
              title={`${t(item)} — ${t("comingSoon")}`}
              aria-label={`${t(item)} — ${t("comingSoon")}`}
            >
              <ItemIcon size={18} className="shrink-0" aria-hidden="true" />
              <span>
                <span className="block">{t(item)}</span>
                <span className="mt-1 block text-[10px] leading-none">
                  {t("comingSoon")}
                </span>
              </span>
            </button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
