import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SupplierOption, SupplierOptionList } from "@clinic/shared";
import { useWorkspace } from "../auth/WorkspaceProvider";
import { api } from "../../lib/api";

export function SupplierAutocomplete({ value, onChange, endpoint = "/api/supplies/suppliers", required = false }: { value: SupplierOption | null; onChange: (value: SupplierOption | null) => void; endpoint?: string; required?: boolean }) {
  const { t } = useTranslation(); const { roomId } = useWorkspace(); const [open, setOpen] = useState(false); const [search, setSearch] = useState(value?.name ?? ""); const [debounced, setDebounced] = useState("");
  useEffect(() => setSearch(value?.name ?? ""), [value]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 200); return () => clearTimeout(timer); }, [search]);
  const query = useQuery({ queryKey: ["supplier-options", endpoint, roomId, debounced], enabled: open, queryFn: ({ signal }) => api<SupplierOptionList>(`${endpoint}?${new URLSearchParams({ q: debounced })}`, { signal }) });
  return <div className="relative"><input id="supplier" className="input pr-16" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="supplier-options" aria-required={required} required={required} autoComplete="off" maxLength={100} value={search} placeholder={t("supplySupplierPlaceholder")} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { setSearch(event.target.value); onChange(null); setOpen(true); }}/><div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">{value && <button type="button" className="rounded p-1 text-muted hover:bg-soft" aria-label={t("supplyClearSupplier")} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(null); setSearch(""); }}><X size={15}/></button>}<ChevronsUpDown size={17} className="pointer-events-none text-muted"/></div>{open && <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"><ul id="supplier-options" role="listbox" className="max-h-52 overflow-auto">{(query.data?.suppliers ?? []).map((supplier) => <li key={supplier.id} role="option" aria-selected={supplier.id === value?.id} className="cursor-pointer px-3 py-2 text-sm hover:bg-accent-soft" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(supplier); setSearch(supplier.name); setOpen(false); }}>{supplier.name}</li>)}</ul>{query.isPending && <p className="p-3 text-xs text-muted">{t("loading")}</p>}{!query.isPending && !(query.data?.suppliers.length) && <p className="p-3 text-xs text-muted">{t("supplyNoSuppliers")}</p>}</div>}</div>;
}
