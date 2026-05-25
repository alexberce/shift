/**
 * Per-element state shared across the runtime.
 *
 * SEEN: every element we've already called `enter()` on. WeakSet so detached
 * nodes are GC'd without bookkeeping.
 *
 * TRACKED: every animated element currently in the DOM. A real Set, iterated
 * on every relayout. We remove detached nodes lazily during relayout via `isConnected`.
 *
 * Element instance fields (set by the runtime, prefixed __shift to avoid
 * colliding with anything else):
 *   __shiftSpec, __shiftSpecRaw        - parsed JSON spec + the raw string
 *                                        it was parsed from (cache key)
 *   __shiftLayout                      - last-known body-relative {top, left,
 *                                        width, height}; seeds FLIP/size
 *   __shiftSiblingIndex                - index in parent.children, kept
 *                                        fresh on relayout; used to restore
 *                                        the DOM slot on exit
 *   __shiftTransitioning               - true while an enter/exit animation
 *                                        is in progress; relayout skips
 *   __shiftFlip                        - currently-running mid-life
 *                                        animation; cancelled on next
 *                                        relayout
 *   parent.__shiftLastEnterMs          - timestamp of last enter() on a
 *                                        child of this parent; pinForExit
 *                                        reads it
 */
export const SEEN = new WeakSet();
export const TRACKED = new Set();

/**
 * Runtime-wide flags. `navigating` is true while LiveView is between a
 * `live_redirect` start and stop. Exit animations skip in that window.
 */
export const RUNTIME = { navigating: false };

/**
 * Read and parse the `data-shift` spec from an element. Cached on the
 * element, keyed on the raw string.
 *
 * Why caching keyed on the raw string: the server CAN re-render the same
 * element with a new spec and morphdom patches the attribute in
 * place. Without invalidation we'd keep using the first-seen spec and
 * silently ignore later changes. String compare is cheap; the goal is to
 * dodge the JSON.parse on every relayout.
 */
export function readSpec(el) {
  const raw = el.dataset.shift;
  if (raw === undefined) return null;
  if (el.__shiftSpecRaw === raw) return el.__shiftSpec;
  el.__shiftSpecRaw = raw;
  try {
    return (el.__shiftSpec = JSON.parse(raw));
  } catch {
    return (el.__shiftSpec = null);
  }
}
