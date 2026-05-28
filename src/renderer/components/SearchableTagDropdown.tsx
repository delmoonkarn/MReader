import { useEffect, useRef, useState } from "react";

type Tag = { name: string; n: number };

type Props = {
  tags: Tag[];
  excluded: Set<string>; // lowercased names already in the draft, hidden from the list
  onPick: (name: string) => void;
  label?: string;
};

export default function SearchableTagDropdown({ tags, excluded, onPick, label }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(0);

  // Close on outside click / Esc, focus the search input when opened.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    inputRef.current?.focus();
    inputRef.current?.select();
    setHover(0);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = filter.toLowerCase().trim();
  const visible = tags
    .filter((t) => !excluded.has(t.name.toLowerCase()))
    .filter((t) => !q || t.name.toLowerCase().includes(q));

  const totalAvailable = tags.filter((t) => !excluded.has(t.name.toLowerCase())).length;

  const pick = (name: string) => {
    onPick(name);
    setFilter("");
    // Keep dropdown open so the user can pick multiple tags in a row.
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover((h) => Math.min(visible.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[hover]) pick(visible[hover].name);
    }
  };

  // Scroll the highlighted item into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[hover] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [hover, open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded text-sm text-neutral-200"
      >
        {label ?? `+ Pick existing (${totalAvailable})`}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 left-0 w-72 max-h-80 flex flex-col bg-neutral-950 border border-neutral-800 rounded shadow-xl"
          onKeyDown={onKeyDown}
        >
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setHover(0);
            }}
            placeholder="Search tags…"
            className="px-2 py-1.5 bg-neutral-900 border-b border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded-t"
          />
          <div ref={listRef} className="overflow-y-auto flex-1">
            {visible.length === 0 ? (
              <div className="px-2 py-2 text-xs text-neutral-500">No matching tags</div>
            ) : (
              visible.map((t, i) => (
                <button
                  type="button"
                  key={t.name}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => pick(t.name)}
                  className={
                    "w-full text-left px-2 py-1.5 text-sm flex justify-between items-center " +
                    (i === hover
                      ? "bg-indigo-600 text-white"
                      : "text-neutral-200 hover:bg-neutral-800")
                  }
                >
                  <span className="truncate">{t.name}</span>
                  <span className={"text-xs " + (i === hover ? "opacity-80" : "text-neutral-500")}>
                    {t.n}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="px-2 py-1 text-[10px] text-neutral-600 border-t border-neutral-800">
            ↑/↓ navigate · Enter to add · Esc to close
          </div>
        </div>
      )}
    </div>
  );
}
