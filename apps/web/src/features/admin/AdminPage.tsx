import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  screens,
  actions,
  managedUserSchema,
  type ManagedUser,
  type ManagedUserInput,
  type Clinic,
  type Screen,
  type Action,
} from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage } from "../../components/ui";
import { ArrowLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

type PermissionTreeRow =
  | { kind: "group"; label: string; depth: number }
  | { kind: "screen"; screen: Screen; label?: string; depth: number };

const permissionTreeRows: PermissionTreeRow[] = [
  { kind: "screen", screen: "dashboard", depth: 0 },
  { kind: "group", label: "clinical", depth: 0 },
  { kind: "screen", screen: "patients", depth: 1 },
  { kind: "screen", screen: "treatment", depth: 1 },
  { kind: "screen", screen: "payments", depth: 2 },
  { kind: "group", label: "actsProcedures", depth: 1 },
  { kind: "screen", screen: "actsProcedures", label: "procedures", depth: 2 },
  { kind: "screen", screen: "laboratoriesCatalog", depth: 2 },
  { kind: "group", label: "billingPayments", depth: 0 },
  { kind: "screen", screen: "billsPayments", depth: 1 },
  { kind: "screen", screen: "billsCategories", depth: 1 },
  { kind: "group", label: "inventory", depth: 0 },
  { kind: "screen", screen: "purchaseInvoice", depth: 1 },
  { kind: "screen", screen: "suppliesMaterials", depth: 1 },
  { kind: "screen", screen: "suppliersVendors", depth: 1 },
  { kind: "group", label: "analytics", depth: 0 },
  { kind: "group", label: "analyticsClinical", depth: 1 },
  { kind: "screen", screen: "reportNewPatients", depth: 2 },
  { kind: "screen", screen: "reportPatientsStatement", depth: 2 },
  { kind: "screen", screen: "reportLabStatement", depth: 2 },
  { kind: "group", label: "analyticsBilling", depth: 1 },
  { kind: "screen", screen: "reportBillingPayments", label: "billingAnalyticsReport", depth: 2 },
  { kind: "group", label: "analyticsInventory", depth: 1 },
  { kind: "screen", screen: "reportInventoryAnalytics", label: "inventoryAnalyticsReport", depth: 2 },
  { kind: "group", label: "settings", depth: 0 },
  { kind: "screen", screen: "settings", label: "generalSettings", depth: 1 },
  { kind: "screen", screen: "currencySetup", depth: 1 },
  { kind: "screen", screen: "backupRestore", depth: 1 },
  { kind: "screen", screen: "help", depth: 1 },
];

export function UsersAdminPage() {
  const { t } = useTranslation();
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<{ users: ManagedUser[] }>("/api/admin/users"),
  });
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("administration")}</p>
          <h2 className="mt-3 text-3xl font-semibold">{t("manageUsers")}</h2>
        </div>
        <Link className="button" to="/admin/users/new"><Plus size={18} aria-hidden="true"/>{t("newUser")}</Link>
      </header>
      {users.error && <ErrorMessage message={t(errorKey(users.error))} />}
      <section className="card overflow-hidden">
        {users.isPending && <p role="status">{t("loading")}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-soft text-muted">
              <tr>
                {[
                  "username",
                  "displayName",
                  "role",
                  "active",
                  "patientActions",
                ].map((key) => (
                  <th className="px-4 py-3 font-medium" key={key}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.data?.users.map((u) => (
                <tr key={u.id} className="border-t border-line hover:bg-soft/60">
                  <td className="px-4 py-3">{u.username}</td>
                  <td className="px-4 py-3">{u.displayName}</td>
                  <td className="px-4 py-3">
                    {t(u.role === "ADMIN" ? "administrator" : u.role.toLowerCase())}
                  </td>
                  <td className="px-4 py-3">{t(u.isActive ? "yes" : "no")}</td>
                  <td className="px-4 py-3">
                    <Link className="inline-flex items-center gap-2 rounded p-2 text-accent-ink hover:bg-accent-soft" to={`/admin/users/${u.id}`} aria-label={`${t("patientModify")} ${u.displayName}`}>
                      <Pencil size={16} aria-hidden="true"/>{t("patientModify")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function UserAdminFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<{ users: ManagedUser[] }>("/api/admin/users") });
  const clinics = useQuery({ queryKey: ["admin", "clinics"], queryFn: () => api<{ clinics: Clinic[] }>("/api/admin/clinics") });
  if (users.isPending || clinics.isPending) return <p role="status">{t("loading")}</p>;
  if (users.error || clinics.error) return <ErrorMessage message={t(errorKey(users.error ?? clinics.error))}/>;
  const user = id ? users.data.users.find((candidate) => candidate.id === id) : undefined;
  if (id && !user) return <ErrorMessage message={t("NOT_FOUND")}/>;
  return <UserEditor key={id ?? "new"} user={user ?? null} clinics={clinics.data.clinics} onSaved={async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["admin"] }), client.invalidateQueries({ queryKey: ["session"] })]);
    navigate("/admin/users");
  }}/>;
}

export function ClinicsRoomsAdminPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const clinics = useQuery({
    queryKey: ["admin", "clinics"],
    queryFn: () => api<{ clinics: Clinic[] }>("/api/admin/clinics"),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin", "clinics"] }),
      client.invalidateQueries({ queryKey: ["session"] }),
    ]);
  }
  return (
    <>
      <p className="eyebrow">{t("administration")}</p>
      <h2 className="mb-6 mt-3 text-3xl font-semibold">{t("clinicsRooms")}</h2>
      {clinics.error && <ErrorMessage message={t(errorKey(clinics.error))} />}
      <section className="card p-6">
        <LocationForm
          path="/api/admin/clinics"
          label={t("newClinic")}
          onSaved={refresh}
        />
        {clinics.data?.clinics.map((clinic) => (
          <div
            key={clinic.id}
            className="mt-5 rounded-xl border border-line p-4"
          >
            <LocationForm
              path={`/api/admin/clinics/${clinic.id}`}
              label={t("clinic")}
              initial={clinic.name}
              onSaved={refresh}
            />
            <div className="ml-4 mt-4 space-y-3">
              {clinic.rooms.map((room) => (
                <LocationForm
                  key={room.id}
                  path={`/api/admin/clinics/${clinic.id}/rooms/${room.id}`}
                  label={t("surgicalRoom")}
                  initial={room.name}
                  onSaved={refresh}
                />
              ))}
              <LocationForm
                path={`/api/admin/clinics/${clinic.id}/rooms`}
                label={t("newRoom")}
                onSaved={refresh}
              />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function LocationForm({
  path,
  label,
  initial,
  onSaved,
}: {
  path: string;
  label: string;
  initial?: string;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      api(path, {
        method: initial === undefined ? "POST" : "PUT",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: async () => {
      if (initial === undefined) setName("");
      await onSaved();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block">{label}</span>
          <input
            className="input"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mutation.isPending}
          />
        </label>
        <Button type="submit" disabled={!name.trim() || mutation.isPending}>
          {t(mutation.isPending ? "saving" : "save")}
        </Button>
      </div>
      {mutation.error && <ErrorMessage message={t(errorKey(mutation.error))} />}
      {mutation.isSuccess && (
        <p role="status" className="mt-2 text-xs text-accent-ink">
          {t("saved")}
        </p>
      )}
    </form>
  );
}

function UserEditor({
  user,
  clinics,
  onSaved,
}: {
  user: ManagedUser | null;
  clinics: Clinic[];
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState<ManagedUserInput>({
    username: user?.username ?? "",
    displayName: user?.displayName ?? "",
    role: user?.role ?? "DENTIST",
    isActive: user?.isActive ?? true,
    roomIds: user?.roomIds ?? [],
    permissions: screens.map(
      (screen) =>
        user?.permissions.find((p) => p.screen === screen) ?? {
          screen,
          view: false,
          create: false,
          modify: false,
          delete: false,
        },
    ),
  });
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: ManagedUserInput) =>
      api(user ? `/api/admin/users/${user.id}` : "/api/admin/users", {
        method: user ? "PUT" : "POST",
        body: JSON.stringify(value),
      }),
    onSuccess: onSaved,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = managedUserSchema.safeParse({
      ...input,
      ...(password ? { password } : {}),
    });
    setInvalid(!parsed.success || (!user && !password));
    if (parsed.success && (user || password)) mutation.mutate(parsed.data);
  }
  function updatePermission(screen: Screen, action: Action, checked: boolean) {
    setInput({
      ...input,
      permissions: input.permissions.map((permission) =>
        permission.screen !== screen
          ? permission
          : action === "view" && !checked
            ? { ...permission, view: false, create: false, modify: false, delete: false }
            : { ...permission, [action]: checked },
      ),
    });
  }
  return (<>
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas py-2">
      <div>
        <Link to="/admin/users" className="mb-2 inline-flex items-center gap-2 rounded text-sm text-accent-ink"><ArrowLeft size={18} aria-hidden="true"/>{t("manageUsers")}</Link>
        <h2 className="text-2xl font-semibold">{t(user ? "editUser" : "newUser")}</h2>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink hover:bg-soft" to="/admin/users">{t("patientCancel")}</Link>
        <Button type="submit" form="user-form" disabled={mutation.isPending}>{t(mutation.isPending ? "saving" : "save")}</Button>
      </div>
    </div>
    <form id="user-form" className="card p-4 sm:p-5" onSubmit={submit}>
      <fieldset disabled={mutation.isPending}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {t("username")}
            <input
              required
              minLength={3}
              maxLength={64}
              pattern="[a-zA-Z0-9._-]+"
              className="input mt-1"
              value={input.username}
              onChange={(e) => setInput({ ...input, username: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            {t("displayName")}
            <input
              required
              maxLength={100}
              className="input mt-1"
              value={input.displayName}
              onChange={(e) =>
                setInput({ ...input, displayName: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            {t(user ? "optionalNewPassword" : "password")}
            <div className="relative mt-1">
              <input
                type={passwordVisible ? "text" : "password"}
                required={!user}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                className="input pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-md p-3 text-muted"
                aria-label={t(passwordVisible ? "hidePassword" : "showPassword")}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}
              </button>
            </div>
          </label>
          <label className="text-sm">
            {t("role")}
            <select
              className="input mt-1"
              value={input.role}
              onChange={(e) =>
                setInput({
                  ...input,
                  role: e.target.value as ManagedUserInput["role"],
                })
              }
            >
              <option value="DENTIST">{t("dentist")}</option>
              <option value="ASSISTANT">{t("assistant")}</option>
              <option value="RECEPTIONIST">{t("receptionist")}</option>
              <option value="ADMIN">{t("administrator")}</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={input.isActive}
            onChange={(e) => setInput({ ...input, isActive: e.target.checked })}
          />
          {t("active")}
        </label>
        {input.role === "ADMIN" ? (
          <p className="mt-5 text-sm text-muted">{t("adminAllAccess")}</p>
        ) : (
          <>
            <h4 className="mb-3 mt-6 font-semibold">{t("assignedRooms")}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {clinics.map((clinic) => (
                <fieldset
                  className="rounded-lg border border-line p-3"
                  key={clinic.id}
                >
                  <legend className="px-1 text-sm font-medium">
                    {clinic.name}
                  </legend>
                  {clinic.rooms.map((room) => (
                    <label
                      className="flex items-center gap-2 py-2 text-sm"
                      key={room.id}
                    >
                      <input
                        type="checkbox"
                        checked={input.roomIds.includes(room.id)}
                        onChange={(e) =>
                          setInput({
                            ...input,
                            roomIds: e.target.checked
                              ? [...input.roomIds, room.id]
                              : input.roomIds.filter((id) => id !== room.id),
                          })
                        }
                      />
                      {room.name}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <h4 className="mb-3 mt-6 font-semibold">
              {t("screenPermissions")}
            </h4>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-soft text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("screen")}</th>
                    {actions.map((a) => (
                      <th className="px-4 py-3 text-center font-medium" key={a}>
                        {t(`permission_${a}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionTreeRows.map((row, index) => {
                    if (row.kind === "group")
                      return (
                        <tr className="border-t border-line bg-soft" key={`group-${row.label}-${index}`}>
                          <th colSpan={5} scope="rowgroup" className="py-2 pr-2 text-left text-sm font-semibold text-ink" style={{ paddingLeft: `${0.75 + row.depth * 1.25}rem` }}>
                            <span className="inline-flex items-center gap-2">
                              {row.depth > 0 && <span className="h-3 w-3 rounded-bl border-b border-l border-line" aria-hidden="true"/>}
                              {t(row.label)}
                            </span>
                          </th>
                        </tr>
                      );
                    const permission = input.permissions.find((item) => item.screen === row.screen)!;
                    const label = t(row.label ?? row.screen);
                    return (
                      <tr className="border-t border-line" key={row.screen}>
                        <td className="py-2 pr-2" style={{ paddingLeft: `${0.75 + row.depth * 1.25}rem` }}>
                          <span className="inline-flex items-center gap-2">
                            {row.depth > 0 && <span className="h-3 w-3 rounded-bl border-b border-l border-line" aria-hidden="true"/>}
                            {label}
                          </span>
                        </td>
                        {actions.map((action) => (
                          <td className="px-4 py-3 text-center" key={action}>
                            <input type="checkbox" aria-label={`${label}: ${t(`permission_${action}`)}`}
                              disabled={action !== "view" && !permission.view} checked={permission[action]}
                              onChange={(event) => updatePermission(row.screen, action, event.target.checked)}/>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </fieldset>
      {invalid && <ErrorMessage message={t("VALIDATION_ERROR")} />}
      {mutation.error && <ErrorMessage message={t(errorKey(mutation.error))} />}
    </form>
  </>);
}
