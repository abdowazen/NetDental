import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  Fragment,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthProvider";
import { setApiRoom } from "../../lib/api";

const Context = createContext<{
  roomId: number | null;
  clinicId: number | null;
  selectClinic: (id: number) => Promise<void>;
  selectRoom: (id: number | null) => Promise<void>;
}>({ roomId: null, clinicId: null, selectClinic: async () => {}, selectRoom: async () => {} });
export const useWorkspace = () => useContext(Context);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<{
    userId: string;
    roomId: number | null;
    clinicId: number | null;
  } | null>(null);
  const client = useQueryClient();
  const rooms = user?.access?.rooms ?? [];
  useEffect(() => {
    if (!user) setSelection(null);
  }, [user]);
  const clinicIds = [...new Set(rooms.map((r) => r.clinicId))];
  const requestedClinic = selection?.userId === user?.id ? selection?.clinicId : null;
  const clinicId = requestedClinic && clinicIds.includes(requestedClinic)
    ? requestedClinic
    : clinicIds.length === 1 ? clinicIds[0] : null;
  const clinicRooms = rooms.filter((r) => r.clinicId === clinicId);
  const requested = selection?.userId === user?.id ? selection?.roomId : null;
  const roomId = clinicRooms.some((r) => r.id === requested)
    ? requested!
    : clinicRooms.length === 1
      ? clinicRooms[0].id
      : null;
  setApiRoom(roomId);
  async function selectRoom(id: number | null) {
    await client.cancelQueries({
      predicate: (q) => q.queryKey[0] !== "session",
    });
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    setApiRoom(id);
    setSelection({ userId: user!.id, roomId: id, clinicId: rooms.find((r) => r.id === id)?.clinicId ?? clinicId });
  }
  async function selectClinic(id: number) {
    if (!clinicIds.includes(id)) return;
    await client.cancelQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
    const assigned = rooms.filter((r) => r.clinicId === id);
    const nextRoom = assigned.length === 1 ? assigned[0].id : null;
    setApiRoom(nextRoom);
    setSelection({ userId: user!.id, clinicId: id, roomId: nextRoom });
  }
  return (
    <Context.Provider value={{ roomId, clinicId, selectClinic, selectRoom }}>
      <Fragment key={`${user?.id}-${clinicId}-${roomId}`}>{children}</Fragment>
    </Context.Provider>
  );
}
export function WorkspaceSelect() {
  const { user } = useAuth();
  const { roomId, clinicId, selectRoom } = useWorkspace();
  const { t } = useTranslation();
  const rooms = user?.access?.rooms ?? [];
  const clinicRooms = rooms.filter((r) => r.clinicId === clinicId);
  if (clinicRooms.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="workspace-room">
        {t("surgicalRoom")}
      </label>
      <select
        id="workspace-room"
        className="max-w-52 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        value={roomId ?? ""}
        onChange={(event) =>
          void selectRoom(Number(event.target.value) || null)
        }
      >
        <option value="">{t("selectRoom")}</option>
        {rooms
          .filter((r) => r.clinicId === clinicId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </select>
    </div>
  );
}
