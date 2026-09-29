import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function FloatingDropdown({ label, children, trigger, closeOnAction = false, className = "" }: {
  label: string; children: ReactNode; trigger: ReactNode; closeOnAction?: boolean; className?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  function position() {
    const triggerRect = button.current?.getBoundingClientRect();
    const panel = popup.current;
    if (!triggerRect || !panel) return;
    panel.style.left = Math.max(8, Math.min(triggerRect.right + 6, window.innerWidth - 248)) + "px";
    panel.style.top = Math.max(8, triggerRect.top) + "px";
    panel.style.maxHeight = Math.max(80, window.innerHeight - Math.max(8, triggerRect.top) - 8) + "px";
  }
  useEffect(() => {
    if (!open) return;
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open]);
  return <>
    <button ref={button} type="button" className={className} aria-label={label} aria-expanded={open} aria-controls={id}
      onClick={() => {
        const panel = popup.current!;
        if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
        panel.showPopover();
        position();
      }}>{trigger}</button>
    <div id={id} ref={popup} popover="auto" aria-label={label}
      onToggle={(e) => setOpen(e.newState === "open")}
      className="fixed m-0 max-h-64 w-60 overflow-auto rounded-lg border border-line bg-surface p-3 text-sm text-ink shadow-xl"
      onClick={(e) => { if (closeOnAction && (e.target as HTMLElement).closest("button")) popup.current?.hidePopover(); }}>
      {children}
    </div>
  </>;
}
