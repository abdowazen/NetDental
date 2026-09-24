import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, ErrorMessage } from "../../components/ui";

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function ChartWorkspaceBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <Boundary fallback={<section className="card space-y-3 p-5">
    <ErrorMessage message={t("odLoadError")} />
    <Button onClick={() => window.location.reload()}>{t("retry")}</Button>
  </section>}>{children}</Boundary>;
}
