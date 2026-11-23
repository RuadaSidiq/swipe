"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./ui";

export interface MultiOption { value: string; label: string; icon?: React.ReactNode; group?: string }

/** Dropdown with checkboxes. Nothing selected means "All". */
export function MultiSelect({ label, allLabel, options, value, onChange, renderSummary }: {
  label: string; allLabel: string; options: MultiOption[]; value: string[]; onChange: (v: string[]) => void;
  renderSummary?: (selected: MultiOption[]) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  let lastGroup: string | undefined;
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox" aria-label={label}
        className={cx("flex h-10 w-full items-center gap-1 rounded-[12px] pl-3 pr-2 text-left text-[13px] font-semibold transition", selected.length ? "text-[var(--accent)]" : "")}
        style={{ background: selected.length ? "var(--accent-soft)" : "var(--soft)", boxShadow: "var(--clay-inset)" }}>
        <span className="shrink-0 whitespace-nowrap">{label}</span>
        {selected.length > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold text-white" style={{ background: "var(--accent)" }} aria-label={`${selected.length} selected`}>{selected.length}</span>}
        <span className="flex-1" /><ChevronDown size={14} className={cx("shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="clay pop absolute left-0 top-full z-30 mt-1.5 max-h-80 w-max min-w-[210px] overflow-y-auto rounded-2xl p-1.5" role="listbox" aria-multiselectable="true">
          <button type="button" onClick={() => onChange([])} className="tab-link w-full justify-between text-left" data-active={selected.length === 0}>
            <span>{allLabel}</span>{selected.length === 0 && <Check size={14} />}
          </button>
          {options.map((o) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null; lastGroup = o.group;
            const on = value.includes(o.value);
            return (
              <div key={o.value}>
                {heading && <div className="muted px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider">{heading}</div>}
                <button type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)} className="tab-link w-full">
                  <span className={cx("grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition", on ? "border-transparent text-white" : "")} style={on ? { background: "var(--accent)" } : { borderColor: "var(--line-strong)" }}>{on && <Check size={11} strokeWidth={3} />}</span>
                  {o.icon}<span className="flex-1 truncate text-left">{o.label}</span>
                </button>
              </div>
            );
          })}
          {selected.length > 0 && <button type="button" onClick={() => setOpen(false)} className="btn-primary mt-1.5 w-full py-2 text-[13px]">Show results</button>}
        </div>
      )}
    </div>
  );
}
