import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

export function ConfirmDialog({ message, pending, error, onCancel, onConfirm }: {
  message: string; pending: boolean; error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="delete-title" aria-describedby="delete-message"
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50">
    <span className="mb-4 inline-flex rounded-full bg-danger-soft p-3 text-danger-ink"><Trash2 size={24} aria-hidden="true" /></span>
    <h2 id="delete-title" className="text-xl font-semibold">{t("patientDeleteTitle")}</h2>
    <p id="delete-message" className="mt-3 text-sm leading-6 text-muted">{message}</p>
    {error && <p role="alert" className="mt-4 text-sm text-danger-ink">{error}</p>}
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" autoFocus disabled={pending} onClick={onCancel} className="rounded-lg border border-line px-4 py-3 text-sm font-semibold hover:bg-soft">{t("patientCancel")}</button>
      <button type="button" disabled={pending} onClick={onConfirm} className="rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{t(pending ? "patientDeleting" : "patientDelete")}</button>
    </div>
  </dialog>;
}
