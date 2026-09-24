import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProcedureList } from "@clinic/shared";

type Procedure = ProcedureList["procedures"][number];
export function ProcedureAutocomplete({ value, search, onSearch, options, loading, onSelect }: {
  value?: Procedure; search: string; onSearch: (s: string) => void;
  options: Procedure[]; loading: boolean; onSelect: (p: Procedure) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  function choose(p: Procedure) { onSelect(p); setOpen(false); setActive(-1); }
  return <div className="relative">
    <input id="record-procedure" className="input" role="combobox" aria-autocomplete="list" autoComplete="off"
      aria-expanded={open} aria-controls="procedure-options" required maxLength={100}
      aria-activedescendant={open && !loading && options[active] ? `procedure-option-${options[active].id}` : undefined}
      value={open ? search : value ? `${value.code} · ${value.name}` : search} placeholder={t("odSelectProcedure")}
      onFocus={() => { setOpen(true); setActive(-1); }} onBlur={() => setOpen(false)}
      onChange={(e) => { onSearch(e.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); setOpen(true);
          if (!loading) setActive((n) => e.key === "ArrowDown" ? Math.min(n + 1, options.length - 1) : Math.max(0, n - 1));
        } else if (e.key === "Enter" && open) { e.preventDefault(); if (!loading && options[active]) choose(options[active]); }
      }} />
    {open && <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-line bg-surface shadow-lg">
      <ul id="procedure-options" role="listbox" aria-label={t("twProcedure")} className="max-h-52 overflow-auto">
        {!loading && options.map((p, index) => <li id={`procedure-option-${p.id}`} key={p.id} role="option" aria-selected={active === index}
          className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent-soft ${active === index ? "bg-accent-soft text-accent-ink" : ""}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>{p.code} · {p.name}</li>)}
      </ul>
      {(loading || !options.length) && <p role="status" className="p-3 text-xs text-muted">{t(loading ? "loading" : "odNoRecords")}</p>}
    </div>}
  </div>;
}
