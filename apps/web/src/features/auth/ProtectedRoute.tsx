import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthProvider";
import { allowed, type Screen } from "@clinic/shared";
import { useWorkspace } from "./WorkspaceProvider";
export function ProtectedRoute({
  roles = ["DENTIST", "ASSISTANT", "RECEPTIONIST", "ADMIN"],
  screen,
  scoped = false,
}: {
  roles?: string[];
  screen?: Screen;
  scoped?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { roomId, clinicId } = useWorkspace();
  if (!user) return <Navigate to="/login" replace />;
  if (!clinicId && new Set(user.access?.rooms.map((r) => r.clinicId)).size > 1)
    return <Navigate to="/login" replace />;
  if (!roles.includes(user.role) || (screen && !allowed(user, screen)))
    return (
      <main className="p-12">
        <h1>{t("forbiddenTitle")}</h1>
        <p>{t("forbiddenDescription")}</p>
      </main>
    );
  if (scoped && !roomId)
    return (
      <section className="card p-8">
        <h2 className="text-xl font-semibold">{t("selectLocation")}</h2>
        <p className="mt-3 text-muted">
          {t(
            user.access?.rooms.length ? "selectLocationHint" : "noAssignments",
          )}
        </p>
      </section>
    );
  return <Outlet />;
}
