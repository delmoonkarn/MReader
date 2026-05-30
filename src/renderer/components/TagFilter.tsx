import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

const DEFAULT_LIMIT = 40;

export default function TagFilter({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tags, setTags] = useState<{ name: string; n: number }[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const { activeTags, toggleTag, clearTags } = useStore();

  // Narrow the available tag list to tags that co-occur with the active selection.
  // (When nothing is active, this returns every tag in the library.)
  useEffect(() => {
    api.allTags(activeTags).then(setTags);
  }, [refreshKey, activeTags]);

  const visible = useMemo(() => {
    const q = tagQuery.toLowerCase().trim();
    const activeSet = new Set(activeTags);
    const seen = new Set<string>();
    const out: typeof tags = [];

    // Always pin active tags to the front so they're visible while searching.
    for (const t of tags) {
      if (activeSet.has(t.name) && !seen.has(t.name)) {
        out.push(t);
        seen.add(t.name);
      }
    }

    const pool = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags.slice(0, DEFAULT_LIMIT);
    for (const t of pool) {
      if (!seen.has(t.name)) {
        out.push(t);
        seen.add(t.name);
      }
    }
    return out;
  }, [tags, tagQuery, activeTags]);

  if (tags.length === 0) return null;

  const q = tagQuery.trim();
  const matchCount = q
    ? tags.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).length
    : 0;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <div className="relative">
        <input
          type="text"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="filter tags…"
          className="text-[11px] px-2 py-1 pr-6 bg-neutral-900 border border-neutral-800 rounded w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-neutral-100"
        />
        {q && (
          <button
            onClick={() => setTagQuery("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200 text-xs"
            title="Clear tag search"
          >
            ✕
          </button>
        )}
      </div>

      {activeTags.length > 0 && (
        <button
          onClick={clearTags}
          className="text-[11px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-200"
        >
          clear ({activeTags.length})
        </button>
      )}

      {visible.map((t) => {
        const on = activeTags.includes(t.name);
        return (
          <button
            key={t.name}
            onClick={() => toggleTag(t.name)}
            className={
              "text-[11px] px-2 py-1 rounded transition " +
              (on ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700")
            }
          >
            {t.name} <span className="opacity-60">{t.n}</span>
          </button>
        );
      })}

      {q && matchCount === 0 && (
        <span className="text-[11px] text-neutral-500 px-1">no tags match</span>
      )}
      {!q && tags.length > DEFAULT_LIMIT && (
        <span className="text-[10px] text-neutral-500 px-1" title="Type in the filter box to find more">
          +{tags.length - DEFAULT_LIMIT} more
        </span>
      )}
    </div>
  );
}
