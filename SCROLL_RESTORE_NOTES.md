# Scroll restoration — what's been tried, what's left

A living log of attempts to fix "gallery jumps back to the top when navigating back
from a folder / reader". Update this file when adding new attempts.

## Symptom

User scrolls down the main Gallery (or a FolderView), clicks a card to open
`/folder/:id` or `/read/:id`, then navigates back. On return, the page is scrolled
to `y = 0` instead of the previous position.

## Attempts so far

### Round 1 — basic per-route hook

- `Map<routeKey, number>` at module scope.
- `useLayoutEffect` on mount: read saved → `window.scrollTo(0, saved)`.
- `useEffect` cleanup on unmount: `window.scrollY` → write.
- Gated by `ready` flag (`rows.length > 0`) so restore waits for content.
- `restoredRef` to prevent double-restore inside a mount.

Outcome: still jumped to top.

### Round 2 — continuous save + aggressive write

Additions on top of round 1:

- **Continuous `scroll` listener** on `window` saving the position on every scroll,
  not just on unmount. (Prevents staleness from React Strict-Mode double-mount or
  the cleanup firing too early.)
- **Multi-target write**: `window.scrollTo(0, y)` AND
  `document.scrollingElement.scrollTop = y` AND
  `document.documentElement.scrollTop = y` AND
  `document.body.scrollTop = y`. Idea: whichever element Chromium considers the
  scroll root, hit them all.
- **Multi-attempt restore**: immediate + `requestAnimationFrame` +
  `setTimeout(50)` + `setTimeout(200)`. Idea: layout may grow as images decode,
  so re-apply after the page settles.
- **`sessionStorage`-backed** so HMR / dev reload can't wipe state.
- `history.scrollRestoration = 'manual'` to disable any browser-side
  auto-restoration.
- **CSS change** in `index.css`: `html, body, #root { height: 100% }` →
  `html, body { min-height: 100% }` + `#root { min-height: 100vh }`. The
  fixed `height: 100%` was suspected to pin the document to viewport height,
  putting the real scrollbar on some child element and making `window.scrollY`
  read zero always.

Outcome: still jumped to top.

### Round 4 — auto-detect the real scroll container

Current state. See `src/renderer/lib/useScrollRestore.ts`.

- **`findScrollContainer()`** walks the DOM each save/restore tick: tries
  `document.scrollingElement` → `documentElement` → `body` → first descendant
  with `overflow-y: auto|scroll` and `scrollHeight > clientHeight`. Bound to
  *that* element's `scrollTop` instead of `window.scrollY`. Removes the assumption
  that the document is always the scroll container.
- **Document-level capture-phase scroll listener** catches scroll on any
  element (including custom inner scroll containers like the vertical reader).
- **`restoring` flag** is set true during the restore retry loop, so the save
  listener can't write a transient `0` while we're programmatically scrolling.
- Retry budget bumped from ~1s to **~3s (180 frames)** to handle large galleries
  where late layout growth would otherwise outrun the loop.
- Multi-target `setScroll` retained as belt-and-braces (writes to the detected
  container plus `documentElement`, `body`, and `window`).
- Diagnostic switch still: `window.__scrollDebug = true`.

Status: pending verification.

### Round 3 — global tracker decoupled from React lifecycle

Current state. See `src/renderer/lib/useScrollRestore.ts`.

- Single window-level `scroll` listener installed **once** (`installed` module
  flag), saving against a module-scope `currentKey`.
- Components only **set / unset** `currentKey` on mount / unmount — they no
  longer own the listener.
- **Retry loop**: up to ~60 animation frames (~1 sec) on restore, re-applying the
  scroll target each frame and bailing early when the actual position matches
  the target within 4 px (survives late image decoding and layout shifts).
- Kept multi-target write, sessionStorage backup, `scrollRestoration = 'manual'`.
- `beforeunload` handler saves before unload.
- Diagnostic switch: `window.__scrollDebug = true` in DevTools logs every
  activate / deactivate / save / restore / attempts.

Outcome: still reportedly jumps to top per user; no DevTools logs have been
captured yet to confirm what the hook is actually observing.

## What we know / suspect but haven't proven

- HashRouter is used (`#/folder/:id` style URLs).
- Gallery renders inside a `<div className="min-h-screen ...">` with a sticky
  header. No explicit `overflow-y: auto` on any wrapper that we know of, so the
  document itself should be the scroll container.
- The CSS change in Round 2 *should* have fixed the case where `window.scrollY`
  reads zero, but we have no confirmation that this was even the issue.
- We have not yet inspected the live DOM in DevTools to see which element is the
  actual scroll container (could be `html`, `body`, `#root`, or even one of the
  page wrappers depending on which element ends up with overflow:auto in
  computed styles).
- We have not seen the diagnostic logs from `window.__scrollDebug = true`. They
  would tell us:
  - is the activate / deactivate hook being called at all on navigation?
  - is the saved value being read on remount?
  - is the saved value zero (i.e. wrong write) or non-zero (i.e. wrong read /
    wrong target)?
  - is the multi-attempt loop running but failing to keep the scroll?

## Most likely root causes still on the table

1. **The scroll container isn't the window.** Some flex / overflow setup in
   `Gallery.tsx` or `FolderView.tsx` ends up with the scrollbar on a child
   element. `window.scrollY` would then always read 0 regardless of how far the
   user has scrolled. **Test**: open DevTools, scroll the gallery halfway, in
   the Console run `window.scrollY` and `document.scrollingElement.scrollTop`
   and `Array.from(document.querySelectorAll('*')).filter(e => e.scrollTop > 0)`.
   Whichever element is non-zero is the real scroll container.

2. **React-Router HashRouter resets scroll on hash change.** The router itself
   could be calling `scrollTo(0, 0)` on every navigation. Tests with
   `scrollRestoration = 'manual'` may not cover hash-based nav.

3. **Restore fires before content is in the DOM, and only fires once.** The
   `ready` flag waits for `rows.length > 0`, but in some race the rows could
   arrive synchronously on remount (cached) — in which case the
   `restoredRef.current = true` happens before the user sees anything, and we
   never retry after the page extends. The retry loop in Round 3 should cover
   this, but only for ~1 second.

4. **Strict-Mode double-mount in dev wiping state.** The first mount's cleanup
   could be overwriting the just-restored position with `0`. Round 3 should
   handle this via the global-listener pattern, but only if the listener saves
   the *real* user scroll and not the post-restore-attempt scroll.

## Ideas NOT yet tried

In rough order of how much I'd bet on each.

### Idea A — Inspect what is actually the scroll container, then bind to it

Drop all the multi-target write nonsense and:

1. In the hook, on mount, walk up from `document.body` looking for the nearest
   ancestor whose computed `overflow-y` is `auto` or `scroll` AND whose
   `scrollHeight > clientHeight`. That's the real scroll container.
2. Save / restore via that element's `scrollTop` instead of `window.scrollY`.
3. If no such element is found, fall back to `document.scrollingElement`.

This addresses Most-Likely-Cause #1 directly. The investigation also reveals
whether there's a structural problem to fix in the page layout itself.

### Idea B — Use React Router's data-router API with `<ScrollRestoration>`

React Router 6.4+ has a built-in `<ScrollRestoration>` component that handles
this when used with the data-router (`createBrowserRouter` /
`createHashRouter`). We're on `HashRouter` (legacy router), which doesn't
support it. Migrating to `createHashRouter` is a small change but touches
`main.tsx`.

The built-in restoration uses `getKey` to identify locations and handles
hash-vs-back semantics that we may be fighting against manually.

### Idea C — Imperative save on Card click, restore on first render

Skip the scroll listener entirely. On every navigation away from Gallery /
FolderView (in the Card's onClick handler, before `navigate(...)`), capture the
current scroll and stash it. On the destination's mount or on returning to the
source, restore from the stash. This is brittle because it has to be wired
into every navigation, but it removes all the timing / lifecycle uncertainty.

### Idea D — `popstate` event handler at the app level

Bind a single `popstate` listener at app boot. When it fires (i.e. user pressed
back or used `nav(-1)`), read the destination from `location.hash`, look up the
saved scroll for that route, and apply it on the next animation frame.

This sidesteps React's component lifecycle entirely. It also lets us
distinguish "first navigation to /" (fresh visit, scroll 0) from "back to /"
(restore previous scroll).

### Idea E — Hand-rolled router

Replace HashRouter with a tiny custom router that fires our restore at the
right moment. Heavy-handed but eliminates uncertainty about what React Router
is doing under the hood.

### Idea F — Live DOM diagnosis first

Before doing anything code-wise, ask the user to open DevTools (F12) in the
Manga Reader window, run:

```js
window.__scrollDebug = true
```

then reproduce: scroll Gallery → click a folder → click ← Back. Capture the
console log. The logs will tell us exactly which of the suspected causes is
real, so the next change is targeted instead of speculative.

## Suggested next step

**Idea F (capture diagnostic logs) followed by Idea A (find the real scroll
container).** Logs cost nothing and disambiguate the problem; Idea A is the
fix most likely to actually work regardless of what the logs say.

If the user can't or doesn't want to share logs, jump straight to Idea A.
