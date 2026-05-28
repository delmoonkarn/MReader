# Manga Reader

A local-first desktop application for reading folders of images as manga / comics. It looks and feels like a modern online manga reader, but every file stays on your disk — no servers, no uploads.

## What it does

- **Recursive library scan.** Pick any root folder; every subdirectory containing images becomes a browsable chapter. Folder hierarchies of arbitrary depth are supported, with breadcrumb navigation.
- **Cover bubble-up.** Each folder shows the first naturally-sorted image as its cover. Parent folders that contain no direct images inherit the cover of their first child, recursively.
- **XMP tag integration.** Reads the Windows "Tags" field (XMP `dc:subject`) embedded in JPEG covers, exposes those tags as filter chips, and writes back to the same field on save. Tag editing lives in the folder view — type freely, or pick from a searchable dropdown of existing tags. Non-JPEG covers (PNG, WebP, GIF, BMP, AVIF) are automatically re-encoded to JPEG before the first tag write.
- **Search and filter.** Full-text search on folder names, multi-tag include filter with searchable dropdown, minimum-pages filter (counts direct images only, ignoring subfolder contents), and a random-folder picker that respects the active filters.
- **Sortable.** Sort by name, last-modified date, or page count, ascending or descending. Preference persists across launches.
- **Reader.** Three modes — single page, two-page spread (flush, no gutter), and vertical scroll. Keyboard shortcuts (`A`/`D` or `←`/`→` to flip, `V` to cycle modes, `F11` to toggle fullscreen, `Esc` to exit). Jump-to-page dropdown. In fullscreen, the chrome auto-hides and reappears when the mouse approaches the top of the window.
- **Per-route scroll restoration.** Navigating back to the gallery returns you to the same scroll position you left from.
- **Persistent cache.** A SQLite database stores folder paths, covers, tags, and metadata so that subsequent launches are instant. A manual rescan picks up filesystem changes; the Reset DB action wipes the cache.

## Tech stack

| Layer | Choice |
| --- | --- |
| Desktop shell | Electron 32 (system webview, contextIsolation enabled, sandboxed renderer) |
| UI | React 18 · TypeScript 5 · Vite 5 · Tailwind CSS 3 |
| State / routing | Zustand · React Router 6 (HashRouter) |
| Local cache | SQLite via `better-sqlite3` (WAL mode) |
| Image serving | Custom privileged `local://` protocol; no HTTP server, no relaxed CSP |
| Metadata I/O | Hand-rolled JPEG APP1 / XMP packet parser and writer (no native dependencies) |
| Format conversion | Chromium decoder + `<canvas>` re-encode (PNG / WebP / GIF / BMP / AVIF → JPEG) |
| Packaging | `vite-plugin-electron` for dev / HMR; `electron-builder` (NSIS) available via `npm run build` |

## Requirements

- Node.js 20+
- Windows 10 / 11 has been the primary target. The dev build also runs on macOS and Linux.

## Quick start

```bash
npm install
npm run dev      # development build with HMR
```

Or double-click `run.bat`.

## Project layout

```
src/
├── main/         Electron main process: SQLite, recursive scanner, XMP read/write, IPC handlers, local:// protocol
└── renderer/     React UI: gallery, folder view, reader, shared components and hooks
```

## Data locations

Everything lives next to the app — nothing is written to `%APPDATA%`.

- `cache.db` — library cache (folders, covers, tags, mtimes). Next to `package.json` in development, next to the `.exe` in an installed build.
- `userdata/` — Electron's own runtime data (Chromium HTTP cache, cookies, localStorage / sessionStorage, IndexedDB, GPU cache, logs). Same folder.
- Tags are also embedded in the cover JPEG's XMP packet, so the source of truth lives with your files. If you delete `cache.db`, your tags survive in the JPEGs.
