import { TRACKED } from "./state.js";

/**
 * Runs `read` with the effects of running layout animations detached, then reattaches them.
 */
export function withoutLayoutAnimations(read) {
  const detached = [];

  for (const el of TRACKED) {
    const anim = el.__shiftFlip;
    if (anim && (anim.playState === "running" || anim.playState === "paused")) {
      detached.push([anim, anim.effect]);
      anim.effect = null;
    }
  }

  const result = read();

  for (const [anim, effect] of detached) anim.effect = effect;

  return result;
}

/**
 * Body-relative layout measurement.
 *
 * `offsetTop`/`offsetLeft`/`offsetWidth`/`offsetHeight` report the element's
 * *layout* values and are immune to CSS transforms, so they stay accurate
 * even while a previous animation is still playing on the same element.
 *
 * Why summing through the offsetParent chain: `offsetTop` alone is relative
 * to the nearest positioned ancestor, so if an ancestor reflows (e.g. a
 * bottom-anchored toast container shrinks when an item is removed), the
 * child's offsetTop changes even though it didn't visually move. Summing
 * cancels the ancestor shift. Still transform-immune (offsetTop is), unlike
 * getBoundingClientRect.
 */
export function measure(el) {
  /**
   * Hidden elements (anywhere under a `display: none` ancestor) report
   * `offsetParent === null` and zero metrics. Caching that as a "real"
   * layout means the first time the element is shown and then mutated,
   * FLIP diffs the new position against (0, 0) and animates the element
   * in from the top-left of the page. Return null so callers know to
   * skip caching until the element actually has a layout.
   */
  if (
    el.offsetParent === null &&
    el !== document.body &&
    el !== document.documentElement &&
    getComputedStyle(el).position !== "fixed"
  ) {
    return null;
  }

  let top = 0;
  let left = 0;
  let cur = el;
  while (cur) {
    top += cur.offsetTop || 0;
    left += cur.offsetLeft || 0;
    cur = cur.offsetParent;
  }
  /**
   * Local position — relative to the immediate parent. Computed as the
   * element's body-relative offset minus the parent's body-relative offset
   * (offsetTop alone is relative to the nearest positioned ancestor, which
   * is usually the body for static-flow content). Used as the FLIP gate so
   * we don't animate every element on the page when something far up the
   * page shrinks and pushes everything below.
   */
  let parentTop = 0;
  let parentLeft = 0;
  let pCur = el.parentElement;
  while (pCur) {
    parentTop += pCur.offsetTop || 0;
    parentLeft += pCur.offsetLeft || 0;
    pCur = pCur.offsetParent;
  }
  return {
    top,
    left,
    width: el.offsetWidth,
    height: el.offsetHeight,
    localTop: top - parentTop,
    localLeft: left - parentLeft,
    parent: el.parentElement,
  };
}

/**
 * Off-screen visibility, tracked with an IntersectionObserve.
 *
 * The observer instead stamps `__shiftOnscreen` on every tracked element
 * asynchronously as it scrolls in and out, so by the time a row exits we
 * already know whether it's visible.
 */
let visObserver;

function visObserverInstance() {
  if (visObserver !== undefined) return visObserver;

  visObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const el = e.target;
              el.__shiftOnscreen = e.isIntersecting;
              /**
               * Relayout skips off-screen elements, so their cached layout
               * goes stale while the page changes around them. Reseed the
               * moment the element comes back toward the viewport, so a later
               * FLIP diffs against a real position instead of a stale one.
               * IO callbacks run right after layout, so the reads are clean.
               */
              if (e.isIntersecting && !el.__shiftTransitioning) {
                const layout = withoutLayoutAnimations(() => measure(el));
                if (layout) el.__shiftLayout = layout;
              }
            }
          },
          { rootMargin: "100% 0px 100% 0px" },
        );

  return visObserver;
}

/** Start observing an element's viewport visibility (called once, at enter). */
export function trackVisibility(el) {
  const obs = visObserverInstance();
  if (obs) obs.observe(el);
}

/** Stop observing — called when a tracked element leaves the DOM. */
export function untrackVisibility(el) {
  if (visObserver) visObserver.unobserve(el);
}

/**
 * Is the element far enough outside the viewport that an enter/exit animation
 * on it would never be seen? Reads the observer's cached flag. Falls back to a
 * direct `getBoundingClientRect` only when we have no flag yet — e.g. a row
 * entering this very patch, which the observer hasn't reported on, and which is
 * one element, not the hundreds a filter exit spans.
 */
export function farOffscreen(el) {
  if (el.__shiftOnscreen !== undefined) return el.__shiftOnscreen === false;

  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = el.getBoundingClientRect();
  return rect.bottom < -vh || rect.top > vh + vh;
}
