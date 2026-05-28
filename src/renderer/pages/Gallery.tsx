import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, FolderRow } from "../api";
import { useStore } from "../store";
import Card from "../components/Card";
import TagFilter from "../components/TagFilter";
import SortPicker from "../components/SortPicker";
import { useScrollRestore } from "../lib/useScrollRestore";

export default function Gallery() {
  const {
    root,
    setRoot,
    query,
    setQuery,
    activeTags,
    clearTags,
    sortBy,
    sortDir,
    minPages,
    setMinPages,
  } = useStore();
  const nav = useNavigate();
  const [rows, setRows] = useState<FolderRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ scannedDirs: number; currentPath: string } | null>(null);
  const [tagsVersion, setTagsVersion] = useState(0);

  // Restore scroll once rows are in the DOM so the page has its real height.
  useScrollRestore("/", rows.length > 0);

  const refresh = useCallback(async () => {
    const sort = { by: sortBy, dir: sortDir };
    if (query || activeTags.length > 0 || minPages > 0) {
      setRows(await api.search(query, activeTags, sort, minPages));
    } else {
      setRows(await api.children(null, sort, minPages));
    }
  }, [query, activeTags, sortBy, sortDir, minPages]);

  useEffect(() => {
    api.getRoot().then(setRoot);
    refresh();
    const offP = api.onScanProgress(setProgress);
    const offD = api.onScanDone(() => {
      setScanning(false);
      setProgress(null);
      refresh();
    });
    return () => {
      offP();
      offD();
    };
  }, [refresh, setRoot]);

  useEffect(() => {
    refresh();
  }, [query, activeTags, sortBy, sortDir, minPages, refresh]);

  const rollRandom = async () => {
    const r = await api.random(activeTags, minPages);
    if (!r) {
      alert("No folder matches the current filters.");
      return;
    }
    nav(`/folder/${r.id}`);
  };

  const pickAndScan = async () => {
    const picked = await api.pickRoot();
    if (!picked) return;
    setRoot(picked);
    setScanning(true);
    await api.scan(picked);
  };

  const rescan = async () => {
    if (!root) return;
    setScanning(true);
    await api.scan(root);
  };

  const resetDb = async () => {
    if (!confirm("Wipe the entire library cache (folders, tags, root path)? This cannot be undone.")) return;
    await api.reset();
    setRoot(null);
    setRows([]);
    clearTags();
    setQuery("");
    setTagsVersion((v) => v + 1);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-900 p-4 flex flex-col gap-3">
        <div className="flex gap-2 items-center">
          <button
            onClick={pickAndScan}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm"
          >
            Pick Root Folder
          </button>
          <button
            onClick={rescan}
            disabled={!root || scanning}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 rounded text-sm"
          >
            {scanning ? "Scanning…" : "Rescan"}
          </button>
          <button
            onClick={resetDb}
            disabled={scanning}
            className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 disabled:opacity-40 rounded text-sm"
            title="Wipe the entire library cache"
          >
            Reset DB
          </button>
          <button
            onClick={rollRandom}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-sm"
            title="Open a random folder (respects current tag filter and min pages)"
          >
            🎲 Random
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folder names…"
            className="flex-1 max-w-md px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <label className="flex items-center gap-1 text-xs text-neutral-400" title="Show only folders with at least this many direct images (not counting subfolders)">
            ≥
            <input
              type="number"
              min={0}
              value={minPages || ""}
              onChange={(e) => setMinPages(parseInt(e.target.value, 10) || 0)}
              placeholder="0"
              className="w-16 px-2 py-1 bg-neutral-900 border border-neutral-800 rounded text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            pages
          </label>
          <SortPicker />
          <div className="text-xs text-neutral-500 truncate flex-1" title={root ?? ""}>
            {root ?? "no root selected"}
          </div>
        </div>
        <TagFilter refreshKey={tagsVersion} />
        {progress && (
          <div className="text-xs text-neutral-400 truncate">
            scanned {progress.scannedDirs} dirs — {progress.currentPath}
          </div>
        )}
      </header>

      <main className="p-4">
        {rows.length === 0 ? (
          <div className="text-neutral-500 text-sm p-8 text-center">
            {root ? "No folders yet. Click Rescan." : "Pick a root folder to begin."}
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
          >
            {rows.map((r) => (
              <Card key={r.id} row={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
