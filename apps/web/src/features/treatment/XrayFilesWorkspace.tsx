import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Minus, Plus, Upload, ExternalLink, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { allowed, allTeeth, clinicDate, type PatientFile, type PatientFileList } from "@clinic/shared";
import { api, apiBlob, errorKey } from "../../lib/api";
import { Button, ErrorMessage, Field } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { ConfirmDialog } from "../../components/ConfirmDialog";

const MAX_SIZE = 15 * 1024 * 1024;
type Filter = "all" | PatientFile["kind"];

export function XrayFilesWorkspace({ patientId, patientName }: { patientId?: number; patientName?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tooth, setTooth] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState<PatientFile | null>(null);
  const canCreate = !!patientId && allowed(user, "treatment", "create");
  const canDelete = !!patientId && allowed(user, "treatment", "delete");
  const query = useQuery({ queryKey: ["patient-files", roomId, patientId], enabled: !!patientId,
    queryFn: ({ signal }) => api<PatientFileList>(`/api/patient-files/${patientId}`, { signal }) });
  const rows = useMemo(() => (query.data?.files ?? []).filter((file) => (filter === "all" || file.kind === filter) && (tooth === "all" || file.tooth === Number(tooth))), [query.data, filter, tooth]);
  useEffect(() => { if (!rows.some((file) => file.id === selectedId)) setSelectedId(rows[0]?.id ?? ""); }, [rows, selectedId]);
  const selected = rows.find((file) => file.id === selectedId);
  const upload = useMutation({
    mutationFn: async ({ file, kind, tooth, date, description }: { file: File; kind: PatientFile["kind"]; tooth: string; date: string; description: string }) => {
      if (!patientId || !file.size || file.size > MAX_SIZE) throw new Error("fileSizeInvalid");
      const params = new URLSearchParams({ originalName: file.name, kind, mimeType: file.type, date, description });
      if (tooth) params.set("tooth", tooth);
      return api<{ file: PatientFile }>(`/api/patient-files/${patientId}?${params}`, { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } });
    },
    onSuccess: async ({ file }) => { setPendingFile(null); await client.invalidateQueries({ queryKey: ["patient-files", roomId, patientId] }); setSelectedId(file.id); },
  });
  const remove = useMutation({
    mutationFn: (file: PatientFile) => api(`/api/patient-files/${patientId}/${file.id}`, { method: "DELETE" }),
    onSuccess: async (_, file) => {
      setDeleting(null);
      client.removeQueries({ queryKey: ["patient-files", patientId, file.id, "content"] });
      await client.invalidateQueries({ queryKey: ["patient-files", roomId, patientId] });
    },
  });
  return <div className="space-y-3">
    {pendingFile && <UploadDialog file={pendingFile} pending={upload.isPending} error={upload.error ? t(errorKey(upload.error) === "INTERNAL_ERROR" ? upload.error.message : errorKey(upload.error)) : ""}
      onCancel={() => setPendingFile(null)} onUpload={(values) => upload.mutate({ file: pendingFile, ...values })}/>} 
    {deleting && <ConfirmDialog title={t("filesDeleteTitle")} message={t("filesDeleteMessage", { name: deleting.originalName })} confirmLabel={t("patientDelete")} pending={remove.isPending} error={remove.error ? t(errorKey(remove.error)) : undefined} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)}/>} 
    <header><h1 className="text-2xl font-bold tracking-tight">{t("filesTitle")}</h1><p className="text-xs text-muted">{patientId ? t("filesPatient", { patient: patientName }) : t("paymentNoPatientSelected")}</p></header>
    <div className="grid min-h-[30rem] gap-3 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><h2 className="font-semibold">{t("filesPatientFiles")}</h2>
          <><input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={!canCreate} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) setPendingFile(file); }}/>
          <Button disabled={!canCreate} className="!min-h-0 !px-3 !py-2" onClick={() => input.current?.click()}><Upload size={16}/>{t("filesUpload")}</Button></></div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {(["all","xray","photo","document"] as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === value ? "border-accent-solid bg-accent-solid text-white" : "border-line hover:bg-soft"}`} onClick={() => setFilter(value)}>{t(`filesFilter_${value}`)}</button>)}
          <select className="input ml-auto w-auto !min-h-0 !py-1.5 text-xs" aria-label={t("filesToothFilter")} value={tooth} onChange={(event) => setTooth(event.target.value)}><option value="all">{t("filesAllTeeth")}</option>{allTeeth.map((id) => <option key={id} value={id}>{t("odTooth", { id })}</option>)}</select>
        </div>
        {query.error && <div className="p-4"><ErrorMessage message={t(errorKey(query.error))}/></div>}
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((file) => <div key={file.id} className={`relative overflow-hidden rounded-xl border transition ${selectedId === file.id ? "border-accent-solid ring-2 ring-accent-line" : "border-line hover:border-accent-line"}`}><button type="button" onClick={() => setSelectedId(file.id)} className="block w-full text-left">
            <FileThumbnail patientId={patientId!} file={file}/><span className="block truncate px-2 pt-2 text-xs font-semibold">{file.tooth ? `${t("odTooth", { id: file.tooth })} · ` : ""}{file.originalName}</span><span className="block px-2 pb-2 text-[10px] text-muted">{file.date}</span>
          </button>{canDelete && <button type="button" aria-label={t("filesDeleteFile", { name: file.originalName })} title={t("patientDelete")} className="absolute right-2 top-2 rounded-md bg-surface/95 p-2 text-danger-ink shadow hover:bg-danger-soft" onClick={() => setDeleting(file)}><Trash2 size={15}/></button>}</div>)}
        </div>
        {!rows.length && <div className="grid min-h-64 place-items-center p-8 text-center text-sm text-muted"><div><ImageIcon className="mx-auto mb-3"/><p>{patientId ? t("filesEmpty") : t("paymentSelectPatient")}</p></div></div>}
      </section>
      <section className="card min-w-0 p-4">{selected && patientId ? <FilePreview patientId={patientId} file={selected}/> : <div className="grid min-h-full place-items-center text-center text-sm text-muted"><div><ImageIcon className="mx-auto mb-3"/><p>{t("filesSelect")}</p></div></div>}</section>
    </div>
  </div>;
}

function FileThumbnail({ patientId, file }: { patientId: number; file: PatientFile }) {
  const { t } = useTranslation();
  const content = useObjectUrl(patientId, file);
  return <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-soft">{file.mimeType.startsWith("image/") && content.url ? <img className="h-full w-full object-cover" src={content.url} alt={file.originalName}/> : <div className="text-center text-danger-ink"><FileText className="mx-auto" size={32}/><span className="text-[10px] font-bold">{file.mimeType === "application/pdf" ? "PDF" : t("filesDocument")}</span></div>}</div>;
}

function FilePreview({ patientId, file }: { patientId: number; file: PatientFile }) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const content = useObjectUrl(patientId, file);
  useEffect(() => setZoom(1), [file.id]);
  return <div className="space-y-4"><div className="relative grid min-h-72 place-items-center overflow-auto rounded-xl bg-slate-950">
    {file.mimeType.startsWith("image/") && content.url ? <img className="max-h-[32rem] max-w-full object-contain transition-transform" style={{ transform: `scale(${zoom})` }} src={content.url} alt={file.originalName}/> : <div className="text-center text-white"><FileText className="mx-auto mb-3" size={60}/><p>{file.originalName}</p></div>}
    <div className="absolute right-2 top-2 flex gap-1"><button className="rounded bg-white p-2 text-slate-900 shadow" aria-label={t("filesZoomIn")} onClick={() => setZoom((value) => Math.min(3, value + .25))}><Plus size={16}/></button><button className="rounded bg-white p-2 text-slate-900 shadow" aria-label={t("filesZoomOut")} onClick={() => setZoom((value) => Math.max(.5, value - .25))}><Minus size={16}/></button>{content.url && <a className="flex items-center gap-1 rounded bg-white px-2 text-xs font-semibold text-slate-900 shadow" href={content.url} download={file.originalName}><ExternalLink size={14}/>{t("filesOpenOriginal")}</a>}</div>
  </div>
  {content.error && <ErrorMessage message={t(errorKey(content.error))}/>}<dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm"><dt className="text-muted">{t("filesType")}</dt><dd>{t(`filesKind_${file.kind}`)}</dd><dt className="text-muted">{t("twTooth")}</dt><dd>{file.tooth ?? "—"}</dd><dt className="text-muted">{t("filesDate")}</dt><dd>{file.date}</dd><dt className="text-muted">{t("filesUploaded")}</dt><dd>{new Date(file.uploadedAt).toLocaleString()}</dd><dt className="text-muted">{t("filesDescription")}</dt><dd className="whitespace-pre-wrap">{file.description || "—"}</dd></dl></div>;
}

function useObjectUrl(patientId: number, file: PatientFile) {
  const query = useQuery({ queryKey: ["patient-files", patientId, file.id, "content"], queryFn: ({ signal }) => apiBlob(`/api/patient-files/${patientId}/${file.id}/content`, signal) });
  const [url, setUrl] = useState("");
  useEffect(() => { if (!query.data) { setUrl(""); return; } const next = URL.createObjectURL(query.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [query.data]);
  return { url, error: query.error };
}

function UploadDialog({ file, pending, error, onCancel, onUpload }: { file: File; pending: boolean; error: string; onCancel: () => void; onUpload: (value: { kind: PatientFile["kind"]; tooth: string; date: string; description: string }) => void }) {
  const { t } = useTranslation(); const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<PatientFile["kind"]>(file.type === "application/pdf" ? "document" : "xray"); const [tooth, setTooth] = useState(""); const [date, setDate] = useState(clinicDate()); const [description, setDescription] = useState("");
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  const invalid = !["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type) || !file.size || file.size > MAX_SIZE;
  return <dialog ref={ref} className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("filesUpload")}</h2><p className="text-sm text-muted">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p></div><button aria-label={t("patientCancel")} onClick={onCancel}><X/></button></div>
    {invalid && <ErrorMessage message={t("filesInvalid")}/>} {error && !invalid && <ErrorMessage message={error}/>}<div className="mt-4 grid gap-4 sm:grid-cols-2"><Field id="file-kind" label={t("filesType")}><select id="file-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PatientFile["kind"])}>{["xray","photo","document"].map((value) => <option key={value} value={value}>{t(`filesKind_${value}`)}</option>)}</select></Field><Field id="file-tooth" label={t("twTooth")}><select id="file-tooth" className="input" value={tooth} onChange={(e) => setTooth(e.target.value)}><option value="">{t("filesNoTooth")}</option>{allTeeth.map((id) => <option key={id} value={id}>{id}</option>)}</select></Field><Field id="file-date" label={t("filesDate")}><input id="file-date" className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)}/></Field><div className="sm:col-span-2"><Field id="file-description" label={t("filesDescription")}><textarea id="file-description" className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}/></Field></div></div><div className="mt-6 flex justify-end gap-2"><Button type="button" disabled={pending} onClick={onCancel}>{t("patientCancel")}</Button><Button type="button" disabled={pending || invalid || !date} onClick={() => onUpload({ kind, tooth, date, description })}>{t(pending ? "saving" : "filesUpload")}</Button></div></dialog>;
}
