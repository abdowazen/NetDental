import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import "./i18n";
import "./styles.css";
import { AdminPage } from "./features/admin/AdminPage";
import { WorkspaceProvider } from "./features/auth/WorkspaceProvider";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { landingPath } from "@clinic/shared";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PatientSearchPage } from "./features/patients/PatientSearchPage";
import { PatientFormPage } from "./features/patients/PatientFormPage";
import { ProcedureSearchPage } from "./features/procedures/ProcedureSearchPage";
import { ProcedureFormPage } from "./features/procedures/ProcedureFormPage";
import { TreatmentWorkspacePage } from "./features/treatment/TreatmentWorkspacePage";
import { applyAppearance, readAppearance } from "./lib/appearance";
applyAppearance(readAppearance());
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? landingPath(user) : "/login"} replace />;
}
function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="p-12">
      <p>{t("notFound")}</p>
      <Link to="/dashboard">{t("backDashboard")}</Link>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route element={<ProtectedRoute screen="dashboard" scoped />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="settings" scoped />}>
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                  <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                    <Route path="/admin" element={<AdminPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="patients" scoped />}>
                    <Route path="/patients" element={<PatientSearchPage />} />
                    <Route path="/patients/new" element={<PatientFormPage />} />
                    <Route path="/patients/:id" element={<PatientFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="actsProcedures" scoped />}>
                    <Route path="/procedures" element={<ProcedureSearchPage />} />
                    <Route path="/procedures/new" element={<ProcedureFormPage />} />
                    <Route path="/procedures/:id" element={<ProcedureFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="treatment" scoped />}>
                    <Route path="/treatment" element={<TreatmentWorkspacePage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="/" element={<Home />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
