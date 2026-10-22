import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
declare global {
  interface Window {
    netDentyDiagnostics?: { save(): Promise<{ status: string }> };
  }
}
import { useTranslation } from "react-i18next";
import { WifiOff, LoaderCircle } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const gradientId = useId().replaceAll(":", "");
  return (
    <div
      className={`brand-logo-shell ${compact ? "brand-logo-shell-compact" : ""}`}
      role="img"
      aria-label={t("appName")}
    >
      <svg
        className="brand-mark"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop className="brand-mark-start" />
            <stop offset="1" className="brand-mark-end" />
          </linearGradient>
        </defs>
        <path
          className="brand-mark-outline"
          stroke={`url(#${gradientId})`}
          d="M18 7.5c5.6 0 8.6 3.1 14 3.1s8.4-3.1 14-3.1c8.1 0 13.1 6.5 11.6 15.7-.9 5.5-4.3 11.1-6 17-2.2 7.8-3.4 16.3-8.4 16.3-4.4 0-5.6-7.5-7.5-13.2-1.1-3.4-2-5.5-3.7-5.5s-2.6 2.1-3.7 5.5c-1.9 5.7-3.1 13.2-7.5 13.2-5 0-6.2-8.5-8.4-16.3-1.7-5.9-5.1-11.5-6-17C4.9 14 9.9 7.5 18 7.5Z"
        />
        <path
          className="brand-mark-wave"
          stroke={`url(#${gradientId})`}
          d="M13 25c5.2-4.5 9.7-4.5 15 0s9.8 4.5 15 0 7.2-4.2 9-3"
        />
      </svg>
      {!compact && (
        <span className="brand-wordmark" aria-hidden="true">
          <span className="brand-wordmark-name">
            <span className="brand-wordmark-net">Net</span>
            <span className="brand-wordmark-denty">Denty</span>
          </span>
          <span className="brand-wordmark-descriptor">{t("brandDescriptor")}</span>
        </span>
      )}
    </div>
  );
}
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});
export function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink"
      role="alert"
    >
      {message}
    </p>
  );
}
export function Loading() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="grid min-h-screen place-content-center gap-4 text-center text-muted"
    >
      <LoaderCircle className="mx-auto animate-spin" aria-hidden="true" />
      {t("loading")}
    </div>
  );
}
export function ConnectionScreen({ retry }: { retry: () => void }) {
  const { t, i18n } = useTranslation();
  const [collecting, setCollecting] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState("");
  const saveDiagnostics = async () => {
    setCollecting(true);
    setDiagnosticStatus("collectingDiagnostics");
    try {
      const result = await window.netDentyDiagnostics!.save();
      setDiagnosticStatus(result.status === "saved" ? "diagnosticsSaved" : result.status === "cancelled" ? "diagnosticsCancelled" : "diagnosticsFailed");
    } catch { setDiagnosticStatus("diagnosticsFailed"); }
    finally { setCollecting(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <section className="card max-w-lg p-10 text-center">
        <WifiOff
          size={36}
          className="mx-auto mb-6 text-accent-ink"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold">{t("connectionTitle")}</h1>
        <p className="my-4 leading-relaxed text-muted">
          {t("connectionDescription")}
        </p>
        <Button onClick={retry}>{t("retry")}</Button>
        {window.netDentyDiagnostics && <div className="mt-4"><Button disabled={collecting} onClick={() => void saveDiagnostics()}>{t(collecting ? "collectingDiagnostics" : "downloadDiagnostics")}</Button><p className="mt-3 text-sm text-muted" role="status" aria-live="polite">{diagnosticStatus && t(diagnosticStatus)}</p></div>}
        <div className="mt-8">
          <label htmlFor="connection-language" className="mr-3 text-sm">
            {t("language")}
          </label>
          <select
            id="connection-language"
            className="input w-auto"
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="en">{t("english")}</option>
            <option value="fr">{t("french")}</option>
          </select>
        </div>
      </section>
    </div>
  );
}
