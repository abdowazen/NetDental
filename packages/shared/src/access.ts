import { z } from "zod";

export const screens = [
  "dashboard",
  "appointments",
  "patients",
  "treatment",
  "actsProcedures",
  "laboratoriesCatalog",
  "reportNewPatients",
  "reportPatientsStatement",
  "reportCompletedBalances",
  "reportLabStatement",
  "reportBillingPayments",
  "reportInventoryAnalytics",
  "billsCategories",
  "billsPayments",
  "payments",
  "purchaseInvoice",
  "suppliesMaterials",
  "suppliersVendors",
  "settings",
  "currencySetup",
  "backupRestore",
  "help",
] as const;
export type Screen = (typeof screens)[number];
export const actions = ["view", "create", "modify", "delete"] as const;
export type Action = (typeof actions)[number];
export type Permission = {
  screen: Screen;
  view: boolean;
  create: boolean;
  modify: boolean;
  delete: boolean;
};
export type RoomAccess = {
  id: number;
  name: string;
  clinicId: number;
  clinicName: string;
};
export type Access = { permissions: Permission[]; rooms: RoomAccess[] };
export const defaultPages = [
  "automatic",
  "dashboard",
  "appointments",
  "patients",
  "treatment",
  "procedures",
  "laboratories",
  "clinicalAnalytics",
  "newPatients",
  "patientsStatement",
  "completedBalances",
  "labStatement",
  "billingAnalytics",
  "inventoryAnalytics",
  "billsPayments",
  "billCategories",
  "purchaseInvoices",
  "supplies",
  "suppliers",
  "generalSettings",
  "currencySetup",
  "backupRestore",
  "help",
  "adminUsers",
  "adminLocations",
  "adminLogs",
] as const;
export type DefaultPage = (typeof defaultPages)[number];
export const defaultPageSchema = z.enum(defaultPages);
export const defaultPageOptions: ReadonlyArray<{
  value: Exclude<DefaultPage, "automatic">;
  path: string;
  label: string;
  screen?: Screen;
  administrator?: boolean;
}> = [
  { value: "dashboard", path: "/dashboard", label: "dashboard", screen: "dashboard" },
  { value: "appointments", path: "/appointments", label: "appointments", screen: "appointments" },
  { value: "patients", path: "/patients", label: "patients", screen: "patients" },
  { value: "treatment", path: "/treatment", label: "treatment", screen: "treatment" },
  { value: "procedures", path: "/procedures", label: "procedures", screen: "actsProcedures" },
  { value: "laboratories", path: "/laboratories", label: "laboratoriesCatalog", screen: "laboratoriesCatalog" },
  { value: "clinicalAnalytics", path: "/reports/clinical", label: "clinicalAnalytics", screen: "dashboard" },
  { value: "newPatients", path: "/reports/new-patients", label: "reportNewPatients", screen: "reportNewPatients" },
  { value: "patientsStatement", path: "/reports/patients-statement", label: "reportPatientsStatement", screen: "reportPatientsStatement" },
  { value: "completedBalances", path: "/reports/completed-balances", label: "reportCompletedBalances", screen: "reportCompletedBalances" },
  { value: "labStatement", path: "/reports/lab-statement", label: "reportLabStatement", screen: "reportLabStatement" },
  { value: "billingAnalytics", path: "/reports/billing-payments", label: "billingAnalyticsReport", screen: "reportBillingPayments" },
  { value: "inventoryAnalytics", path: "/reports/inventory", label: "inventoryAnalyticsReport", screen: "reportInventoryAnalytics" },
  { value: "billsPayments", path: "/bills-payments", label: "billsPayments", screen: "billsPayments" },
  { value: "billCategories", path: "/bill-categories", label: "billsCategories", screen: "billsCategories" },
  { value: "purchaseInvoices", path: "/purchase-invoices", label: "purchaseInvoice", screen: "purchaseInvoice" },
  { value: "supplies", path: "/supplies", label: "suppliesMaterials", screen: "suppliesMaterials" },
  { value: "suppliers", path: "/suppliers", label: "suppliersVendors", screen: "suppliersVendors" },
  { value: "generalSettings", path: "/settings/general", label: "generalSettings", screen: "settings" },
  { value: "currencySetup", path: "/settings/currency", label: "currencySetup", screen: "currencySetup" },
  { value: "backupRestore", path: "/settings/backup", label: "backupRestore", screen: "backupRestore" },
  { value: "help", path: "/settings/help", label: "help", screen: "help" },
  { value: "adminUsers", path: "/admin/users", label: "manageUsers", administrator: true },
  { value: "adminLocations", path: "/admin/locations", label: "clinicsRooms", administrator: true },
  { value: "adminLogs", path: "/admin/logs", label: "systemLogs", administrator: true },
];
export function allowed(
  user: { role: string; access?: Access } | null,
  screen: Screen,
  action: Action = "view",
) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const permission = user.access?.permissions.find(
    (item) => item.screen === screen,
  );
  return Boolean(permission?.view && permission[action]);
}
export function canUseDefaultPage(
  user: { role: string; access?: Access } | null,
  page: DefaultPage,
) {
  if (page === "automatic") return true;
  const option = defaultPageOptions.find((item) => item.value === page);
  if (!option || !user) return false;
  if (option.administrator) return user.role === "ADMIN";
  return Boolean(option.screen && allowed(user, option.screen));
}
function automaticLandingPath(user: { role: string; access?: Access } | null) {
  if (user?.role === "ADMIN") return "/admin/users";
  return allowed(user, "dashboard")
    ? "/dashboard"
    : allowed(user, "appointments")
      ? "/appointments"
    : allowed(user, "patients")
      ? "/patients"
      : allowed(user, "treatment")
        ? "/treatment"
      : allowed(user, "actsProcedures")
        ? "/procedures"
      : allowed(user, "laboratoriesCatalog")
        ? "/laboratories"
      : allowed(user, "reportNewPatients")
        ? "/reports/new-patients"
      : allowed(user, "reportPatientsStatement")
        ? "/reports/patients-statement"
      : allowed(user, "reportCompletedBalances")
        ? "/reports/completed-balances"
      : allowed(user, "reportLabStatement")
        ? "/reports/lab-statement"
      : allowed(user, "reportBillingPayments")
        ? "/reports/billing-payments"
      : allowed(user, "reportInventoryAnalytics")
        ? "/reports/inventory"
      : allowed(user, "billsPayments")
        ? "/bills-payments"
      : allowed(user, "billsCategories")
        ? "/bill-categories"
      : allowed(user, "suppliesMaterials")
        ? "/supplies"
      : allowed(user, "purchaseInvoice")
        ? "/purchase-invoices"
      : allowed(user, "suppliersVendors")
        ? "/suppliers"
      : allowed(user, "settings")
        ? "/settings"
      : allowed(user, "currencySetup")
        ? "/settings/currency"
      : allowed(user, "backupRestore")
        ? "/settings/backup"
      : allowed(user, "help")
        ? "/settings/help"
        : "/dashboard";
}
export function landingPath(
  user: { role: string; access?: Access; defaultPage?: DefaultPage } | null,
) {
  const selected = user?.defaultPage ?? "automatic";
  if (selected !== "automatic" && canUseDefaultPage(user, selected))
    return defaultPageOptions.find((item) => item.value === selected)!.path;
  return automaticLandingPath(user);
}
const permissionSchema = z
  .object({
    screen: z.enum(screens),
    view: z.boolean(),
    create: z.boolean(),
    modify: z.boolean(),
    delete: z.boolean(),
  })
  .strict()
  .refine((p) => p.view || !(p.create || p.modify || p.delete));
export const managedUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .transform((s) => s.toLowerCase()),
    displayName: z.string().trim().min(1).max(100),
    role: z.enum(["ADMIN", "DENTIST", "ASSISTANT", "RECEPTIONIST"]),
    isActive: z.boolean(),
    password: z.string().min(12).max(128).optional(),
    roomIds: z
      .array(z.number().int().positive())
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
    permissions: z
      .array(permissionSchema)
      .max(screens.length)
      .refine(
        (items) => new Set(items.map((p) => p.screen)).size === items.length,
      ),
  })
  .strict();
export type ManagedUserInput = z.infer<typeof managedUserSchema>;
export type ManagedUser = Omit<ManagedUserInput, "password"> & { id: string };
export type Clinic = {
  id: number;
  name: string;
  rooms: { id: number; name: string }[];
};
export const locationNameSchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
