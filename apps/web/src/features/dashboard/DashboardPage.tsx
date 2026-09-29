import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banknote, FlaskConical, Scale, UsersRound } from "lucide-react";
import type { DashboardBucket, DashboardPeriod, DashboardSummary } from "@clinic/shared";
import { api, errorKey } from "../../lib/api";
import { ErrorMessage } from "../../components/ui";
import { useWorkspace } from "../auth/WorkspaceProvider";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { roomId } = useWorkspace();
  const [period, setPeriod] = useState<DashboardPeriod>("monthly");
  const query = useQuery({ queryKey: ["dashboard", roomId, period], queryFn: ({ signal }) => api<DashboardSummary>(`/api/dashboard?period=${period}`, { signal }) });
  const data = query.data;
  const today = new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const money = (value: string) => data ? new Intl.NumberFormat(i18n.language, { style: "currency", currency: data.currency, maximumFractionDigits: data.currency === "LBP" ? 0 : 2 }).format(Number(value)) : "—";
  return <div className="space-y-4">
    <header><p className="text-xs text-muted">{today}</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{t("dashboardClinicOverview")}</h1><p className="mt-1 text-sm text-muted">{t("dashboardTodayActivity")}</p></header>
    {query.error && <ErrorMessage message={t(errorKey(query.error))}/>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("dashboardTodayActivity")}>
      <MetricCard icon={UsersRound} tone="teal" label={t("dashboardPatientsTreated")} value={data ? String(data.patientsTreatedToday) : "—"}/>
      <MetricCard icon={Banknote} tone="green" label={t("dashboardPaymentsToday")} value={data ? money(data.paymentsReceivedToday) : "—"}/>
      <MetricCard icon={Scale} tone="blue" label={t("dashboardOutstanding")} value={data ? money(data.outstandingBalance) : "—"}/>
      <MetricCard icon={FlaskConical} tone="orange" label={t("dashboardPendingLabs")} value={data ? String(data.pendingLabRequests) : "—"}/>
    </section>
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="font-semibold">{t("dashboardOverview")}</h2><p className="text-xs text-muted">{t(period === "monthly" ? "dashboardCurrentMonth" : "dashboardCurrentYear")}</p></div><div className="flex rounded-lg border border-line bg-soft p-1" role="group" aria-label={t("dashboardPeriod")}>
        {(["monthly","yearly"] as DashboardPeriod[]).map((value) => <button type="button" key={value} aria-pressed={period === value} className={`rounded-md px-4 py-2 text-xs font-semibold ${period === value ? "bg-accent-solid text-white shadow-sm" : "text-muted hover:text-ink"}`} onClick={() => setPeriod(value)}>{t(`dashboardPeriod_${value}`)}</button>)}
      </div></div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.35fr_0.65fr]">
        <ChartCard title={t("dashboardChargesPayments")} buckets={data?.buckets ?? []} series={[{ key: "charges", label: t("dashboardCharges"), color: "bg-blue-500" }, { key: "payments", label: t("dashboardPayments"), color: "bg-accent-solid" }]} period={period} locale={i18n.language}/>
        <ChartCard title={t("dashboardLaboratoryCosts")} buckets={data?.buckets ?? []} series={[{ key: "labRequested", label: t("labStatus_requested"), color: "bg-amber-500" }, { key: "labReceived", label: t("labStatus_received"), color: "bg-emerald-500" }]} period={period} locale={i18n.language}/>
      </div>
      <div className="border-t border-line p-4"><div className="mb-4"><h3 className="text-sm font-semibold">{t("reportRegistrationTrend")}</h3><p className="text-xs text-muted">{t(period === "monthly" ? "dashboardRegistrationTrendMonthly" : "dashboardRegistrationTrendYearly")}</p></div>
        <RegistrationTrendChart buckets={data?.buckets ?? []} period={period} locale={i18n.language} label={t("reportRegistrationTrend")}/>
      </div>
      <div className="border-t border-line p-4"><h3 className="text-sm font-semibold">{t("dashboardMostPerformed")}</h3><div className="mt-4 space-y-3">
        {(data?.procedures.length ? data.procedures : [{ name: t("dashboardNoProcedures"), count: 0 }]).map((item, index) => <div key={item.name}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{item.name}</span><strong>{item.count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${procedureColors[index % procedureColors.length]}`} style={{ width: `${data?.procedures[0]?.count ? Math.max(8, item.count / data.procedures[0].count * 100) : 0}%` }}/></div></div>)}
      </div></div>
    </section>
  </div>;
}

const procedureColors = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function RegistrationTrendChart({ buckets, period, locale, label }: { buckets: DashboardBucket[]; period: DashboardPeriod; locale: string; label: string }) {
  const width = 900, height = 230, left = 42, right = 16, top = 18, bottom = 36;
  const max = Math.max(1, ...buckets.map((item) => item.registrations));
  const points = useMemo(() => buckets.map((item, index) => ({
    key: item.key,
    count: item.registrations,
    x: left + (buckets.length <= 1 ? 0 : index * (width - left - right) / (buckets.length - 1)),
    y: top + (height - top - bottom) * (1 - item.registrations / max),
  })), [buckets, max]);
  const curve = points.length ? points.slice(1).reduce((path, point, index) => {
    const previous = points[index]; const middleX = (previous.x + point.x) / 2;
    return `${path} Q ${previous.x} ${previous.y} ${middleX} ${(previous.y + point.y) / 2}${index === points.length - 2 ? ` T ${point.x} ${point.y}` : ""}`;
  }, `M ${points[0].x} ${points[0].y}`) : "";
  const area = points.length ? `${curve} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z` : "";
  const bucketLabel = (key: string) => period === "monthly" ? key : new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${key}-01T00:00:00Z`));
  return <div className="overflow-x-auto"><svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full">
    <defs><linearGradient id="dashboard-patient-registration-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--accent-solid))" stopOpacity=".28"/><stop offset="100%" stopColor="rgb(var(--accent-solid))" stopOpacity=".02"/></linearGradient></defs>
    {[0, .25, .5, .75, 1].map((ratio) => { const y = top + ratio * (height - top - bottom); return <g key={ratio}><line x1={left} y1={y} x2={width-right} y2={y} stroke="rgb(var(--line))" strokeWidth="1"/><text x={left-8} y={y+4} textAnchor="end" fontSize="10" fill="rgb(var(--muted))">{Math.round(max * (1-ratio))}</text></g>; })}
    {area && <path d={area} fill="url(#dashboard-patient-registration-area)"/>}{curve && <path d={curve} fill="none" stroke="rgb(var(--accent-solid))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
    {points.map((point) => <g key={point.key}><circle cx={point.x} cy={point.y} r={point.count ? 4 : 2.5} fill="rgb(var(--surface))" stroke="rgb(var(--accent-solid))" strokeWidth="2"><title>{bucketLabel(point.key)}: {point.count}</title></circle><text x={point.x} y={height-13} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">{bucketLabel(point.key)}</text></g>)}
  </svg><ul className="sr-only">{points.map((item) => <li key={item.key}>{bucketLabel(item.key)}: {item.count}</li>)}</ul></div>;
}

function MetricCard({ icon: Icon, tone, label, value }: { icon: typeof UsersRound; tone: "teal" | "green" | "blue" | "orange"; label: string; value: string }) {
  const colors = { teal: "bg-teal-50 text-teal-700", green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", orange: "bg-orange-50 text-orange-700" };
  return <article className="card flex items-center gap-4 p-4"><span className={`rounded-full p-3 ${colors[tone]}`}><Icon size={20}/></span><div className="min-w-0"><h2 className="text-xs font-medium text-muted">{label}</h2><p className="mt-1 truncate text-xl font-bold">{value}</p></div></article>;
}

type SeriesKey = "charges" | "payments" | "labRequested" | "labReceived";
function ChartCard({ title, buckets, series, period, locale }: { title: string; buckets: DashboardBucket[]; series: { key: SeriesKey; label: string; color: string }[]; period: DashboardPeriod; locale: string }) {
  const max = Math.max(1, ...buckets.flatMap((row) => series.map((item) => Number(row[item.key]))));
  const label = (key: string) => period === "monthly" ? key : new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${key}-01T00:00:00Z`));
  return <section className="rounded-xl border border-line p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><div className="flex gap-3 text-[10px] text-muted">{series.map((item) => <span key={item.key} className="flex items-center gap-1"><i className={`h-2 w-2 rounded-full ${item.color}`}/>{item.label}</span>)}</div></div>
    <div className="flex h-44 items-end gap-2 border-b border-line px-1">{buckets.map((row) => <div key={row.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch"><div className="flex w-full flex-1 items-end justify-center gap-1">{series.map((item) => <div key={item.key} title={`${item.label}: ${row[item.key]}`} className={`w-full max-w-5 rounded-t ${item.color}`} style={{ height: `${Math.max(Number(row[item.key]) ? 3 : 0, Number(row[item.key]) / max * 100)}%` }}/>)}</div><span className="pb-1 text-[9px] text-muted">{label(row.key)}</span></div>)}</div>
  </section>;
}
