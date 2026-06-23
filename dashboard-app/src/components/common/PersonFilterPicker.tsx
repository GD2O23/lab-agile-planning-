import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  wide?: boolean;
}

/** Multi-select person picker with chips and select-all/clear-all, ported from the legacy person-filter-picker UX. */
export function PersonFilterPicker({ label, options, selected, onChange, wide }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  const summary = selected.length ? `${selected.length} selected` : "All people";

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((v) => v !== name) : [...selected, name]);
  }

  return (
    <div>
      <label>{label}</label>
      <div className={`filter-picker person-filter-picker ${wide ? "person-filter-wide" : ""} ${open ? "open" : ""}`} ref={ref}>
        <button type="button" className="filter-picker-btn" onClick={() => setOpen((o) => !o)}>
          <span className={selected.length ? "filter-summary-value" : "filter-summary-muted"}>{summary}</span>
        </button>
        <div className="filter-menu">
          <div className="person-filter-actions">
            <button type="button" onClick={() => onChange(options)}>Select all</button>
            <button type="button" onClick={() => onChange([])}>Clear all</button>
          </div>
          {options.length ? (
            options.map((p) => (
              <label key={p} className="filter-option">
                <input type="checkbox" checked={selected.includes(p)} onChange={() => toggle(p)} />
                <span>{p}</span>
              </label>
            ))
          ) : (
            <div className="small-note">No people loaded yet.</div>
          )}
          <div className="person-selected-chips">
            {selected.length ? (
              selected.map((p) => (
                <span key={p} className="person-chip">
                  {p}
                  <button type="button" onClick={() => toggle(p)}>clear</button>
                </span>
              ))
            ) : (
              <div className="person-chip-empty">No people selected</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
