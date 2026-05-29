import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, FolderRow, toLocalUrl } from "../api";
import { useStore, ReaderMode } from "../store";

const MODE_ORDER: ReaderMode[] = ["single", "double", "scroll"];
const MODE_LABEL: Record<ReaderMode, string> = {
  single: "Single page",
  double: "Two pages",
  scroll: "Vertical scroll",
};

export default function Reader() {
  const { id } = useParams();
  const folderId = Number(id);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const startPage = Math.max(0, Number(search.get("p") ?? 0));
  const { readerMode, setReaderMode } = useStore();

  const [folder, setFolder] = useState<FolderRow | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [idx, setIdx] = useState(startPage);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nearTop, setNearTop] = useState(true);

  useEffect(() => {
    api.get(folderId).then(setFolder);
    api.pages(folderId).then(setPages);
    setIdx(startPage);
  }, [folderId, startPage]);

  useEffect(() => {
    api.isFullscreen().then(setIsFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const next = await api.toggleFullscreen();
    setIsFullscreen(next);
    setNearTop(true);
  }, []);

  const next = useCallback(() => setIdx((i) => Math.min(i + 1, pages.length - 1)), [pages.length]);
  const prev = useCallback(() => setIdx((i) => Math.max(i - 1, 0)), []);
  const cycleMode = useCallback(() => {
    const i = MODE_ORDER.indexOf(readerMode);
    setReaderMode(MODE_ORDER[(i + 1) % MODE_ORDER.length]);
  }, [readerMode, setReaderMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape") {
        if (isFullscreen) toggleFullscreen();
        else nav(-1);
      } else if (e.key === "v" || e.key === "V") cycleMode();
      else if (readerMode === "single" || readerMode === "double") {
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") next();
        else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readerMode, next, prev, nav, cycleMode, toggleFullscreen, isFullscreen]);

  // Auto-hide header in fullscreen until mouse goes near the top edge — no delay either way.
  useEffect(() => {
    if (!isFullscreen) {
      setNearTop(true);
      return;
    }
    setNearTop(false);
    const onMove = (e: MouseEvent) => {
      setNearTop(e.clientY < 80);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [isFullscreen]);

  const sources = useMemo(() => pages.map(toLocalUrl), [pages]);

  useEffect(() => {
    if (readerMode === "scroll") return;
    [idx - 1, idx + 1, idx + 2, idx + 3].forEach((i) => {
      if (i >= 0 && i < sources.length) {
        const img = new Image();
        img.src = sources[i];
      }
    });
  }, [idx, sources, readerMode]);

  const showCounter = readerMode === "single" || readerMode === "double";
  const headerHidden = isFullscreen && !nearTop;
  // Header sits over the image in fullscreen so it doesn't shrink the page.
  const maxH = isFullscreen ? "max-h-screen" : "max-h-[calc(100vh-60px)]";

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col">
      <header
        className={
          (isFullscreen
            ? "fixed inset-x-0 top-0 z-20 transition-transform duration-200 "
            : "sticky top-0 z-10 ") +
          (headerHidden ? "-translate-y-full " : "translate-y-0 ") +
          "bg-neutral-950/90 backdrop-blur border-b border-neutral-900 px-4 py-2 flex gap-3 items-center text-sm"
        }
        onMouseEnter={() => isFullscreen && setNearTop(true)}
      >
        <button onClick={() => nav(-1)} className="text-indigo-400 hover:text-indigo-300">
          ← Back
        </button>
        <div className="truncate text-neutral-300" title={folder?.path}>
          {folder?.name}
        </div>
        <div className="flex-1" />
        <div className="flex rounded overflow-hidden ring-1 ring-neutral-800">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              onClick={() => setReaderMode(m)}
              className={
                "px-2 py-1 text-xs transition " +
                (readerMode === m
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
              }
              title={`${MODE_LABEL[m]} (V cycles)`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <button
          onClick={toggleFullscreen}
          className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs"
          title="Toggle fullscreen (F11)"
        >
          {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
        </button>
        {showCounter && pages.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-neutral-400 tabular-nums">
            <select
              value={idx}
              onChange={(e) => setIdx(Number(e.target.value))}
              className="px-1 py-0.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Jump to page"
            >
              {Array.from({ length: pages.length }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
            {readerMode === "double" && idx + 1 < pages.length && (
              <span>–{Math.min(idx + 2, pages.length)}</span>
            )}
            <span>/ {pages.length}</span>
          </div>
        )}
      </header>

      {readerMode === "single" && <SingleMode sources={sources} idx={idx} next={next} prev={prev} maxH={maxH} />}
      {readerMode === "double" && <DoubleMode sources={sources} idx={idx} next={next} prev={prev} maxH={maxH} />}
      {readerMode === "scroll" && <ScrollMode sources={sources} />}
    </div>
  );
}

function SingleMode({
  sources,
  idx,
  next,
  prev,
  maxH,
}: {
  sources: string[];
  idx: number;
  next: () => void;
  prev: () => void;
  maxH: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onClick = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width / 2) next();
    else prev();
  };
  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="flex-1 flex items-center justify-center overflow-hidden p-2 cursor-pointer"
    >
      {sources[idx] && (
        <img
          src={sources[idx]}
          alt=""
          className={`${maxH} max-w-full w-auto h-auto object-contain select-none`}
          draggable={false}
        />
      )}
    </div>
  );
}

function DoubleMode({
  sources,
  idx,
  next,
  prev,
  maxH,
}: {
  sources: string[];
  idx: number;
  next: () => void;
  prev: () => void;
  maxH: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onClick = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    if (e.clientX - rect.left > rect.width / 2) next();
    else prev();
  };
  const left = sources[idx];
  const right = sources[idx + 1];
  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="flex-1 flex items-center justify-center overflow-hidden p-2 cursor-pointer"
    >
      <div className={`flex items-end ${maxH} max-w-full`}>
        {left && (
          <img
            src={left}
            alt=""
            className={`${maxH} w-auto h-auto object-contain select-none block`}
            draggable={false}
          />
        )}
        {right && (
          <img
            src={right}
            alt=""
            className={`${maxH} w-auto h-auto object-contain select-none block`}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}

function ScrollMode({ sources }: { sources: string[] }) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl">
        {sources.map((s, i) => (
          <img key={i} src={s} loading="lazy" className="w-full h-auto block" alt="" />
        ))}
      </div>
    </div>
  );
}
