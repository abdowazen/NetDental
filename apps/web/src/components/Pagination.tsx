import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Pagination({ page, pageSize, total, busy, onPageChange, onPageSizeChange }: {
  page: number; pageSize: number; total: number; busy: boolean;
  onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visible = new Set([1, pages]);
  const start = Math.max(1, Math.min(page - 1, pages - 4));
  const end = Math.min(pages, Math.max(page + 1, 5));
  for (let n = start; n <= end; n++) visible.add(n);
  const numbers = [...visible].sort((a, b) => a - b);
  const control = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm transition-colors hover:bg-soft disabled:opacity-40";
  return <nav aria-label={t("patientPagination")} className="flex flex-wrap items-center justify-between gap-4 bg-surface px-4 py-3">
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span role="status">{t("paginationRange", { from: total ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, total), total })}</span>
      <label className="flex items-center gap-2">{t("rowsPerPage")}
        <select className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink" value={pageSize} disabled={busy} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 30, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
    </div>
    <div className="flex items-center gap-1">
      <button type="button" className={control} disabled={busy || page <= 1} aria-label={t("previousPage")} onClick={() => onPageChange(page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
      {numbers.map((n, index) => <span key={n} className="inline-flex items-center gap-1">
        {index > 0 && n - numbers[index - 1] > 1 && <MoreHorizontal className="mx-1 text-muted" size={18} aria-hidden="true" />}
        <button type="button" aria-label={t("paginationGoTo", { page: n })} aria-current={page === n ? "page" : undefined} disabled={busy} onClick={() => onPageChange(n)} className={`${control} ${page === n ? "bg-accent-soft font-semibold text-accent-ink ring-1 ring-inset ring-accent-line" : "text-muted"}`}>{n}</button>
      </span>)}
      <button type="button" className={control} disabled={busy || page >= pages} aria-label={t("nextPage")} onClick={() => onPageChange(page + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  </nav>;
}
