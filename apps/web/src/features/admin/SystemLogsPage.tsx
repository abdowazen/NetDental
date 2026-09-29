import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SystemLogPage, SystemLogSource } from "@clinic/shared";
import { Pagination } from "../../components/Pagination";
import { ErrorMessage } from "../../components/ui";
import { api, errorKey } from "../../lib/api";

export function SystemLogsPage() {
  const { t, i18n } = useTranslation();
  const [source, setSource] = useState<"all" | SystemLogSource>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  useEffect(() => setPage(1), [source]);
  const query = useQuery({
    queryKey: ["admin", "system-logs", source, page, pageSize],
    queryFn: ({ signal }) => api<SystemLogPage>(`/api/admin/system-logs?${new URLSearchParams({ source, page: String(page), pageSize: String(pageSize) })}`, { signal }),
    refetchInterval: 30_000,
  });
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));

  return (
    <div className="space-y-5">
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
        </div>
      </header>
      {query.error && <ErrorMessage message={t(errorKey(query.error))}/>} 
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-soft text-muted"><tr>
              {["systemLogTime", "systemLogLevel", "systemLogSource", "systemLogCode", "systemLogLocation", "systemLogMessage"].map((key) => <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">{t(key)}</th>)}
            </tr></thead>
            <tbody>
              {query.data?.logs.map((log) => <tr key={log.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-3">{date(log.createdAt)}</td>
                <td className="px-3 py-3"><span className="rounded-full bg-danger-soft px-2 py-1 text-xs font-semibold text-danger-ink">{t(`systemLogLevel_${log.level}`)}</span></td>
                <td className="px-3 py-3">{t(`systemLogSource_${log.source}`)}</td>
                <td className="px-3 py-3 font-mono text-xs">{log.code}</td>
                <td className="px-3 py-3"><span className="block font-medium">{log.method}</span><span className="break-all text-xs text-muted">{log.path}</span></td>
                <td className="max-w-md break-words px-3 py-3">{log.message}</td>
              </tr>)}
              {!query.isPending && !query.data?.logs.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">{t("systemLogsEmpty")}</td></tr>}
              {query.isPending && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted" role="status">{t("loading")}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} busy={query.isFetching} label={t("systemLogsPagination")} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
      </section>
    </div>
  );
}
