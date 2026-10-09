import { useEffect, useMemo, useState, type Dispatch, type DragEvent, type ReactNode, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { allowed, type Appointment, type AppointmentCalendar, type AppointmentInput, type AppointmentStatus, type Patient, type PatientList } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, ApiError, errorKey } from "../../lib/api";
import { Button, ErrorMessage } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";

type View = "day" | "week";
type SaveRequest = { id?: string; value: AppointmentInput; closeEditor?: boolean };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const at = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const shift = (value: string, days: number) => { const date = at(value); date.setDate(date.getDate() + days); return iso(date); };
const monday = (value: string) => { const date = at(value); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return iso(date); };
const statusOrder: AppointmentStatus[] = ["scheduled", "confirmed", "arrived", "in_treatment", "completed", "cancelled", "no_show"];
const activeStatuses: AppointmentStatus[] = ["scheduled", "confirmed", "arrived", "in_treatment"];
const tone: Record<AppointmentStatus, string> = {
  scheduled: "border-blue-400 bg-blue-50 text-blue-950", confirmed: "border-violet-400 bg-violet-50 text-violet-950",
  arrived: "border-amber-400 bg-amber-50 text-amber-950", in_treatment: "border-cyan-500 bg-cyan-50 text-cyan-950",
  completed: "border-emerald-500 bg-emerald-50 text-emerald-950", cancelled: "border-slate-400 bg-slate-100 text-slate-700",
  no_show: "border-rose-500 bg-rose-50 text-rose-950",
};
const initial = (date: string): AppointmentInput => ({ kind: "appointment", patientId: null, dentistId: "", date, startTime: "09:00", durationMinutes: 30, visitReason: "", notes: "", allowOverlap: false });
const inputFrom = (item: Appointment): AppointmentInput => ({ kind: item.kind, patientId: item.patientId, dentistId: item.dentistId, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes, visitReason: item.visitReason, notes: item.notes, allowOverlap: false });

export function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(iso(new Date()));
  const [dentist, setDentist] = useState("");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [details, setDetails] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentInput | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [overlap, setOverlap] = useState<SaveRequest | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [draggingId, setDraggingId] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const from = view === "day" ? selectedDate : monday(selectedDate);
  const to = view === "day" ? selectedDate : shift(monday(selectedDate), 6);
  const query = useQuery({
    queryKey: ["appointments", roomId, from, to, selectedDate, dentist],
    queryFn: ({ signal }) => api<AppointmentCalendar>(`/api/appointments?${new URLSearchParams({ from, to, focus: selectedDate, ...(dentist ? { dentistId: dentist } : {}) })}`, { signal }),
  });
  const patients = useQuery({
    queryKey: ["patients", "appointment", roomId, patientSearch],
    enabled: Boolean(form && form.kind === "appointment" && !form.patientId && patientSearch.trim()),
    queryFn: ({ signal }) => api<PatientList>(`/api/appointments/patients?${new URLSearchParams({ q: patientSearch.trim(), pageSize: "10", sort: "fullName", direction: "asc" })}`, { signal }),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["appointments"] });
  const save = useMutation({
    mutationFn: ({ id, value }: SaveRequest) => api<{ appointment: Appointment }>(id ? `/api/appointments/${id}` : "/api/appointments", { method: id ? "PUT" : "POST", body: JSON.stringify(value) }),
    onSuccess: async (data, request) => {
      await refresh();
      if (details?.id === data.appointment.id) setDetails(data.appointment);
      if (request.closeEditor !== false) { setForm(null); setEditing(null); setPatientSearch(""); }
    },
    onError: (error, request) => { if (error instanceof ApiError && error.status === 409) setOverlap(request); },
  });
  const status = useMutation({
    mutationFn: ({ item, next }: { item: Appointment; next: AppointmentStatus }) => api<{ appointment: Appointment }>(`/api/appointments/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }),
    onSuccess: async (data) => { setDetails(data.appointment); await refresh(); },
  });
  const remove = useMutation({
    mutationFn: (item: Appointment) => api<void>(`/api/appointments/${item.id}`, { method: "DELETE" }),
    onSuccess: async () => { setDeleting(null); setDetails(null); await refresh(); },
  });
  const days = useMemo(() => Array.from({ length: view === "day" ? 1 : 7 }, (_, index) => shift(from, index)), [from, view]);
  const canCreate = allowed(user, "appointments", "create");
  const canModify = allowed(user, "appointments", "modify");
  const canDelete = allowed(user, "appointments", "delete");
  const canOpenPatient = allowed(user, "patients");
  const canStart = allowed(user, "treatment", "modify");
  function openForm(item?: Appointment, kind: "appointment" | "block" = "appointment", date = selectedDate, time = "09:00") {
    setDetails(null); setEditing(item ?? null); setPatientSearch(item?.patientName ?? "");
    setForm(item ? inputFrom(item) : { ...initial(date), kind, startTime: time, dentistId: dentist || query.data?.dentists[0]?.id || "" });
  }
  function dayLabel(value: string) { return new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" }).format(at(value)); }
  function dropAppointment(event: DragEvent<HTMLDivElement>, day: string, hour: number) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-netdenty-appointment") || draggingId;
    const item = query.data?.appointments.find((appointment) => appointment.id === id);
    setDraggingId(""); setDropTarget("");
    if (!item || !canModify || !activeStatuses.includes(item.status)) return;
    const value = { ...inputFrom(item), date: day, startTime: `${String(hour).padStart(2, "0")}:00` };
    if (value.date === item.date && value.startTime === item.startTime) return;
    save.mutate({ id: item.id, value, closeEditor: false });
  }
  return <div className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">{t("appointments")}</p><h1 className="mt-2 text-3xl font-semibold">{t("appointmentCalendar")}</h1></div>{canCreate && <div className="flex gap-2"><button className="button-secondary" onClick={() => openForm(undefined, "block")}><Clock3 size={17}/>{t("blockTime")}</button><Button onClick={() => openForm()}><Plus size={17}/>{t("newAppointment")}</Button></div>}</header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["appointmentScheduled", query.data?.counts.scheduled, "bg-blue-100 text-blue-700"], ["appointmentWaiting", query.data?.counts.waiting, "bg-amber-100 text-amber-700"], ["appointmentCompleted", query.data?.counts.completed, "bg-emerald-100 text-emerald-700"], ["appointmentNoShows", query.data?.counts.noShow, "bg-rose-100 text-rose-700"]].map(([label, value, color]) => <article key={String(label)} className="card flex items-center gap-3 p-4"><span className={`rounded-xl p-3 ${color}`}><CalendarDays size={20}/></span><div><p className="text-xs text-muted">{t(String(label))}</p><strong className="text-2xl">{String(value ?? "—")}</strong></div></article>)}</section>
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3"><div className="flex rounded-lg border border-line bg-soft p-1">{(["day", "week"] as View[]).map((value) => <button key={value} className={`rounded-md px-4 py-2 text-sm font-semibold ${view === value ? "bg-surface text-accent-ink shadow" : "text-muted"}`} onClick={() => setView(value)}>{t(`appointmentView_${value}`)}</button>)}</div><button className="icon-button" aria-label={t("previous")} onClick={() => setSelectedDate(shift(selectedDate, view === "day" ? -1 : -7))}><ChevronLeft/></button><button className="button-secondary !min-h-10" onClick={() => setSelectedDate(iso(new Date()))}>{t("today")}</button><button className="icon-button" aria-label={t("next")} onClick={() => setSelectedDate(shift(selectedDate, view === "day" ? 1 : 7))}><ChevronRight/></button><label className="sr-only" htmlFor="appointment-date">{t("date")}</label><input id="appointment-date" className="input !min-h-10 w-auto" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}/><select className="input !min-h-10 ml-auto w-auto" value={dentist} onChange={(event) => setDentist(event.target.value)}><option value="">{t("allDentists")}</option>{query.data?.dentists.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      {query.error ? <div className="p-4"><ErrorMessage message={t(errorKey(query.error))}/></div> : <div className={`grid min-h-[30rem] divide-x divide-line ${view === "week" ? "grid-cols-7" : "grid-cols-1"}`}>{days.map((day) => <div key={day} className="min-w-0"><div className={`border-b border-line px-3 py-2 text-center text-sm font-semibold ${day === iso(new Date()) ? "bg-accent-soft text-accent-ink" : "bg-soft"}`}>{dayLabel(day)}</div><div className="divide-y divide-line">{Array.from({ length: 13 }, (_, index) => index + 7).map((hour) => {
        const target = `${day}-${hour}`;
        const items = (query.data?.appointments ?? []).filter((item) => item.date === day && Number(item.startTime.slice(0, 2)) === hour);
        return <div key={hour} className={`group relative min-h-16 px-2 py-1 pl-14 transition-colors ${dropTarget === target ? "bg-accent-soft ring-2 ring-inset ring-accent-line" : ""}`} onDragOver={(event) => { if (canModify) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(target); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(""); }} onDrop={(event) => dropAppointment(event, day, hour)}><span className="absolute left-2 top-2 text-[11px] text-muted">{String(hour).padStart(2, "0")}:00</span>{canCreate && !draggingId && <button className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100" aria-label={t("newAppointmentAt", { time: `${String(hour).padStart(2, "0")}:00` })} onClick={() => openForm(undefined, "appointment", day, `${String(hour).padStart(2, "0")}:00`)}/>}<div className="relative z-10 space-y-1">{items.map((item) => {
          const draggable = canModify && activeStatuses.includes(item.status);
          return <button key={item.id} draggable={draggable} title={draggable ? t("appointmentDragHint") : undefined} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-netdenty-appointment", item.id); setDraggingId(item.id); }} onDragEnd={() => { setDraggingId(""); setDropTarget(""); }} onClick={() => setDetails(item)} className={`w-full rounded-md border-l-4 p-2 text-left text-xs shadow-sm ${draggingId === item.id ? "opacity-50" : ""} ${item.kind === "block" ? "border-slate-500 bg-slate-200 text-slate-800" : tone[item.status]}`}><span className="flex items-center gap-1"><GripVertical className={draggable ? "opacity-60" : "opacity-0"} size={13}/><strong>{item.startTime}</strong><span className="truncate font-semibold">{item.kind === "block" ? t("unavailable") : item.patientName}</span></span><span className="block truncate pl-[17px]">{item.visitReason || item.dentistName}</span></button>;
        })}</div></div>;
      })}</div></div>)}</div>}
    </section>
    {(form || details) && <><button className="fixed inset-0 z-40 bg-slate-950/35" aria-label={t("close")} onClick={() => { setForm(null); setDetails(null); }}/><aside className="fixed inset-y-0 right-0 z-50 flex w-[30rem] max-w-[95vw] flex-col border-l border-line bg-surface shadow-2xl">{form ? <AppointmentForm t={t} form={form} setForm={setForm} dentists={query.data?.dentists ?? []} patients={patients.data?.patients ?? []} patientSearch={patientSearch} setPatientSearch={setPatientSearch} pending={save.isPending} error={save.error && !overlap ? t(errorKey(save.error)) : ""} editing={Boolean(editing)} onClose={() => { setForm(null); setEditing(null); }} onSave={() => save.mutate({ id: editing?.id, value: form })}/> : details && <AppointmentDetails t={t} item={details} canModify={canModify} canDelete={canDelete} canOpenPatient={canOpenPatient} canStart={canStart} pending={status.isPending || remove.isPending} onClose={() => setDetails(null)} onEdit={() => openForm(details)} onDelete={() => setDeleting(details)} onStatus={(next) => status.mutate({ item: details, next })} onOpenPatient={() => navigate(`/patients/${details.patientId}`)} onStart={() => status.mutate({ item: details, next: "in_treatment" }, { onSuccess: () => navigate(`/treatment?patientId=${details.patientId}&tab=session`) })}/>}</aside></>}
    {overlap && <ConfirmDialog tone="primary" title={t("appointmentOverlapTitle")} message={t("appointmentOverlapMessage")} confirmLabel={t("bookAnyway")} pending={save.isPending} error={save.error && !(save.error instanceof ApiError && save.error.status === 409) ? t(errorKey(save.error)) : undefined} onCancel={() => setOverlap(null)} onConfirm={() => { const request = { ...overlap, value: { ...overlap.value, allowOverlap: true } }; setOverlap(null); save.mutate(request); }}/>} 
    {deleting && <ConfirmDialog title={t("appointmentDeleteTitle")} message={t("appointmentDeleteMessage", { name: deleting.patientName || deleting.visitReason, date: deleting.date, time: deleting.startTime })} confirmLabel={t("appointmentDeleteAction")} pending={remove.isPending} error={remove.error ? t(errorKey(remove.error)) : undefined} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}/>} 
  </div>;
}

type AppointmentFormProps = { t: TFunction; form: AppointmentInput; setForm: Dispatch<SetStateAction<AppointmentInput | null>>; dentists: { id: string; name: string }[]; patients: Patient[]; patientSearch: string; setPatientSearch: Dispatch<SetStateAction<string>>; pending: boolean; error: string; editing: boolean; onClose: () => void; onSave: () => void };
function AppointmentForm({ t, form, setForm, dentists, patients, patientSearch, setPatientSearch, pending, error, editing, onClose, onSave }: AppointmentFormProps) {
  return <><div className="flex items-center border-b border-line p-5"><div><p className="eyebrow">{form.kind === "block" ? t("blockTime") : t(editing ? "editAppointment" : "newAppointment")}</p><h2 className="mt-1 text-xl font-semibold">{form.kind === "block" ? t("unavailablePeriod") : t("appointmentDetails")}</h2></div><button className="icon-button ml-auto" onClick={onClose}><X/></button></div><form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={(event) => { event.preventDefault(); onSave(); }} id="appointment-form">{form.kind === "appointment" && <div><label className="text-sm font-medium">{t("patient")} *</label><div className="relative mt-1"><Search className="absolute left-3 top-3 text-muted" size={18}/><input className="input pl-10" required value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setForm({ ...form, patientId: null }); }} placeholder={t("appointmentPatientSearch")}/></div>{!form.patientId && patientSearch && patients.length > 0 && <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-line">{patients.map((row) => <button type="button" key={row.id} className="block w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-accent-soft" onClick={() => { setForm({ ...form, patientId: row.id }); setPatientSearch(row.fullName); }}><strong>{row.fullName}</strong><span className="ml-2 text-muted">{row.phone}</span></button>)}</div>}<Link className="mt-2 inline-flex text-sm font-semibold text-accent-ink" to="/patients/new">+ {t("newPatient")}</Link></div>}<div className="grid grid-cols-2 gap-3"><Field label={t("date")}><input required className="input mt-1" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/></Field><Field label={t("startTime")}><input required className="input mt-1" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></Field><Field label={t("duration")}><select className="input mt-1" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}>{[15, 30, 45, 60, 90, 120, 180].map((duration) => <option key={duration} value={duration}>{duration} {t("minutes")}</option>)}</select></Field><Field label={t("dentist")}><select required className="input mt-1" value={form.dentistId} onChange={(event) => setForm({ ...form, dentistId: event.target.value })}><option value="">{t("selectDentist")}</option>{dentists.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field></div><Field label={form.kind === "block" ? t("reason") : t("visitReason")}><input required={form.kind === "block"} className="input mt-1" maxLength={500} value={form.visitReason} onChange={(event) => setForm({ ...form, visitReason: event.target.value })}/></Field><Field label={t("notes")}><textarea className="input mt-1 min-h-28" maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></Field>{error && <ErrorMessage message={error}/>}</form><div className="flex justify-end gap-3 border-t border-line p-4"><button className="button-secondary" onClick={onClose}>{t("patientCancel")}</button><Button form="appointment-form" type="submit" disabled={pending || !form.dentistId || (form.kind === "appointment" && !form.patientId)}>{t(pending ? "saving" : "save")}</Button></div></>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-medium">{label}{children}</label>; }

type AppointmentDetailsProps = { t: TFunction; item: Appointment; canModify: boolean; canDelete: boolean; canOpenPatient: boolean; canStart: boolean; pending: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onStatus: (status: AppointmentStatus) => void; onOpenPatient: () => void; onStart: () => void };
function AppointmentDetails({ t, item, canModify, canDelete, canOpenPatient, canStart, pending, onClose, onEdit, onDelete, onStatus, onOpenPatient, onStart }: AppointmentDetailsProps) {
  const terminal = ["completed", "cancelled", "no_show"].includes(item.status);
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus>(item.status);
  useEffect(() => setSelectedStatus(item.status), [item.id, item.status]);
  return <><div className="flex items-center border-b border-line p-5"><div><p className="eyebrow">{item.kind === "block" ? t("unavailable") : t("appointmentDetails")}</p><h2 className="mt-1 text-xl font-semibold">{item.patientName || item.visitReason}</h2></div><button className="icon-button ml-auto" onClick={onClose}><X/></button></div><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone[item.status]}`}>{t(`appointmentStatus_${item.status}`)}</span><dl className="grid grid-cols-2 gap-4 text-sm"><Info label={t("date")} value={item.date}/><Info label={t("startTime")} value={item.startTime}/><Info label={t("duration")} value={`${item.durationMinutes} ${t("minutes")}`}/><Info label={t("dentist")} value={item.dentistName}/><Info label={t("visitReason")} value={item.visitReason || "—"}/><Info label={t("notes")} value={item.notes || "—"}/></dl>{canModify && item.kind === "appointment" && <div className="rounded-xl border border-line bg-soft p-4"><label className="text-sm font-semibold" htmlFor="appointment-status">{t("appointmentStatusLabel")}</label><div className="mt-2 flex gap-2"><select id="appointment-status" className="input !min-h-10 flex-1 py-2" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as AppointmentStatus)}>{statusOrder.map((status) => <option key={status} value={status}>{t(`appointmentStatus_${status}`)}</option>)}</select><Button className="!min-h-10 px-4 py-2" disabled={pending || selectedStatus === item.status} onClick={() => onStatus(selectedStatus)}>{t("appointmentUpdateStatus")}</Button></div></div>}{item.history.length > 0 && <div><h3 className="mb-2 font-semibold">{t("appointmentHistory")}</h3><ol className="space-y-2 border-l border-line pl-4">{[...item.history].reverse().map((event) => <li key={event.id} className="text-xs"><strong>{t(`appointmentEvent_${event.action}`, { defaultValue: event.action.replaceAll("_", " ") })}</strong><span className="block text-muted">{new Date(event.createdAt).toLocaleString()} · {event.actorName}</span></li>)}</ol></div>}</div><div className="space-y-2 border-t border-line p-4">{item.kind === "appointment" && (canOpenPatient || canStart) && <div className="grid grid-cols-2 gap-2">{canOpenPatient && <button className="button-secondary justify-center" onClick={onOpenPatient}><UserRound size={16}/>{t("openPatient")}</button>}{canModify && canStart && !terminal && <Button onClick={onStart} disabled={pending}>{t("startVisit")}</Button>}</div>}<div className="flex justify-end gap-2">{canDelete && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={pending} onClick={onDelete}><Trash2 size={16}/>{t("appointmentDeleteAction")}</button>}{canModify && <button className="button-secondary !min-h-10" disabled={pending} onClick={onEdit}>{t("edit")}</button>}</div></div></>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
