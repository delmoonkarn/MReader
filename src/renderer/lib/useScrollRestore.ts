import { useEffect, useLayoutEffect } from "react";

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
let restoring = false; // pause "save" while we're actively scrolling programmatically

/**
 * Identify whatever element is actually scrolling on this page. Returns the first
 * candidate whose scrollHeight strictly exceeds clientHeight — i.e. has somewhere
 * to scroll to. Falls back to documentElement.
 */
function findScrollContainer(): Element {
  // Most common case: the document itself is scrolling.
  const docCandidates: Element[] = [];
  if (document.scrollingElement) docCandidates.push(document.scrollingElement);
  docCandidates.push(document.documentElement);
  docCandidates.push(document.body);

  for (const el of docCandidates) {
    if (el && el.scrollHeight > el.clientHeight + 1) return el;
  }

  // Otherwise look for the first descendant that's actually scrollable.
  // This is O(n) over visible elements but only runs on mount / restore ticks.
  const all = document.querySelectorAll<HTMLElement>("body *");
  for (const el of all) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const cs = getComputedStyle(el);
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") return el;
    }
  }

  return document.scrollingElement ?? document.documentElement;
}

function getScroll(el: Element): number {
  return el.scrollTop;
}

function setScroll(el: Element, y: number): void {
  el.scrollTop = y;
  // Belt-and-braces: in case the real scroller is one of the doc roots, hit the others too.
  if (el !== document.documentElement) document.documentElement.scrollTop = y;
  if (el !== document.body) document.body.scrollTop = y;
  try {
    window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
  } catch {
    window.scrollTo(0, y);
  }
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

  // Capture-phase listener on the document — catches scroll on ANY element,
  // including custom inner scroll containers.
  document.addEventListener(
    "scroll",
    (e) => {
      if (restoring || currentKey === null) return;
      const t = e.target;
      let y = 0;
      if (t === document || t === document.documentElement || t === document.body) {
        const el = findScrollContainer();
        y = getScroll(el);
      } else if (t instanceof Element) {
        y = t.scrollTop;
      }
      writeSaved(currentKey, y);
      log("save (scroll)", currentKey, y);
    },
    { passive: true, capture: true }
  );

  window.addEventListener("beforeunload", () => {
    if (currentKey !== null) {
      const el = findScrollContainer();
      writeSaved(currentKey, getScroll(el));
    }
  });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
}

/**
 * Save/restore window (or main-content) scroll position keyed by `key`.
 * Pass `ready = true` once the page has loaded its data, so we restore after
 * the page has its final height.
 */
export function useScrollRestore(key: string, ready = true): void {
  // Activate / deactivate this route. The shared listener saves to whichever
  // key is currently active.
  useEffect(() => {
    install();
    const prev = currentKey;
    currentKey = key;
    log("activate", key, "saved=", readSaved(key));
    return () => {
      const el = findScrollContainer();
      const y = getScroll(el);
      writeSaved(key, y);
      log("deactivate", key, "y=", y);
      currentKey = prev;
    };
  }, [key]);

  // Restore — runs once content has reached its final layout. Retries for up
  // to ~3 seconds to cover late image decoding / progressive layout growth.
  // Sets `restoring = true` while running so the save listener can't clobber
  // the saved value with a transient zero during the dance.
  useLayoutEffect(() => {
    if (!ready) return;
    const saved = readSaved(key);
    log("restore?", key, "ready=", ready, "saved=", saved);
    const target = saved ?? 0;

    restoring = true;
    let attempts = 0;
    const maxAttempts = 180; // ~3s at 60fps
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        restoring = false;
        return;
      }
      const el = findScrollContainer();
      setScroll(el, target);
      attempts++;
      const actual = getScroll(el);
      if (attempts < maxAttempts && Math.abs(actual - target) > 4) {
        requestAnimationFrame(tick);
      } else {
        restoring = false;
        log("restored", key, "target=", target, "actual=", actual, "attempts=", attempts);
      }
    };
    requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      restoring = false;
    };
  }, [key, ready]);
}
