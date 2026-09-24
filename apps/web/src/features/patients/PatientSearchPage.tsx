import { allowed } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Search, Pencil, Trash2, ChevronDown } from "lucide-react";
import type { Patient, PatientList, PatientSearch } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { Pagination } from "../../components/Pagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Button, ErrorMessage } from "../../components/ui";

export function PatientSearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const location = useLocation();
  const client = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [sort, setSort] = useState<NonNullable<PatientSearch["sort"]>>("id");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const invalidRange = Boolean(from && to && from > to);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: [
      "patients",
      "list",
      roomId,
      debounced,
      from,
      to,
      page,
      pageSize,
      sort,
      direction,
    ],
    enabled: !invalidRange,
    queryFn: ({ signal }) =>
      api<PatientList>(
        `/api/patients?${new URLSearchParams({ q: debounced, page: String(page), pageSize: String(pageSize), sort, direction, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`,
        { signal },
      ),
  });
  const totalPages = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / pageSize),
  );
  useEffect(() => {
    if (query.data && page > totalPages) setPage(totalPages);
  }, [query.data, page, totalPages]);
  const deletion = useMutation({
    mutationFn: (id: number) =>
      api(`/api/patients/${id}`, { method: "DELETE" }),
    onSuccess: async (_data, id) => {
      setDeleteTarget(null);
      client.removeQueries({
        queryKey: ["patients", "detail", roomId, String(id)],
      });
      await client.invalidateQueries({ queryKey: ["patients", "list"] });
    },
  });
  function remove(patient: Patient) {
    deletion.reset();
    setDeleteTarget(patient);
  }
  const rows = query.data?.patients ?? [];
  const waiting = search.trim() !== debounced || invalidRange;
  const newPath = `/patients/new?prefill=${encodeURIComponent(search.trim())}`;
  return (
    <>
      {deleteTarget && (
        <ConfirmDialog
          message={t("patientDeleteConfirm", {
            name: deleteTarget.fullName,
            id: deleteTarget.fileId,
          })}
          pending={deletion.isPending}
          error={deletion.error ? t(errorKey(deletion.error)) : undefined}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deletion.mutate(deleteTarget.id)}
        />
      )}
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 bg-canvas py-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("patients")}
        </h2>
        {allowed(user, "patients", "create") && (
          <Link className="button" to={newPath}>
            <Plus size={18} aria-hidden="true" />
            {t("newPatient")}
          </Link>
        )}
      </div>
      {location.state?.saved && (
        <p role="status" className="mb-4 text-sm text-accent-ink">
          {t("patientSaved")}
        </p>
      )}
      <section className="card mb-3 patient-search-filters">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-left text-sm font-semibold hover:bg-soft"
          aria-expanded={filtersOpen}
          aria-controls="patient-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Search size={18} aria-hidden="true" />
          <span>{t("patientFilters")}</span>
          {[search.trim(), from, to].filter(Boolean).length > 0 && (
            <span className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">
              {t("activeFilters", {
                count: [search.trim(), from, to].filter(Boolean).length,
              })}
            </span>
          )}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`ml-auto transition-transform ${filtersOpen ? "" : "-rotate-90"}`}
          />
        </button>
        <div id="patient-filters" hidden={!filtersOpen} className="px-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="patient-search" className="sr-only">
              {t("patientSearch")}
            </label>
            <div className="relative min-w-48 flex-1">
              <Search
                size={20}
                className="absolute left-3 top-2.5 text-muted"
                aria-hidden="true"
              />
              <input
                id="patient-search"
                type="search"
                autoComplete="off"
                className="input pl-10"
                maxLength={100}
                placeholder={t("patientSearch")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="visit-from"
                  className="mb-1 block text-xs font-medium"
                >
                  {t("visitFrom")}
                </label>
                <input
                  id="visit-from"
                  type="date"
                  className="input"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="visit-to"
                  className="mb-1 block text-xs font-medium"
                >
                  {t("visitTo")}
                </label>
                <input
                  id="visit-to"
                  type="date"
                  className="input"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <button
                className="rounded-lg border border-line px-3 py-2 text-sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setSearch("");
                  setPage(1);
                }}
              >
                {t("clearFilters")}
              </button>
            </div>
          </div>
          {invalidRange && <ErrorMessage message={t("visitRangeInvalid")} />}
        </div>
      </section>
      {deletion.error && <ErrorMessage message={t(errorKey(deletion.error))} />}
      {query.error && (
        <div className="mb-4">
          <ErrorMessage message={t(errorKey(query.error))} />
          <Button className="mt-3" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {!invalidRange && (query.isPending || waiting) && (
        <p role="status" className="py-5 text-muted">
          {t("patientSearching")}
        </p>
      )}
      {!query.isPending && !query.error && !waiting && rows.length === 0 && (
        <div className="card p-10 text-center">
          <p className="mb-5 text-muted">{t("patientEmpty")}</p>
          {allowed(user, "patients", "create") && (
            <Link to={newPath} className="button">
              {t("newPatient")}
            </Link>
          )}
        </div>
      )}
      {!waiting && rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-soft text-muted">
                <tr>
                  {(
                    [
                      ["id", "patientFileId"],
                      ["fullName", "patientFullName"],
                      ["phone", "patientPhone"],
                      ["gender", "patientGender"],
                      ["firstVisit", "patientFirstVisit"],
                    ] as const
                  ).map(([column, label]) => (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={
                        sort === column
                          ? direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      <button
                        className="inline-flex items-center gap-2 rounded"
                        onClick={() => {
                          setSort(column);
                          setDirection(
                            sort === column && direction === "asc"
                              ? "desc"
                              : "asc",
                          );
                          setPage(1);
                        }}
                      >
                        {t(label)}
                        <span aria-hidden="true">
                          {sort === column
                            ? direction === "asc"
                              ? "\u2191"
                              : "\u2193"
                            : "\u2195"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("patientActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((patient) => (
                  <tr
                    key={patient.id}
                    className="cursor-pointer border-b border-line hover:bg-soft"
                    onClick={() => navigate(`/patients/${patient.id}`)}
                  >
                    <td className="px-3 py-2">
                      <Link
                        className="font-semibold text-accent-ink underline-offset-4 hover:underline"
                        to={`/patients/${patient.id}`}
                      >
                        {patient.fileId}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {patient.fullName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {patient.phone}
                    </td>
                    <td className="px-3 py-2">
                      {t(`gender${patient.gender}`)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {patient.firstVisit}
                    </td>
                    <td
                      className="px-3 py-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex gap-2">
                        <Link
                          to={`/patients/${patient.id}`}
                          className="inline-flex items-center gap-1 rounded p-2 text-accent-ink hover:bg-accent-soft"
                          aria-label={`${t(allowed(user, "patients", "modify") ? "patientModify" : "permission_view")} ${patient.fullName}`}
                        >
                          <Pencil size={16} aria-hidden="true" />
                          {t("patientModify")}
                        </Link>
                        {allowed(user, "patients", "delete") && (
                          <button
                            type="button"
                            disabled={deletion.isPending}
                            onClick={() => remove(patient)}
                            className="inline-flex items-center gap-1 rounded p-2 text-danger-ink hover:bg-danger-soft disabled:opacity-50"
                            aria-label={`${t("patientDelete")} ${patient.fullName}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            {t("patientDelete")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={query.data.total}
              busy={query.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
