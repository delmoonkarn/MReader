import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import { getDb, getMeta, setMeta } from "./db";
import { scanLibrary, listImages } from "./scanner";
import { writeXmpTags } from "./xmp";
import { ensureJpeg, writeJpegBuffer } from "./image";

export type FolderRow = {
  id: number;
  path: string;
  parent_id: number | null;
  name: string;
  depth: number;
  image_count: number;
  child_count: number;
  cover_path: string | null;
  tags: string[];
};

const SELECT_COLS = `
  f.id, f.path, f.parent_id, f.name, f.depth, f.image_count, f.cover_path,
  (SELECT COUNT(*) FROM folders c WHERE c.parent_id = f.id) AS child_count
`;

type Sort = { by?: "name" | "mtime" | "image_count"; dir?: "asc" | "desc" };

function orderBy(s: Sort | undefined): string {
  const dir = s?.dir === "desc" ? "DESC" : "ASC";
  switch (s?.by) {
    case "mtime":
      return `ORDER BY f.mtime ${dir}, f.name COLLATE NOCASE ASC`;
    case "image_count":
      return `ORDER BY f.image_count ${dir}, f.name COLLATE NOCASE ASC`;
    case "name":
    default:
      return `ORDER BY f.name COLLATE NOCASE ${dir}`;
  }
}

export function registerIpc(): void {
  ipcMain.handle("dialog:pick-root", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (r.canceled || r.filePaths.length === 0) return null;
    setMeta("root_path", r.filePaths[0]);
    return r.filePaths[0];
  });

  ipcMain.handle("library:get-root", () => getMeta("root_path"));

  ipcMain.handle("library:reset", () => {
    const db = getDb();
    db.transaction(() => {
      db.exec("DELETE FROM folder_tags");
      db.exec("DELETE FROM folders");
      db.exec("DELETE FROM tags");
      db.exec("DELETE FROM meta");
    })();
    db.exec("VACUUM");
    return true;
  });

  ipcMain.handle("library:scan", async (e, root: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return scanLibrary(root, win);
  });

  ipcMain.handle(
    "library:children",
    (_e, parentId: number | null, sort?: Sort, minPages?: number) => {
      const db = getDb();
      if (parentId === null) {
        const rootId = (db
          .prepare(
            `SELECT id FROM folders WHERE path = (SELECT value FROM meta WHERE key = 'root_path')`
          )
          .get() as { id: number } | undefined)?.id;
        if (rootId === undefined) return [];
        parentId = rootId;
      }
      const params: unknown[] = [parentId];
      let where = "f.parent_id = ?";
      if (typeof minPages === "number" && minPages > 0) {
        where += " AND f.image_count >= ?";
        params.push(minPages);
      }
      const sql = `
        SELECT ${SELECT_COLS}
        FROM folders f
        WHERE ${where}
        ${orderBy(sort)}
      `;
      const rows = db.prepare(sql).all(...params) as FolderRow[];
      const tagStmt = db.prepare(
        `SELECT DISTINCT t.name FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
         WHERE ft.folder_id = ? ORDER BY t.name`
      );
      for (const row of rows) {
        row.tags = (tagStmt.all(row.id) as { name: string }[]).map((r) => r.name);
      }
      return rows;
    }
  );

  ipcMain.handle("library:ancestors", (_e, id: number) => {
    const db = getDb();
    // Walk from the given folder up to the root, then return depth>=1 entries in root→leaf order.
    const rows = db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, name, depth) AS (
           SELECT id, parent_id, name, depth FROM folders WHERE id = ?
           UNION ALL
           SELECT f.id, f.parent_id, f.name, f.depth
           FROM folders f JOIN chain c ON f.id = c.parent_id
         )
         SELECT id, name, depth FROM chain WHERE depth >= 1 ORDER BY depth ASC`
      )
      .all(id) as { id: number; name: string; depth: number }[];
    return rows;
  });

  ipcMain.handle("library:get", (_e, id: number) => {
    const db = getDb();
    const row = db
      .prepare(`SELECT ${SELECT_COLS} FROM folders f WHERE f.id = ?`)
      .get(id) as FolderRow | undefined;
    if (!row) return null;
    row.tags = (
      db
        .prepare(
          `SELECT DISTINCT t.name FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
           WHERE ft.folder_id = ? ORDER BY t.name`
        )
        .all(id) as { name: string }[]
    ).map((r) => r.name);
    return row;
  });

  ipcMain.handle("library:pages", async (_e, id: number) => {
    const db = getDb();
    const row = db.prepare("SELECT path FROM folders WHERE id = ?").get(id) as { path: string } | undefined;
    if (!row) return [];
    return listImages(row.path);
  });

  ipcMain.handle(
    "library:search",
    (_e, args: { query: string; tags: string[]; sort?: Sort; minPages?: number }) => {
      const db = getDb();
      const q = `%${args.query.toLowerCase()}%`;
      const params: unknown[] = [];
      let sql = `
        SELECT DISTINCT ${SELECT_COLS}
        FROM folders f
      `;
      if (args.tags.length > 0) {
        sql += ` JOIN folder_tags ft ON ft.folder_id = f.id
                 JOIN tags t ON t.id = ft.tag_id AND t.name IN (${args.tags.map(() => "?").join(",")})`;
        params.push(...args.tags);
      }
      const where: string[] = [];
      if (args.query) {
        where.push("LOWER(f.name) LIKE ?");
        params.push(q);
      }
      if (typeof args.minPages === "number" && args.minPages > 0) {
        where.push("f.image_count >= ?");
        params.push(args.minPages);
      }
      if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
      if (args.tags.length > 0) {
        sql += ` GROUP BY f.id HAVING COUNT(DISTINCT t.id) = ${args.tags.length}`;
      }
      sql += ` ${orderBy(args.sort)} LIMIT 500`;
      const rows = db.prepare(sql).all(...params) as FolderRow[];
      const tagStmt = db.prepare(
        `SELECT DISTINCT t.name FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
         WHERE ft.folder_id = ? ORDER BY t.name`
      );
      for (const r of rows) r.tags = (tagStmt.all(r.id) as { name: string }[]).map((t) => t.name);
      return rows;
    }
  );

  ipcMain.handle("library:all-tags", (_e, withTags?: string[]) => {
    const db = getDb();
    // No filter — return every tag with its global usage count.
    if (!withTags || withTags.length === 0) {
      return db
        .prepare(
          `SELECT t.name, COUNT(DISTINCT ft.folder_id) as n
           FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
           GROUP BY t.id ORDER BY n DESC, t.name`
        )
        .all() as { name: string; n: number }[];
    }
    // Narrow to tags that co-occur with all of `withTags` on the same folder.
    const placeholders = withTags.map(() => "?").join(",");
    const sql = `
      SELECT t.name, COUNT(DISTINCT ft.folder_id) as n
      FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
      WHERE ft.folder_id IN (
        SELECT ft2.folder_id
        FROM folder_tags ft2
        JOIN tags t2 ON t2.id = ft2.tag_id AND t2.name IN (${placeholders})
        GROUP BY ft2.folder_id
        HAVING COUNT(DISTINCT t2.id) = ?
      )
      GROUP BY t.id
      ORDER BY n DESC, t.name
    `;
    return db
      .prepare(sql)
      .all(...withTags, withTags.length) as { name: string; n: number }[];
  });

  ipcMain.handle(
    "library:random",
    (_e, args: { tags: string[]; query?: string; minPages?: number }) => {
      const db = getDb();
      const params: unknown[] = [];
      let sql = `
        SELECT DISTINCT ${SELECT_COLS}
        FROM folders f
      `;
      if (args.tags.length > 0) {
        sql += ` JOIN folder_tags ft ON ft.folder_id = f.id
                 JOIN tags t ON t.id = ft.tag_id AND t.name IN (${args.tags.map(() => "?").join(",")})`;
        params.push(...args.tags);
      }
      const where: string[] = ["f.image_count > 0"];
      if (typeof args.minPages === "number" && args.minPages > 0) {
        where.push("f.image_count >= ?");
        params.push(args.minPages);
      }
      if (args.query && args.query.trim()) {
        where.push("LOWER(f.name) LIKE ?");
        params.push(`%${args.query.toLowerCase().trim()}%`);
      }
      sql += ` WHERE ${where.join(" AND ")}`;
      if (args.tags.length > 0) {
        sql += ` GROUP BY f.id HAVING COUNT(DISTINCT t.id) = ${args.tags.length}`;
      }
      sql += ` ORDER BY RANDOM() LIMIT 1`;
      const row = db.prepare(sql).get(...params) as FolderRow | undefined;
      if (!row) return null;
      row.tags = (
        db
          .prepare(
            `SELECT DISTINCT t.name FROM tags t JOIN folder_tags ft ON ft.tag_id = t.id
             WHERE ft.folder_id = ? ORDER BY t.name`
          )
          .all(row.id) as { name: string }[]
      ).map((r) => r.name);
      return row;
    }
  );

  ipcMain.handle("shell:open-path", async (_e, p: string) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });

  ipcMain.handle("window:toggle-fullscreen", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle("window:is-fullscreen", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle(
    "image:save-jpeg",
    async (_e, args: { srcPath: string; jpegBuffer: ArrayBuffer }) => {
      const newPath = await writeJpegBuffer(args.srcPath, args.jpegBuffer);
      // Repoint any folder whose cover was the source path.
      const db = getDb();
      if (newPath !== args.srcPath) {
        db.prepare("UPDATE folders SET cover_path = ? WHERE cover_path = ?").run(
          newPath,
          args.srcPath
        );
      }
      return newPath;
    }
  );

  ipcMain.handle("xmp:write", async (_e, args: { filePath: string; tags: string[] }) => {
    // Auto-convert PNG/WebP covers to JPEG so XMP can be written.
    const finalPath = await ensureJpeg(args.filePath);
    await writeXmpTags(finalPath, args.tags);

    const db = getDb();
    // If we converted, repoint any folder whose cover was the old PNG/WebP.
    if (finalPath !== args.filePath) {
      db.prepare("UPDATE folders SET cover_path = ? WHERE cover_path = ?").run(finalPath, args.filePath);
    }
    // Refresh DB tags for the folder whose cover is this image.
    const row = db.prepare("SELECT id FROM folders WHERE cover_path = ?").get(finalPath) as
      | { id: number }
      | undefined;
    if (row) {
      // Use the same 'xmp' source the scanner uses — the tags ARE in the file's
      // XMP packet now, so there's no real distinction. Avoids two rows per tag
      // (one 'user', one 'xmp') after the next rescan.
      db.prepare("DELETE FROM folder_tags WHERE folder_id = ? AND source IN ('xmp','user')").run(row.id);
      const ins = db.prepare(
        "INSERT OR IGNORE INTO folder_tags(folder_id, tag_id, source) VALUES (?, ?, 'xmp')"
      );
      const tx = db.transaction(() => {
        for (const t of args.tags) {
          db.prepare("INSERT OR IGNORE INTO tags(name) VALUES (?)").run(t);
          const tid = (db.prepare("SELECT id FROM tags WHERE name = ?").get(t) as { id: number }).id;
          ins.run(row.id, tid);
        }
      });
      tx();
    }
    return { converted: finalPath !== args.filePath, finalPath };
  });
}
