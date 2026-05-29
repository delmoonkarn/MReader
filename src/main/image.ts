import { nativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Write a renderer-encoded JPEG buffer next to `srcPath` (same basename, .jpg)
 * and remove the original. Used when the renderer has already decoded a WebP/
 * other-format cover via the Canvas API.
 */
export async function writeJpegBuffer(
  srcPath: string,
  buffer: Uint8Array | ArrayBuffer
): Promise<string> {
  const dir = path.dirname(srcPath);
  const base = path.basename(srcPath, path.extname(srcPath));
  const dst = path.join(dir, base + ".jpg");

  // Don't clobber an existing JPEG with the same stem.
  try {
    await fs.access(dst);
    if (dst !== srcPath) {
      throw new Error(
        `Cannot convert ${path.basename(srcPath)} — ${path.basename(dst)} already exists. ` +
          `Remove one of them and rescan.`
      );
    }
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  // Clear read-only on destination (if same path as source) so we can overwrite.
  try {
    await fs.chmod(dst, 0o666);
  } catch {
    /* file may not exist yet, or chmod unsupported */
  }
  await fs.writeFile(dst, data);
  if (dst !== srcPath) {
    try {
      await fs.chmod(srcPath, 0o666);
    } catch {
      /* ignore */
    }
    try {
      await fs.unlink(srcPath);
    } catch {
      /* original may already be gone */
    }
  }
  return dst;
}

/**
 * Ensure the given image is a JPEG. If it already is, returns the same path.
 * Otherwise re-encodes via Electron's nativeImage (which uses Chromium's image
 * decoders, so PNG / WebP / BMP / GIF all work), writes <basename>.jpg next to
 * the original, and deletes the original.
 *
 * Refuses to overwrite an existing .jpg with the same basename so we never
 * destroy data silently.
 */
export async function ensureJpeg(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return filePath;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const dst = path.join(dir, base + ".jpg");

  // Don't clobber an existing JPEG with the same stem.
  try {
    await fs.access(dst);
    throw new Error(
      `Cannot convert ${path.basename(filePath)} — ${path.basename(dst)} already exists. ` +
        `Remove one of them and rescan.`
    );
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  const img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) {
    throw new Error(`Could not decode image: ${filePath}`);
  }
  const jpeg = img.toJPEG(92);
  await fs.writeFile(dst, jpeg);
  // Clear read-only on the source so unlink can remove it on Windows.
  try {
    await fs.chmod(filePath, 0o666);
  } catch {
    /* ignore */
  }
  await fs.unlink(filePath);
  return dst;
}
