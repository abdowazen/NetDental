import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Search, Pencil, Power, ChevronDown } from "lucide-react";
import { allowed, type Procedure, type ProcedureList, type ProcedureSearch } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Pagination } from "../../components/Pagination";
import { Button, ErrorMessage } from "../../components/ui";

export function ProcedureSearchPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<ProcedureSearch["sort"]>("id");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["procedures", "list", roomId, debounced, page, pageSize, sort, direction],
    queryFn: ({ signal }) => api<ProcedureList>(`/api/procedures?${new URLSearchParams({
      q: debounced, page: String(page), pageSize: String(pageSize), sort, direction,
    })}`, { signal }),
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));
  useEffect(() => { if (query.data && page > totalPages) setPage(totalPages); }, [query.data, page, totalPages]);
  const status = useMutation({
    mutationFn: (procedure: Procedure) => api(`/api/procedures/${procedure.id}/status`, {
      method: "PATCH", body: JSON.stringify({ active: !procedure.active }),
    }),
    onSuccess: async (_data, procedure) => {
      client.removeQueries({ queryKey: ["procedures", "detail", roomId, String(procedure.id)] });
      await client.invalidateQueries({ queryKey: ["procedures", "list"] });
    },
  });
  const waiting = search.trim() !== debounced;
  const rows = query.data?.procedures ?? [];
  const canModify = allowed(user, "actsProcedures", "modify");
  return <>
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 bg-canvas py-1">
      <h2 className="text-2xl font-semibold tracking-tight">{t("actsProcedures")}</h2>
      {allowed(user, "actsProcedures", "create") && <Link className="button" to="/procedures/new"><Plus size={18} aria-hidden="true" />{t("newProcedure")}</Link>}
    </div>
    {location.state?.saved && <p role="status" className="mb-4 text-sm text-accent-ink">{t("procedureSaved")}</p>}
    <section className="card mb-3 patient-search-filters">
      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-left text-sm font-semibold hover:bg-soft" aria-expanded={filtersOpen} aria-controls="procedure-filters" onClick={() => setFiltersOpen(!filtersOpen)}>
        <Search size={18} aria-hidden="true" /><span>{t("patientFilters")}</span>
        {search.trim() && <span className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">{t("activeFilters", { count: 1 })}</span>}
        <ChevronDown size={18} aria-hidden="true" className={`ml-auto transition-transform ${filtersOpen ? "" : "-rotate-90"}`} />
      </button>
      <div id="procedure-filters" hidden={!filtersOpen} className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <label htmlFor="procedure-search" className="sr-only">{t("procedureSearch")}</label>
          <div className="relative min-w-48 flex-1">
            <Search size={20} className="absolute left-3 top-2.5 text-muted" aria-hidden="true" />
            <input id="procedure-search" type="search" autoComplete="off" className="input pl-10" maxLength={100} placeholder={t("procedureSearch")} value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <button className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => { setSearch(""); setPage(1); }}>{t("clearFilters")}</button>
        </div>
      </div>
    </section>
    {status.error && <ErrorMessage message={t(errorKey(status.error))} />}
    {query.error && <div className="mb-4"><ErrorMessage message={t(errorKey(query.error))} /><Button className="mt-3" onClick={() => void query.refetch()}>{t("retry")}</Button></div>}
    {(query.isPending || waiting) && <p role="status" className="py-5 text-muted">{t("loading")}</p>}
    {!query.isPending && !query.error && !waiting && rows.length === 0 && <div className="card p-10 text-center">
      <p className="mb-5 text-muted">{t("procedureEmpty")}</p>
      {allowed(user, "actsProcedures", "create") && <Link to="/procedures/new" className="button">{t("newProcedure")}</Link>}
    </div>}
    {!waiting && !query.error && rows.length > 0 && <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-soft text-muted"><tr>
            {([["code", "procedureCode"], ["name", "procedureName"], ["category", "procedureCategory"], ["defaultPrice", "procedurePrice"], ["active", "procedureStatus"]] as const).map(([column, label]) => <th key={column} scope="col" aria-sort={sort === column ? direction === "asc" ? "ascending" : "descending" : "none"} className="whitespace-nowrap px-3 py-2 font-medium">
              <button className="inline-flex items-center gap-2 rounded" onClick={() => { setSort(column); setDirection(sort === column && direction === "asc" ? "desc" : "asc"); setPage(1); }}>
                {t(label)}<span aria-hidden="true">{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
              </button>
            </th>)}
            <th scope="col" className="px-3 py-2 font-medium">{t("patientActions")}</th>
          </tr></thead>
          <tbody>{rows.map((procedure) => <tr key={procedure.id} className="cursor-pointer border-b border-line hover:bg-soft" onClick={() => navigate(`/procedures/${procedure.id}`)}>
            <td className="px-3 py-2"><Link className="font-semibold text-accent-ink underline-offset-4 hover:underline" to={`/procedures/${procedure.id}`}>{procedure.code}</Link></td>
            <td className="px-3 py-2 font-medium">{procedure.name}</td>
            <td className="px-3 py-2">{t(`procedureCategory_${procedure.category}`)}</td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(Number(procedure.defaultPrice))}</td>
            <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${procedure.active ? "bg-accent-soft text-accent-ink" : "bg-soft text-muted"}`}>{t(procedure.active ? "procedureActive" : "procedureInactive")}</span></td>
            <td className="px-3 py-1" onClick={(event) => event.stopPropagation()}><div className="flex gap-2">
              <Link to={`/procedures/${procedure.id}`} className="inline-flex items-center gap-1 rounded p-2 text-accent-ink hover:bg-accent-soft" aria-label={`${t(canModify ? "procedureEditAction" : "permission_view")} ${procedure.name}`}>
                <Pencil size={16} aria-hidden="true" />{t(canModify ? "procedureEditAction" : "permission_view")}
              </Link>
              {canModify && <button type="button" disabled={status.isPending} onClick={() => status.mutate(procedure)} className="inline-flex items-center gap-1 rounded p-2 text-accent-ink hover:bg-accent-soft disabled:opacity-50" aria-label={`${t(procedure.active ? "procedureDeactivate" : "procedureActivate")} ${procedure.name}`}>
                <Power size={16} aria-hidden="true" />{t(procedure.active ? "procedureDeactivate" : "procedureActivate")}
              </button>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {query.data && <Pagination page={page} pageSize={pageSize} total={query.data.total} busy={query.isFetching} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
    </div>}
  </>;
}
