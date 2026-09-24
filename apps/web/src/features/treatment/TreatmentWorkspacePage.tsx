import { lazy, Suspense, useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardList, CreditCard, Wallet, Scale, Search, CalendarDays, Layers, FlaskConical, Images, History } from "lucide-react";
import { allowed, type Patient, type PatientList } from "@clinic/shared";
import { useAuth } from "../auth/AuthProvider";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api, errorKey } from "../../lib/api";
import { Button, ErrorMessage } from "../../components/ui";
const OdontogramWorkspace = lazy(() => import("./OdontogramWorkspace"));
import { ChartWorkspaceBoundary } from "./ChartWorkspaceBoundary";

const tabs = ["plan", "session", "payments", "laboratory", "files", "history"] as const;
type Tab = typeof tabs[number];
const tabIcons = { plan: Layers, session: CalendarDays, payments: CreditCard, laboratory: FlaskConical, files: Images, history: History };

export function TreatmentWorkspacePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roomId } = useWorkspace();
  const [tab, setTab] = useState<Tab>("plan");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patientOpen, setPatientOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const canReadPatients = allowed(user, "patients");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const patients = useQuery({
    queryKey: ["patients", "treatment-search", roomId, debounced],
    enabled: canReadPatients && patientOpen,
    queryFn: ({ signal }) => api<PatientList>(`/api/patients?${new URLSearchParams({ q: debounced, pageSize: "30", sort: "fullName", direction: "asc" })}`, { signal }),
  });
  const detail = useQuery({
    queryKey: ["patients", "detail", roomId, patientId],
    enabled: canReadPatients && !!patientId,
    queryFn: ({ signal }) => api<{ patient: Patient }>(`/api/patients/${patientId}`, { signal }),
  });
  const patient = canReadPatients ? detail.data?.patient : undefined;
  const rows = patients.data?.patients ?? [];
  const searching = search.trim() !== debounced || patients.isFetching;
  function choosePatient(row: Patient) {
    setPatientId(String(row.id));
    setSearch("");
    setPatientOpen(false);
    setActiveOption(-1);
    setTab((current) => current === "session" ? "session" : "plan");
  }
  function changeTab(next: Tab) { setTab(next); }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]);
    document.getElementById(`treatment-tab-${tabs[next]}`)?.focus();
  }
  return <div className="space-y-2">
    <section className="card px-3 py-2" aria-label={t("twPatient")}>
      {canReadPatients ? <>
        <div className="flex items-center gap-3">
          <label htmlFor="treatment-patient" className="text-sm font-medium">{t("twPatient")}</label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-muted" size={18} aria-hidden="true" />
            <input id="treatment-patient" role="combobox" aria-autocomplete="list" aria-expanded={patientOpen} aria-controls="treatment-patient-options"
              aria-activedescendant={patientOpen && !searching && rows[activeOption] ? `patient-option-${rows[activeOption].id}` : undefined}
              autoComplete="off" className="input !min-h-0 !py-2 pl-10" maxLength={100}
              value={patientOpen ? search : patient ? `${patient.fullName} · ${patient.fileId}` : search}
              onFocus={() => { setPatientOpen(true); setActiveOption(-1); }}
              onBlur={() => { setPatientOpen(false); setActiveOption(-1); }}
              onChange={(event) => { setSearch(event.target.value); setPatientOpen(true); setActiveOption(-1); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setPatientOpen(false); setActiveOption(-1); }
                else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault(); setPatientOpen(true);
                  if (!searching) setActiveOption((current) => event.key === "ArrowDown" ? Math.min(current + 1, rows.length - 1) : Math.max(0, current - 1));
                } else if (event.key === "Enter" && patientOpen && !searching && rows[activeOption]) {
                  event.preventDefault(); choosePatient(rows[activeOption]);
                }
              }} placeholder={t("twSearchPatient")} />
            {patientOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              <ul id="treatment-patient-options" role="listbox" aria-label={t("twPatient")} className="max-h-60 overflow-y-auto">
                {!searching && !patients.error && rows.map((row, index) => <li key={row.id} id={`patient-option-${row.id}`} role="option" aria-selected={activeOption === index}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent-soft ${activeOption === index ? "bg-accent-soft text-accent-ink" : ""}`}
                  onMouseDown={(event) => event.preventDefault()} onClick={() => choosePatient(row)}>
                  <span className="font-medium">{row.fullName}</span><span className="ml-2 text-xs text-muted">{row.fileId} · {row.phone}</span>
                </li>)}
              </ul>
              <div role="status" className="text-xs text-muted">
                {searching ? <p className="px-3 py-2">{t("loading")}</p> : patients.data?.total === 0 ? <p className="px-3 py-2">{t("patientEmpty")}</p> : null}
                {!searching && patients.data && patients.data.total > 30 && <p className="border-t border-line px-3 py-2">{t("twRefineSearch")}</p>}
              </div>
            </div>}
          </div>
          {patient && <Link className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-accent-line px-3 text-sm font-semibold text-accent-ink hover:bg-accent-soft" to={`/patients/${patient.id}`}>{t("twViewPatient")}</Link>}
        </div>
        {(patients.error || detail.error) && <div className="mt-3"><ErrorMessage message={t(errorKey(patients.error ?? detail.error))} /><Button className="mt-2" onClick={() => { void patients.refetch(); if (patientId) void detail.refetch(); }}>{t("retry")}</Button></div>}
      </> : <p className="text-sm text-muted">{t("twPatientAccess")}</p>}
    </section>


    <div role="tablist" aria-label={t("treatment")} className="flex overflow-x-auto border-b border-line">
      {tabs.map((value, index) => <button key={value} id={`treatment-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`treatment-panel-${value}`} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => onTabKey(event, index)} onClick={() => changeTab(value)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${tab === value ? "border-accent-solid text-accent-ink" : "border-transparent text-muted hover:text-ink"}`}>{t(`twTab_${value}`)}</button>)}
    </div>
    <section id={`treatment-panel-${tab}`} role="tabpanel" aria-labelledby={`treatment-tab-${tab}`} tabIndex={0}>
      {tab === "plan" || tab === "session" || tab === "history" ? ((patient || tab === "plan" || tab === "session") ? <ChartWorkspaceBoundary key={patient?.id ?? "preview"}><Suspense fallback={<p>{t("loading")}</p>}><OdontogramWorkspace key={patient?.id ?? "preview"} patientId={patient?.id} historyOnly={tab !== "plan"} showHistory={tab === "history"} onNavigate={changeTab} /></Suspense></ChartWorkspaceBoundary> : <div className="card p-8 text-center text-muted">{t("twChoosePatient")}</div>) : tab === "payments" ? <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["twEstimate", ClipboardList], ["twCharges", CreditCard], ["twReceived", Wallet], ["twBalance", Scale],
          ] as const).map(([label, Icon]) => <section key={label} className="card flex items-center gap-4 p-5">
            <span className="rounded-xl bg-accent-soft p-3 text-accent-ink"><Icon size={22} aria-hidden="true" /></span>
            <div><h2 className="text-xs font-medium text-muted">{t(label)}</h2><p className="mt-1 text-2xl font-semibold text-accent-ink" aria-label={t("twUnavailable")}>—</p></div>
          </section>)}
        </div>
        <WorkspaceEmpty tab={tab} />
      </div> : <WorkspaceEmpty tab={tab} />}
    </section>
  </div>;
}

function WorkspaceEmpty({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const Icon = tabIcons[tab];
  return <div className="card flex min-h-64 flex-col items-center justify-center p-8 text-center">
    <span className="mb-4 rounded-xl bg-accent-soft p-4 text-accent-ink"><Icon size={28} aria-hidden="true" /></span>
    <h2 className="text-lg font-semibold">{t(`twTab_${tab}`)}</h2>
    <p className="mt-3 max-w-md text-sm leading-6 text-muted">{t(`twEmpty_${tab}`)}</p>
  </div>;
}

