import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SystemLog, SystemLogPage, SystemLogSource } from "@clinic/shared";
import { Pagination } from "../../components/Pagination";
import { ErrorMessage } from "../../components/ui";
import { api, errorKey } from "../../lib/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export function SystemLogsPage() {
  const { t, i18n } = useTranslation();
  const [source, setSource] = useState<"all" | SystemLogSource>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [deleting, setDeleting] = useState<SystemLog | null>(null);
  const [clearing, setClearing] = useState(false);
  const client = useQueryClient();
  useEffect(() => setPage(1), [source]);
  const query = useQuery({
    queryKey: ["admin", "system-logs", source, page, pageSize],
    queryFn: ({ signal }) => api<SystemLogPage>(`/api/admin/system-logs?${new URLSearchParams({ source, page: String(page), pageSize: String(pageSize) })}`, { signal }),
    refetchInterval: 30_000,
  });
  const remove = useMutation({ mutationFn: (log: SystemLog) => api(`/api/admin/system-logs/${log.id}`, { method: "DELETE" }), onSuccess: async () => { setDeleting(null); if ((query.data?.logs.length ?? 0) === 1 && page > 1) setPage((value) => value - 1); await client.invalidateQueries({ queryKey: ["admin", "system-logs"] }); } });
  const clear = useMutation({ mutationFn: () => api<{ deleted: number }>(`/api/admin/system-logs?${new URLSearchParams({ source })}`, { method: "DELETE" }), onSuccess: async () => { setClearing(false); setPage(1); await client.invalidateQueries({ queryKey: ["admin", "system-logs"] }); } });
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));

  return (
    <div className="space-y-5">
      {deleting && (
        <ConfirmDialog
          title={t("systemLogDeleteTitle")}
          message={t("systemLogDeleteMessage", { code: deleting.code })}
          confirmLabel={t("systemLogDelete")}
          pending={remove.isPending}
          error={remove.error ? t(errorKey(remove.error)) : undefined}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting)}
        />
      )}
      {clearing && (
        <ConfirmDialog
          title={t("systemLogsClearTitle")}
          message={t("systemLogsClearMessage", { source: t(`systemLogSource_${source}`), count: query.data?.total ?? 0 })}
          confirmLabel={t("systemLogsClear")}
          pending={clear.isPending}
          error={clear.error ? t(errorKey(clear.error)) : undefined}
          onCancel={() => setClearing(false)}
          onConfirm={() => clear.mutate()}
        />
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("administration")}</p>
          <h2 className="mt-3 text-3xl font-semibold">{t("systemLogs")}</h2>
          <p className="mt-2 text-sm text-muted">{t("systemLogsDescription")}</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("systemLogSource")}</span>
            <select className="input min-h-10 py-2" value={source} onChange={(event) => setSource(event.target.value as "all" | SystemLogSource)}>
              <option value="all">{t("systemLogSource_all")}</option>
              <option value="api">{t("systemLogSource_api")}</option>
              <option value="client">{t("systemLogSource_client")}</option>
            </select>
          </label>
          <button type="button" className="button min-h-10 px-4 py-2" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw size={17} className={query.isFetching ? "animate-spin" : ""}/>{t("refresh")}
          </button>
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-2 text-sm font-semibold text-danger-ink disabled:opacity-50" disabled={!query.data?.total || clear.isPending} onClick={() => setClearing(true)}><Trash2 size={17}/>{t("systemLogsClear")}</button>
        </div>
      </header>
      {(query.error || remove.error || clear.error) && (
        <ErrorMessage message={t(errorKey(query.error ?? remove.error ?? clear.error))}/>
      )}
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-soft text-muted"><tr>
              {["systemLogTime", "systemLogLevel", "systemLogSource", "systemLogCode", "systemLogLocation", "systemLogMessage", "patientActions"].map((key) => <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">{t(key)}</th>)}
            </tr></thead>
            <tbody>
              {query.data?.logs.map((log) => <tr key={log.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-3">{date(log.createdAt)}</td>
                <td className="px-3 py-3"><span className="rounded-full bg-danger-soft px-2 py-1 text-xs font-semibold text-danger-ink">{t(`systemLogLevel_${log.level}`)}</span></td>
                <td className="px-3 py-3">{t(`systemLogSource_${log.source}`)}</td>
                <td className="px-3 py-3 font-mono text-xs">{log.code}</td>
                <td className="px-3 py-3"><span className="block font-medium">{log.method}</span><span className="break-all text-xs text-muted">{log.path}</span></td>
                <td className="max-w-lg break-words px-3 py-3"><span>{log.message}</span><details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-accent-ink">{t("systemLogShowDetails")}</summary><dl className="mt-2 grid gap-1 rounded-lg bg-soft p-3 text-xs"><div><dt className="inline font-semibold">{t("systemLogRequestId")}: </dt><dd className="inline font-mono">{log.requestId || "—"}</dd></div><div><dt className="inline font-semibold">{t("systemLogUserId")}: </dt><dd className="inline font-mono">{log.userId || "—"}</dd></div></dl>{log.details && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-soft p-3 font-mono text-xs">{log.details}</pre>}</details></td>
                <td className="px-3 py-3"><button type="button" className="rounded p-2 text-danger-ink hover:bg-danger-soft" aria-label={`${t("systemLogDelete")} ${log.code}`} onClick={() => setDeleting(log)}><Trash2 size={16}/></button></td>
              </tr>)}
              {!query.isPending && !query.data?.logs.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted">{t("systemLogsEmpty")}</td></tr>}
              {query.isPending && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted" role="status">{t("loading")}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} busy={query.isFetching} label={t("systemLogsPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
      </section>
    </div>
  );
}
