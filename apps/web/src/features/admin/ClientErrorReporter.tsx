import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../../lib/api";

function safeMessage(value: unknown) {
  const raw = value instanceof Error
    ? `${value.name}: ${value.message}`
    : typeof value === "string"
      ? value
      : "Unknown client runtime error";
  return raw
    .replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)[^\s]+/gi, "[redacted-url]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500) || "Unknown client runtime error";
}

export function ClientErrorReporter() {
  const { user } = useAuth();
  const recent = useRef({ signature: "", at: 0 });

  useEffect(() => {
    if (!user) return;
    const report = (value: unknown) => {
      const message = safeMessage(value);
      const code = value instanceof Error ? value.name.slice(0, 80) : "CLIENT_RUNTIME_ERROR";
      const signature = `${code}:${message}:${window.location.pathname}`;
      if (recent.current.signature === signature && Date.now() - recent.current.at < 10_000) return;
      recent.current = { signature, at: Date.now() };
      void api("/api/system-logs/client", {
        method: "POST",
        body: JSON.stringify({ code, message, path: window.location.pathname.slice(0, 300) }),
      }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => report(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [user]);

  return null;
}
