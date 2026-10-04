import { useRef, useState } from "react";
import { DatabaseBackup, HardDriveDownload, RotateCcw, Upload, Usb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { allowed } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";

declare global {
  interface Window {
    netDentyBackup?: {
      save(bytes: Uint8Array, suggestedName: string): Promise<{ saved: boolean }>;
    };
  }
}

type Operation = "backup" | "upload" | "restore" | null;

function responseFilename(response: Response) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  return disposition.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] ?? "NetDenty-backup.dump";
}

function saveInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function errorCode(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
  return body?.error?.code ?? "INTERNAL_ERROR";
}

export function BackupRestorePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canBackup = allowed(user, "backupRestore", "create");
  const canRestore = allowed(user, "backupRestore", "modify");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const createBackup = async () => {
    setOperation("backup");
    setProgress(null);
    setStatus(t("backupPreparing"));
    setError(null);
    try {
      const response = await fetch("/api/admin/database-backup", {
        credentials: "same-origin",
        headers: { "X-Clinic-Request": "1" },
      });
      if (!response.ok) throw new Error(await errorCode(response));
      const blob = await response.blob();
      const filename = responseFilename(response);
      setProgress(90);
      setStatus(t("backupSaving"));
      if (window.netDentyBackup) {
        const result = await window.netDentyBackup.save(new Uint8Array(await blob.arrayBuffer()), filename);
        if (!result.saved) {
          setStatus(t("backupSaveCancelled"));
          return;
        }
      } else saveInBrowser(blob, filename);
      setProgress(100);
      setStatus(t("backupComplete", { filename }));
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "INTERNAL_ERROR";
      setError(t(code));
      setStatus(null);
    } finally {
      setOperation(null);
    }
  };

  const restore = () => {
    if (!file) return;
    setConfirmRestore(false);
    setOperation("upload");
    setProgress(0);
    setStatus(t("restoreUploading"));
    setError(null);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/database-restore");
    request.withCredentials = true;
    request.setRequestHeader("Content-Type", "application/vnd.netdenty.postgresql-backup");
    request.setRequestHeader("X-Clinic-Request", "1");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 60));
    };
    request.upload.onload = () => {
      setOperation("restore");
      setProgress(null);
      setStatus(t("restoreApplying"));
    };
    request.onload = () => {
      setOperation(null);
      if (request.status >= 200 && request.status < 300) {
        setProgress(100);
        setStatus(t("restoreComplete"));
        setFile(null);
        if (input.current) input.current.value = "";
        return;
      }
      const body = (() => { try { return JSON.parse(request.responseText) as { error?: { code?: string } }; } catch { return null; } })();
      setError(t(body?.error?.code ?? "INTERNAL_ERROR"));
      setStatus(null);
      setProgress(null);
    };
    request.onerror = () => {
      setOperation(null);
      setProgress(null);
      setStatus(null);
      setError(t("NETWORK_ERROR"));
    };
    request.send(file);
  };

  const busy = operation !== null;
  return (
    <div className="space-y-5">
      {confirmRestore && file && (
        <ConfirmDialog
          tone="danger"
          title={t("restoreConfirmTitle")}
          message={t("restoreConfirmMessage", { filename: file.name })}
          confirmLabel={t("restoreDatabase")}
          pending={false}
          onCancel={() => setConfirmRestore(false)}
          onConfirm={restore}
        />
      )}
      <header>
        <p className="eyebrow">{t("settings")}</p>
        <h2 className="mt-3 text-3xl font-semibold">{t("backupRestore")}</h2>
      </header>

      {(status || error || busy) && (
        <section className={`card p-5 ${error ? "border-danger-line" : ""}`} aria-live="polite">
          <div className="flex items-center gap-3">
            {busy && <RotateCcw size={20} className="animate-spin text-accent-ink" aria-hidden="true"/>}
            <p className={`text-sm font-semibold ${error ? "text-danger-ink" : "text-ink"}`}>{error ?? status}</p>
          </div>
          {(busy || progress !== null) && (
            <progress className="mt-4 h-2 w-full accent-[var(--accent-solid)]" max={100} value={progress ?? undefined} aria-label={t("operationProgress")}/>
          )}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card flex flex-col p-6">
          <span className="mb-5 inline-flex w-fit rounded-xl bg-accent-soft p-3 text-accent-ink"><DatabaseBackup size={25} aria-hidden="true"/></span>
          <h3 className="text-xl font-semibold">{t("createDatabaseBackup")}</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted">{t("createDatabaseBackupDescription")}</p>
          <div className="my-5 flex items-center gap-3 rounded-xl bg-soft p-4 text-sm text-muted">
            <HardDriveDownload size={20} aria-hidden="true"/><Usb size={20} aria-hidden="true"/><span>{t("backupDestinationHint")}</span>
          </div>
          <button type="button" className="button justify-center" disabled={busy || !canBackup} onClick={() => void createBackup()}>
            <DatabaseBackup size={18} aria-hidden="true"/>{t("createBackup")}
          </button>
        </section>

        <section className="card flex flex-col p-6">
          <span className="mb-5 inline-flex w-fit rounded-xl bg-danger-soft p-3 text-danger-ink"><Upload size={25} aria-hidden="true"/></span>
          <h3 className="text-xl font-semibold">{t("restoreDatabase")}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{t("restoreDatabaseDescription")}</p>
          <label className="my-5 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-soft p-5 text-center hover:border-accent-solid">
            <Upload size={22} className="mb-2 text-accent-ink" aria-hidden="true"/>
            <span className="text-sm font-semibold">{file?.name ?? t("chooseBackupFile")}</span>
            {file && <span className="mt-1 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
            <input ref={input} className="sr-only" type="file" accept=".dump,application/vnd.netdenty.postgresql-backup" disabled={busy || !canRestore}
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setStatus(null); }}/>
          </label>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            disabled={!file || busy || !canRestore} onClick={() => setConfirmRestore(true)}>
            <RotateCcw size={18} aria-hidden="true"/>{t("restoreDatabase")}
          </button>
        </section>
      </div>
    </div>
  );
}
