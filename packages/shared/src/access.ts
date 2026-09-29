import { z } from "zod";

export const screens = [
  "dashboard",
  "patients",
  "treatment",
  "actsProcedures",
  "reportsListing",
  "billsCategories",
  "payments",
  "reportsAnalytics",
  "purchaseInvoice",
  "suppliesMaterials",
  "suppliersVendors",
  "settings",
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
export function landingPath(user: { role: string; access?: Access } | null) {
  if (user?.role === "ADMIN") return "/admin/users";
  return allowed(user, "dashboard")
    ? "/dashboard"
    : allowed(user, "patients")
      ? "/patients"
      : allowed(user, "treatment")
        ? "/treatment"
      : allowed(user, "actsProcedures")
        ? "/procedures"
      : allowed(user, "reportsListing")
        ? "/reports/new-patients"
      : allowed(user, "settings")
        ? "/settings"
        : "/dashboard";
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
