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
} from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage } from "../../components/ui";

export function AdminPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState<ManagedUser | null | undefined>(
    undefined,
  );
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<{ users: ManagedUser[] }>("/api/admin/users"),
  });
  const clinics = useQuery({
    queryKey: ["admin", "clinics"],
    queryFn: () => api<{ clinics: Clinic[] }>("/api/admin/clinics"),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin"] }),
      client.invalidateQueries({ queryKey: ["session"] }),
    ]);
  }
  return (
    <>
      <h2 className="mb-6 text-3xl font-semibold">{t("administration")}</h2>
      {(users.error || clinics.error) && (
        <ErrorMessage message={t(errorKey(users.error ?? clinics.error))} />
      )}
      <section className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{t("manageUsers")}</h3>
          <Button onClick={() => setSelected(null)}>{t("newUser")}</Button>
        </div>
        {users.isPending && <p role="status">{t("loading")}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "username",
                  "displayName",
                  "role",
                  "active",
                  "patientActions",
                ].map((key) => (
                  <th className="p-3" key={key}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.data?.users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="p-3">{u.username}</td>
                  <td className="p-3">{u.displayName}</td>
                  <td className="p-3">
                    {t(u.role === "ADMIN" ? "administrator" : u.role.toLowerCase())}
                  </td>
                  <td className="p-3">{t(u.isActive ? "yes" : "no")}</td>
                  <td className="p-3">
                    <button
                      className="rounded text-accent-ink underline"
                      onClick={() => setSelected(u)}
                    >
                      {t("patientModify")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected !== undefined && (
        <UserEditor
          key={selected?.id ?? "new"}
          user={selected}
          clinics={clinics.data?.clinics ?? []}
          onCancel={() => setSelected(undefined)}
          onSaved={async () => {
            setSelected(undefined);
            await refresh();
          }}
        />
      )}
      <section className="card mt-6 p-6">
        <h3 className="mb-4 text-xl font-semibold">{t("clinicsRooms")}</h3>
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
  onCancel,
  onSaved,
}: {
  user: ManagedUser | null;
  clinics: Clinic[];
  onCancel: () => void;
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
  return (
    <form className="card mt-6 p-6" onSubmit={submit}>
      <h3 className="mb-4 text-xl font-semibold">
        {t(user ? "editUser" : "newUser")}
      </h3>
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
            <input
              type="password"
              required={!user}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">{t("screen")}</th>
                    {actions.map((a) => (
                      <th className="p-2" key={a}>
                        {t(`permission_${a}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {input.permissions.map((p) => (
                    <tr className="border-t border-line" key={p.screen}>
                      <td className="p-2">{t(p.screen)}</td>
                      {actions.map((action) => (
                        <td className="p-2" key={action}>
                          <input
                            type="checkbox"
                            aria-label={`${t(p.screen)}: ${t(`permission_${action}`)}`}
                            disabled={action !== "view" && !p.view}
                            checked={p[action]}
                            onChange={(e) =>
                              setInput({
                                ...input,
                                permissions: input.permissions.map((item) =>
                                  item.screen !== p.screen
                                    ? item
                                    : action === "view" && !e.target.checked
                                      ? {
                                          ...item,
                                          view: false,
                                          create: false,
                                          modify: false,
                                          delete: false,
                                        }
                                      : { ...item, [action]: e.target.checked },
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </fieldset>
      {invalid && <ErrorMessage message={t("VALIDATION_ERROR")} />}
      {mutation.error && <ErrorMessage message={t(errorKey(mutation.error))} />}
      <div className="mt-6 flex gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {t(mutation.isPending ? "saving" : "save")}
        </Button>
        <button
          type="button"
          className="rounded-lg border border-line px-5 py-3 text-sm"
          onClick={onCancel}
        >
          {t("patientCancel")}
        </button>
      </div>
    </form>
  );
}
