import {
  forwardRef,
  type InputHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Activity, WifiOff, LoaderCircle } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span className="brand-mark">
        <Activity size={25} strokeWidth={1.7} />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          {t("appName")}
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
