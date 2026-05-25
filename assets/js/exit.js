/**
 * Exit animation. Triggered by the `shift:exit` event dispatched from the
 * component's `phx-remove`. LiveView keeps the node alive for the duration
 * of the exit before actually removing it.
 *
 * Two subtle things this module handles:
 *
 *   1. Cascading exits: morphdom shuffles `phx-remove` nodes to the end of
 *      the parent's children to fit the new tree, which jumbles their
 *      visual order. We restore each transitioning element to its
 *      last-known slot so a second dismissal mid-first-exit doesn't pile up
 *      out of order.
 *
 *   2. Pin-out-of-flow decision: taking the exit out of flex/grid/block
 *      flow keeps the parent from briefly being one item taller than it
 *      should be (the "phantom slot" bug on stacks like toasts and sliding
 *      windows). But pinning a lone exit shrinks the parent immediately,
 *      snapping whatever sits below. So we only pin when there's a sibling
 *      ENTERING in the same patch (popLayout-style replacement). We detect
 *      that without waiting for MutationObserver: morphdom inserts new
 *      nodes before phx-remove fires, so a sibling with a `data-shift`
 *      attribute that we've never SEEN before is a pending enter.
 */

import { SEEN, TRACKED, readSpec } from "./state.js";
import { measure } from "./measure.js";
import { REST, fillCollapseProps, buildKeyframes } from "./keyframes.js";

export function exit(el) {
  const spec = readSpec(el);
  if (!spec) return;

  const disabled = spec.disable || [];
  const wantFade = !disabled.includes("fade");

  const exitMap = spec.exit ? { ...spec.exit } : {};
  /** Default fade-out — opacity is the universal "departure" animation. */
  if (wantFade && !("opacity" in exitMap)) exitMap.opacity = 0;
  if (Object.keys(exitMap).length === 0) return;

  const from = {};

  for (const key of Object.keys(exitMap)) {
    if (key === "height") from[key] = el.offsetHeight;
    else if (key === "width") from[key] = el.offsetWidth;
    else if (key in REST) from[key] = REST[key];
    else from[key] = 0;
  }

  const hasSize = "height" in exitMap || "width" in exitMap;
  if (hasSize) {
    from.overflow = "hidden";
    exitMap.overflow = "hidden";
    /**
     * Collapse padding/margin/border on the same axis so the box can fully
     * shrink past its padding floor — otherwise the exit visually plateaus.
     */
    if ("height" in exitMap) fillCollapseProps(exitMap, from, el, "height");
    if ("width" in exitMap) fillCollapseProps(exitMap, from, el, "width");
  }

  /**
   * Mark as transitioning so relayout skips us (the WAAPI animation will
   * transiently clamp our offsetHeight, which would look like a real layout
   * change and trigger a competing FLIP).
   */
  el.__shiftTransitioning = true;

  /**
   * DOM-slot restoration always runs (cascading exits stay in order even
   * when no pin is applied). Pin only when:
   *   - exit isn't a size-collapse (an accordion explicitly wants its
   *     parent to shrink with it; pinning would freeze the parent at full
   *     size and the panel would visibly shrink in mid-air), AND
   *   - the parent has a SIBLING ENTERING in the same patch (popLayout-
   *     style replacement: sliding window, toast queue swap). Otherwise
   *     the exit is the only thing changing the layout and pinning would
   *     shrink the parent immediately, snapping whatever sits below.
   */
  restoreCascadingExitSlots();
  const parent = el.parentElement;
  const pendingSibling =
    parent &&
    Array.from(parent.children).some(
      (c) => c !== el && c.hasAttribute("data-shift") && !SEEN.has(c),
    );
  const recentEnter =
    parent && performance.now() - (parent.__shiftLastEnterMs || 0) < 100;
  if (!hasSize && (pendingSibling || recentEnter)) applyExitPin(el);

  const { keyframes, options } = buildKeyframes(
    from,
    exitMap,
    spec.transition,
    "exit",
  );
  el.animate(keyframes, options);

  /**
   * `display: table-row` ignores CSS `height` — the row's height is derived
   * from its tallest cell. We can't switch the row to `display: block`
   * without breaking column alignment, so we collapse each cell from the
   * inside: padding to 0 (shrinks the cell's box) and font-size +
   * line-height to 0 (collapses the inline content height). With both, the
   * cell — and therefore the row — can actually reach 0 height while the
   * table layout stays intact.
   */
  if (
    hasSize &&
    "height" in exitMap &&
    getComputedStyle(el).display === "table-row"
  ) {
    for (const cell of el.children) {
      if (cell.tagName !== "TD" && cell.tagName !== "TH") continue;
      const ccs = getComputedStyle(cell);
      const cellFrom = {
        paddingTop: parseFloat(ccs.paddingTop) || 0,
        paddingBottom: parseFloat(ccs.paddingBottom) || 0,
        fontSize: parseFloat(ccs.fontSize) || 0,
        lineHeight:
          ccs.lineHeight === "normal"
            ? (parseFloat(ccs.fontSize) || 0) * 1.2
            : parseFloat(ccs.lineHeight) || 0,
        overflow: "hidden",
      };
      const cellTo = {
        paddingTop: 0,
        paddingBottom: 0,
        fontSize: 0,
        lineHeight: 0,
        overflow: "hidden",
      };
      const built = buildKeyframes(cellFrom, cellTo, spec.transition, "exit");
      cell.animate(built.keyframes, built.options);
    }
  }

  /**
   * Size-collapse exits cause siblings to reflow continuously while the box
   * shrinks (the box stays in flow, so the parent's layout updates each
   * frame). The MutationObserver doesn't fire during a WAAPI animation, so
   * sibling __shiftLayout caches stay frozen at their pre-collapse positions.
   *
   * By the time LiveView removes the element, the post-removal relayout
   * computes a delta against those stale caches and FLIPs the siblings —
   * visibly snapping them back to where they were and animating them up
   * again.
   *
   * Keep the sibling caches honest by remeasuring on every animation frame
   * while this size-collapsing exit is alive.
   */
  if (hasSize) {
    const exitingParent = el.parentElement;
    const tick = () => {
      if (!el.isConnected) {
        /**
         * Element was just removed. Null sibling caches so the post-removal
         * relayout has no prev to diff against — there's nothing to FLIP
         * because siblings already rode up via CSS reflow during the height
         * collapse. The very next relayout will repopulate the caches with
         * current positions and normal FLIP behavior resumes afterward.
         */
        if (exitingParent && exitingParent.isConnected) {
          clearChildLayouts(exitingParent);
        }
        return;
      }
      refreshChildLayouts(exitingParent);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function refreshChildLayouts(parent) {
  if (!parent) return;
  for (const child of parent.children) {
    if (!child.hasAttribute("data-shift")) continue;
    if (!child.isConnected) continue;
    if (child.__shiftTransitioning) continue;
    child.__shiftLayout = measure(child);
  }
}

function clearChildLayouts(parent) {
  if (!parent) return;
  for (const child of parent.children) {
    if (!child.hasAttribute("data-shift")) continue;
    if (child.__shiftTransitioning) continue;
    child.__shiftLayout = null;
  }
}

/**
 * Re-insert every currently-transitioning element into the DOM slot it was
 * last seen in. Called before pinning so cascading dismissals stay in the
 * order the user perceives.
 */
export function restoreCascadingExitSlots() {
  for (const node of TRACKED) {
    if (!node.__shiftTransitioning) continue;
    if (typeof node.__shiftSiblingIndex !== "number") continue;

    const p = node.parentElement;
    if (!p) continue;

    const currentIndex = [...p.children].indexOf(node);
    const target = node.__shiftSiblingIndex;

    if (currentIndex === -1 || currentIndex === target) continue;

    if (target >= p.children.length) {
      if (p.lastElementChild !== node) p.appendChild(node);
      continue;
    }

    const refNode = p.children[target];
    if (refNode !== node) p.insertBefore(node, refNode);
  }
}

/**
 * Lift the exiting element out of flex/grid/block flow. The cached
 * coordinates are body-relative (summed offsetTop chain), so `position:
 * fixed` minus scrollY puts it back at its pre-removal viewport spot.
 *
 * Caller decides whether pinning is appropriate (see the recentEnter
 * check above).
 */
export function applyExitPin(el) {
  const cached = el.__shiftLayout;
  if (!cached) return;

  el.style.position = "fixed";
  el.style.top = cached.top - (window.scrollY || 0) + "px";
  el.style.left = cached.left - (window.scrollX || 0) + "px";
  el.style.width = cached.width + "px";
  el.style.height = cached.height + "px";
  el.style.margin = "0";
}
