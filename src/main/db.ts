import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database | null = null;

/**
 * Where to put cache.db.
 *
 * - Dev (`npm run dev`): project root (right next to package.json).
 * - Installed build: the same folder as the .exe (NSIS installs to a
 *   user-writable location when perMachine=false).
 *
 * This keeps the database with the app instead of hiding it in %APPDATA%.
 * Trade-off: if you delete / move the install folder, the cache goes with it.
 */
function cacheDbPath(): string {
  const dir = app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
  return path.join(dir, "cache.db");
}

export function getDb(): Database.Database {
  if (db) return db;
  const file = cacheDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id           INTEGER PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,
  parent_id    INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  depth        INTEGER NOT NULL,
  image_count  INTEGER NOT NULL DEFAULT 0,
  cover_path   TEXT,
  mtime        INTEGER NOT NULL,
  last_scanned INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS folder_tags (
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source    TEXT NOT NULL,
  PRIMARY KEY (folder_id, tag_id, source)
);
CREATE INDEX IF NOT EXISTS idx_folder_tags_tag ON folder_tags(tag_id);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function upsertTag(name: string): number {
  const d = getDb();
  d.prepare("INSERT OR IGNORE INTO tags(name) VALUES (?)").run(name);
  const row = d.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number };
  return row.id;
}

export function getMeta(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}
