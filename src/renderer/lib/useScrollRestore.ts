import { useEffect } from "react";

// Toggle in DevTools console: window.__scrollDebug = true
declare global {
  interface Window {
    __scrollDebug?: boolean;
  }
}

function log(...args: unknown[]): void {
  if (typeof window !== "undefined" && window.__scrollDebug) {
    console.log("[scroll]", ...args);
  }
}

const KEY_PREFIX = "mr.scroll:";
const positions = new Map<string, number>();
let currentKey: string | null = null;
let installed = false;

function getScroll(): number {
  return (
    window.scrollY ||
    document.scrollingElement?.scrollTop ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function setScroll(y: number): void {
  // Try multiple roots — different Electron / Chromium contexts attach the scrollbar differently.
  window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  if (document.scrollingElement) document.scrollingElement.scrollTop = y;
  document.documentElement.scrollTop = y;
  document.body.scrollTop = y;
}

function readSaved(key: string): number | undefined {
  if (positions.has(key)) return positions.get(key);
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      if (!isNaN(n)) {
        positions.set(key, n);
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeSaved(key: string, y: number): void {
  positions.set(key, y);
  try {
    sessionStorage.setItem(KEY_PREFIX + key, String(y));
  } catch {
    /* ignore */
  }
}

function install(): void {
  if (installed) return;
  installed = true;

  // Global scroll listener — saves position for whichever route is currently active.
  window.addEventListener(
    "scroll",
    () => {
      if (currentKey !== null) {
        const y = getScroll();
        writeSaved(currentKey, y);
      }
    },
    { passive: true }
  );

  // Save before navigating away (covers full reload too).
  window.addEventListener("beforeunload", () => {
    if (currentKey !== null) writeSaved(currentKey, getScroll());
  });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
}

/**
 * On mount, set this route as the "current" route. Whenever the user scrolls,
 * the global listener saves the position keyed by `key`. On mount we also try
 * to restore the previously-saved position — retrying for ~1s in case content
 * is still loading and the page hasn't reached its final height.
 *
 * Pass `ready` to gate the restore: usually `rows.length > 0` (page has data).
 */
export function useScrollRestore(key: string, ready = true): void {
  useEffect(() => {
    install();
    const prev = currentKey;
    currentKey = key;
    log("activate", key, "saved=", readSaved(key));

    return () => {
      // Save one last time before becoming inactive.
      const y = getScroll();
      writeSaved(key, y);
      log("deactivate", key, "y=", y);
      currentKey = prev;
    };
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const saved = readSaved(key);
    log("restore?", key, "ready=", ready, "saved=", saved);
    const target = saved ?? 0;

    // Retry up to ~1s. Each attempt re-applies the scroll; stop early when the page
    // accepts the value (within a few px tolerance).
    let attempts = 0;
    const maxAttempts = 60;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      setScroll(target);
      attempts++;
      const actual = getScroll();
      if (attempts < maxAttempts && Math.abs(actual - target) > 4) {
        requestAnimationFrame(tick);
      } else {
        log("restored", key, "target=", target, "actual=", actual, "attempts=", attempts);
      }
    };
    requestAnimationFrame(tick);

    return () => {
      cancelled = true;
    };
  }, [key, ready]);
}
