import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SettingsCard({
  title,
  children,
  className = "mt-6",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  return (
    <section className={`card ${className}`} aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 rounded-xl p-8 text-left text-lg font-semibold hover:bg-soft"
          aria-expanded={expanded}
          aria-controls={`${id}-content`}
          onClick={() => setExpanded((value) => !value)}
        >
          {title}
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        </button>
      </h3>
      <div id={`${id}-content`} hidden={!expanded} className="px-8 pb-8">
        {children}
      </div>
    </section>
  );
}
