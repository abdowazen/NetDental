import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import "./i18n";
import "./styles.css";
import { ClinicsRoomsAdminPage, UserAdminFormPage, UsersAdminPage } from "./features/admin/AdminPage";
import { SystemLogsPage } from "./features/admin/SystemLogsPage";
import { ClientErrorReporter } from "./features/admin/ClientErrorReporter";
import { WorkspaceProvider } from "./features/auth/WorkspaceProvider";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { landingPath } from "@clinic/shared";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { AppLayout } from "./components/AppLayout";
import { ClinicalAnalyticsPage } from "./features/dashboard/DashboardPage";
import { DynamicDashboardPage } from "./features/dashboard/DynamicDashboardPage";
import { GeneralSettingsPage } from "./features/settings/SettingsPage";
import { CurrencySetupPage } from "./features/settings/CurrencySetupPage";
import { HelpPage } from "./features/settings/HelpPage";
import { BackupRestorePage } from "./features/settings/BackupRestorePage";
import { PatientSearchPage } from "./features/patients/PatientSearchPage";
import { PatientFormPage } from "./features/patients/PatientFormPage";
import { ProcedureSearchPage } from "./features/procedures/ProcedureSearchPage";
import { ProcedureFormPage } from "./features/procedures/ProcedureFormPage";
import { LaboratoryCatalogPage } from "./features/procedures/LaboratoryCatalogPage";
import { TreatmentWorkspacePage } from "./features/treatment/TreatmentWorkspacePage";
import { NewPatientsReportPage } from "./features/reports/NewPatientsReportPage";
import { LabStatementReportPage } from "./features/reports/LabStatementReportPage";
import { PatientsStatementReportPage } from "./features/reports/PatientsStatementReportPage";
import { BillingAnalyticsPage } from "./features/reports/BillingAnalyticsPage";
import { InventoryAnalyticsPage } from "./features/reports/InventoryAnalyticsPage";
import { BillCategorySearchPage } from "./features/billing/BillCategorySearchPage";
import { BillCategoryFormPage } from "./features/billing/BillCategoryFormPage";
import { BillExpenseSearchPage } from "./features/billing/BillExpenseSearchPage";
import { BillExpenseFormPage } from "./features/billing/BillExpenseFormPage";
import { SupplyItemSearchPage } from "./features/inventory/SupplyItemSearchPage";
import { SupplyItemFormPage } from "./features/inventory/SupplyItemFormPage";
import { SupplierSearchPage } from "./features/inventory/SupplierSearchPage";
import { SupplierFormPage } from "./features/inventory/SupplierFormPage";
import { PurchaseInvoiceSearchPage } from "./features/inventory/PurchaseInvoiceSearchPage";
import { PurchaseInvoiceFormPage } from "./features/inventory/PurchaseInvoiceFormPage";
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
            <ClientErrorReporter />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route element={<ProtectedRoute screen="dashboard" scoped />}>
                    <Route path="/dashboard" element={<DynamicDashboardPage />} />
                    <Route path="/reports/clinical" element={<ClinicalAnalyticsPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="settings" scoped />}>
                    <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
                    <Route path="/settings/general" element={<GeneralSettingsPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="currencySetup" scoped />}>
                    <Route path="/settings/currency" element={<CurrencySetupPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="backupRestore" />}>
                    <Route path="/settings/backup" element={<BackupRestorePage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="help" />}>
                    <Route path="/settings/help" element={<HelpPage />} />
                  </Route>
                  <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
                    <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                    <Route path="/admin/users" element={<UsersAdminPage />} />
                    <Route path="/admin/users/new" element={<UserAdminFormPage />} />
                    <Route path="/admin/users/:id" element={<UserAdminFormPage />} />
                    <Route path="/admin/locations" element={<ClinicsRoomsAdminPage />} />
                    <Route path="/admin/logs" element={<SystemLogsPage />} />
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
                  <Route element={<ProtectedRoute screen="laboratoriesCatalog" scoped />}>
                    <Route path="/laboratories" element={<LaboratoryCatalogPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="treatment" scoped />}>
                    <Route path="/treatment" element={<TreatmentWorkspacePage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="reportNewPatients" scoped />}>
                    <Route path="/reports/new-patients" element={<NewPatientsReportPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="reportPatientsStatement" scoped />}>
                    <Route path="/reports/patients-statement" element={<PatientsStatementReportPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="reportLabStatement" scoped />}>
                    <Route path="/reports/lab-statement" element={<LabStatementReportPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="reportBillingPayments" scoped />}>
                    <Route path="/reports/billing-payments" element={<BillingAnalyticsPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="reportInventoryAnalytics" scoped />}>
                    <Route path="/reports/inventory" element={<InventoryAnalyticsPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="billsCategories" scoped />}>
                    <Route path="/bill-categories" element={<BillCategorySearchPage />} />
                    <Route path="/bill-categories/new" element={<BillCategoryFormPage />} />
                    <Route path="/bill-categories/:id" element={<BillCategoryFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="billsPayments" scoped />}>
                    <Route path="/bills-payments" element={<BillExpenseSearchPage />} />
                    <Route path="/bills-payments/new" element={<BillExpenseFormPage />} />
                    <Route path="/bills-payments/:id" element={<BillExpenseFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="suppliesMaterials" scoped />}>
                    <Route path="/supplies" element={<SupplyItemSearchPage />} />
                    <Route path="/supplies/new" element={<SupplyItemFormPage />} />
                    <Route path="/supplies/:id" element={<SupplyItemFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="suppliersVendors" scoped />}>
                    <Route path="/suppliers" element={<SupplierSearchPage />} />
                    <Route path="/suppliers/new" element={<SupplierFormPage />} />
                    <Route path="/suppliers/:id" element={<SupplierFormPage />} />
                  </Route>
                  <Route element={<ProtectedRoute screen="purchaseInvoice" scoped />}>
                    <Route path="/purchase-invoices" element={<PurchaseInvoiceSearchPage />} />
                    <Route path="/purchase-invoices/new" element={<PurchaseInvoiceFormPage />} />
                    <Route path="/purchase-invoices/:id" element={<PurchaseInvoiceFormPage />} />
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
