import { useNavigate } from "react-router-dom";
import { FolderRow, toLocalUrl } from "../api";

export default function Card({ row }: { row: FolderRow }) {
  const nav = useNavigate();
  // Always show the overview/gallery first; the Reader is opened from there.
  const goto = () => nav(`/folder/${row.id}`);
  const mixed = row.image_count > 0 && row.child_count > 0;

  return (
    <button onClick={goto} className="group text-left w-full block">
      <div className="aspect-[2/3] bg-neutral-800 overflow-hidden rounded-md ring-1 ring-neutral-800 group-hover:ring-indigo-500 transition">
        {row.cover_path ? (
          <img
            src={toLocalUrl(row.cover_path)}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">no cover</div>
        )}
      </div>
      <div className="mt-2 text-sm text-neutral-100 truncate flex items-center gap-1.5" title={row.name}>
        <span className="truncate">{row.name}</span>
        {mixed && (
          <span
            className="shrink-0 text-[10px] px-1 py-px bg-amber-700/50 text-amber-200 rounded"
            title={`${row.image_count} images here + ${row.child_count} subfolders`}
          >
            ↳{row.child_count}
          </span>
        )}
      </div>
      {row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {row.tags.slice(0, 5).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded">
              {t}
            </span>
          ))}
          {row.tags.length > 5 && (
            <span className="text-[10px] px-1.5 py-0.5 text-neutral-500">+{row.tags.length - 5}</span>
          )}
        </div>
      )}
    </button>
  );
}
