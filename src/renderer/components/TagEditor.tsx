import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { convertCoverToJpeg } from "../lib/convertToJpeg";
import SearchableTagDropdown from "./SearchableTagDropdown";

type Props = {
  /** Initial tags loaded into the editor (comma-joined into the draft). */
  initial: string[];
  /** Absolute path to the cover image file whose XMP will be rewritten. */
  coverPath: string;
  /** Called after a successful save. The argument is the (possibly new) cover path,
   *  which may differ from `coverPath` if a PNG/WebP was auto-converted to JPEG. */
  onSaved: (newCoverPath: string) => void;
  /** Called when the user clicks Cancel or closes the editor. */
  onCancel: () => void;
};

export default function TagEditor({ initial, coverPath, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState(initial.join(", "));
  const [allTags, setAllTags] = useState<{ name: string; n: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.allTags().then(setAllTags);
  }, []);

  useEffect(() => {
    setDraft(initial.join(", "));
  }, [initial]);

  const sortedTags = useMemo(
    () =>
      [...allTags].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [allTags]
  );

  const usedLower = useMemo(
    () =>
      new Set(
        draft
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      ),
    [draft]
  );

  const append = (tag: string) => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.some((p) => p.toLowerCase() === tag.toLowerCase())) {
      parts.push(tag);
      setDraft(parts.join(", "));
    }
  };

  const save = async () => {
    const tags = draft.split(",").map((t) => t.trim()).filter(Boolean);
    setSaving(true);
    try {
      // Pre-convert via the renderer's Canvas so WebP and other Chromium-decodable
      // formats work — main's nativeImage falls flat on WebP.
      const jpegPath = await convertCoverToJpeg(coverPath);
      const result = await api.writeTags(jpegPath, tags);
      onSaved(result.finalPath);
    } catch (err: unknown) {
      alert(`Failed to save tags: ${(err as Error).message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2 items-center flex-wrap bg-neutral-950 border border-neutral-800 rounded p-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="comma, separated, tags"
        className="flex-1 min-w-[200px] px-2 py-1 bg-neutral-900 border border-neutral-800 rounded text-sm text-neutral-100"
      />
      <SearchableTagDropdown tags={sortedTags} excluded={usedLower} onPick={append} />
      <button
        onClick={save}
        disabled={saving}
        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded text-sm"
      >
        Cancel
      </button>
    </div>
  );
}
