// Remember which folder card the user clicked from each gallery / folder view,
// so we can scroll it into view (and briefly highlight it) when they navigate back.
//
// Keyed by the source route (e.g. "/" or "/folder/42"); value is the folder id
// they opened from there.

const LS_PREFIX = "mr.lastvisited:";
const map = new Map<string, number>();

declare global {
  interface Window {
    __scrollDebug?: boolean;
  }
}
function log(...args: unknown[]): void {
  if (typeof window !== "undefined" && window.__scrollDebug) {
    console.log("[lastVisited]", ...args);
  }
}

export function setLastVisited(sourceRoute: string, folderId: number): void {
  map.set(sourceRoute, folderId);
  try {
    sessionStorage.setItem(LS_PREFIX + sourceRoute, String(folderId));
  } catch {
    /* ignore */
  }
  log("set", sourceRoute, "->", folderId);
}

export function getLastVisited(sourceRoute: string): number | undefined {
  if (map.has(sourceRoute)) return map.get(sourceRoute);
  try {
    const raw = sessionStorage.getItem(LS_PREFIX + sourceRoute);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      if (!isNaN(n)) {
        map.set(sourceRoute, n);
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function clearLastVisited(sourceRoute: string): void {
  map.delete(sourceRoute);
  try {
    sessionStorage.removeItem(LS_PREFIX + sourceRoute);
  } catch {
    /* ignore */
  }
  log("clear", sourceRoute);
}

/**
 * Scroll the card with the given data-folder-id attribute into view and apply
 * a brief highlight. Retries for ~2 s in case the element is still mounting.
 *
 * Re-applies the scroll several times because something else (router, image
 * decode causing layout shift) may scroll us back to top right after we
 * scrolled to the card.
 */
export function focusFolderCard(folderId: number): void {
  log("focus request", folderId);
  let tries = 0;
  const maxTries = 120; // ~2 s at 60 fps
  let foundAt = -1;

  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-folder-id="${folderId}"]`);
    if (el) {
      if (foundAt === -1) {
        foundAt = tries;
        log("focus found", folderId, "at attempt", tries);
        // Apply highlight class (re-trigger animation if already present).
        el.classList.remove("mr-card-highlight");
        void el.offsetWidth;
        el.classList.add("mr-card-highlight");
      }
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    }
    tries++;
    // Keep re-applying for ~10 frames after first success to defeat any other
    // scroll-to-top happening on the same tick.
    if (tries < maxTries && (foundAt === -1 || tries - foundAt < 12)) {
      requestAnimationFrame(tick);
    } else if (foundAt === -1) {
      log("focus FAILED", folderId, "no element after", tries, "attempts");
    } else {
      log("focus done", folderId);
    }
  };
  requestAnimationFrame(tick);
}
