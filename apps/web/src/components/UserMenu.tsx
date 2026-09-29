import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider";
import { errorKey } from "../lib/api";
import { allowed } from "@clinic/shared";
export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", click);
    return () => document.removeEventListener("pointerdown", click);
  }, []);
  if (!user) return null;
  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <div
      className="relative"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="flex items-center gap-3 rounded-lg p-1.5 text-left"
        aria-label={t("userMenu")}
        aria-expanded={open}
        aria-controls="user-dropdown"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="hidden lg:block">
          <span className="block max-w-40 truncate text-sm font-semibold">
            {user.displayName}
          </span>
          <span className="text-xs text-muted">
            {t(user.role === "ADMIN" ? "administrator" : user.role.toLowerCase())}
          </span>
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="user-dropdown"
          className="absolute right-0 z-20 mt-3 w-60 rounded-xl border border-line bg-surface p-2 text-ink shadow-lg"
        >
          {allowed(user, "settings") && (
            <Link
              className="menu-item"
              to="/settings/general"
              onClick={() => setOpen(false)}
            >
              <Settings size={17} />
              {t("generalSettings")}
            </Link>
          )}
          <button
            className="menu-item w-full"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await logout();
              } catch (e) {
                setError(errorKey(e));
              } finally {
                setPending(false);
              }
            }}
          >
            <LogOut size={17} />
            {t(pending ? "signingOut" : "signOut")}
          </button>
          {error && (
            <p role="alert" className="p-2 text-sm text-danger-ink">
              {t(error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
