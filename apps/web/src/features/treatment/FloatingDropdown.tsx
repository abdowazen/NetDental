import { useId, useRef, useState, type ReactNode } from "react";

export function FloatingDropdown({ label, children, trigger, closeOnAction = false, className = "" }: {
  label: string; children: ReactNode; trigger: ReactNode; closeOnAction?: boolean; className?: string;
}) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} aria-label={label} aria-expanded={open} aria-controls={id}
      onClick={(e) => {
        const panel = popup.current!;
        if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 248)) + "px";
        panel.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280)) + "px";
        panel.showPopover();
      }}>{trigger}</button>
    <div id={id} ref={popup} popover="auto" aria-label={label}
      onToggle={(e) => setOpen(e.newState === "open")}
      className="fixed m-0 max-h-64 w-60 overflow-auto rounded-lg border border-line bg-surface p-3 text-sm text-ink shadow-xl"
      onClick={(e) => { if (closeOnAction && (e.target as HTMLElement).closest("button")) popup.current?.hidePopover(); }}>
      {children}
    </div>
  </>;
}
