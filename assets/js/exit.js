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

import { SEEN, TRACKED, RUNTIME, readSpec } from "./state.js";
import { measure } from "./measure.js";
import { REST, fillCollapseProps, buildKeyframes } from "./keyframes.js";

export function exit(el) {
  /** Skip exits during a `live_redirect` — see RUNTIME.navigating. */
  if (RUNTIME.navigating) return;

  const spec = readSpec(el);
  if (!spec) return;

  const disabled = spec.disable || [];
  const wantFade = !disabled.includes("fade");

  const exitMap = spec.exit ? { ...spec.exit } : {};
  /** Default fade-out — opacity is the universal "departure" animation. */
  if (wantFade && !("opacity" in exitMap)) exitMap.opacity = 0;
  if (Object.keys(exitMap).length === 0) return;

  const from = buildExitFrom(el, exitMap);
  const hasSize = "height" in exitMap || "width" in exitMap;

  /**
   * Mark as transitioning so relayout skips us (the WAAPI animation will
   * transiently clamp our offsetHeight, which would look like a real layout
   * change and trigger a competing FLIP).
   */
  el.__shiftTransitioning = true;

  /**
   * DOM-slot restoration always runs so cascading exits stay in the order the
   * user perceives, then we decide whether to pin this exit out of flow.
   */
  restoreCascadingExitSlots();
  if (shouldPin(el, spec, hasSize)) applyExitPin(el);

  animateExit(el, spec, from, exitMap);

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
   * while a size-collapsing exit is alive.
   */
  if (hasSize && el.parentElement) startParentTick(el.parentElement);
}

/**
 * Play an exit's WAAPI animation — the element itself, then the per-cell
 * collapse animations for a `display: table-row` (see tableRowCellPlans, which
 * returns an empty list for anything else).
 */
function animateExit(el, spec, from, exitMap) {
  const { keyframes, options } = buildKeyframes(
    from,
    exitMap,
    spec.transition,
    "exit",
  );
  el.animate(keyframes, options);

  for (const { cell, from: cellFrom, to: cellTo } of tableRowCellPlans(
    el,
    exitMap,
  )) {
    const built = buildKeyframes(cellFrom, cellTo, spec.transition, "exit");
    cell.animate(built.keyframes, built.options);
  }
}

/**
 * Should this exit be pinned out of flow? Only non-size exits pin — a size
 * collapse (an accordion) wants its parent to shrink with it; pinning would
 * freeze it at full size and shrink in mid-air. For a non-size exit, pin when
 * one of:
 *   - one entered a moment ago (recentEnter).
 *   - the parent has a SIBLING ENTERING in the same patch (popLayout-style
 *     replacement: sliding window, toast queue swap). Detected without the
 *     MutationObserver — morphdom inserts new nodes before phx-remove fires, so
 *     a `data-shift` sibling we've never SEEN is a pending enter.
 *   - `pin_exit` is opted in AND a staying sibling sits after this element (it
 *     will reflow up into the vacated slot). Off by default: pinning a lone exit
 *     only drops the parent's height and snaps whatever sits below, and pinning
 *     under a translate exit animates the leaver over the neighbour that took
 *     its place.
 */
function shouldPin(el, spec, hasSize) {
  if (hasSize) return false;

  const parent = el.parentElement;
  if (!parent) return false;

  const pendingSibling = Array.from(parent.children).some(
    (c) => c !== el && c.hasAttribute("data-shift") && !SEEN.has(c),
  );

  const recentEnter =
    performance.now() - (parent.__shiftLastEnterMs || 0) < 100;

  const stayingSibling = spec.pin_exit === true && hasStayingSiblingAfter(el);

  return pendingSibling || recentEnter || stayingSibling;
}

/**
 * Build the `from` map for an exit — the resting side each property animates
 * away from. Reads layout for height/width. For a size collapse it also holds
 * `overflow: hidden` and collapses padding/margin/border on that axis, so the
 * box can shrink past its padding floor instead of plateauing there. Mutates
 * `exitMap` to hold overflow through the animation.
 */
function buildExitFrom(el, exitMap) {
  const from = {};
  for (const key of Object.keys(exitMap)) {
    if (key === "height") from[key] = el.offsetHeight;
    else if (key === "width") from[key] = el.offsetWidth;
    else if (key in REST) from[key] = REST[key];
    else from[key] = 0;
  }

  if ("height" in exitMap || "width" in exitMap) {
    from.overflow = "hidden";
    exitMap.overflow = "hidden";

    if ("height" in exitMap) fillCollapseProps(exitMap, from, el, "height");
    if ("width" in exitMap) fillCollapseProps(exitMap, from, el, "width");
  }

  return from;
}

/**
 * `display: table-row` ignores CSS `height` — the row's height is derived from
 * its tallest cell. We can't switch the row to `display: block` without breaking
 * column alignment, so we collapse each cell from the inside: padding to 0, and
 * font-size + line-height to 0 to collapse the inline content. With both, the
 * cell — and therefore the row — reaches 0 height while the table layout stays
 * intact. Returns the per-cell from/to collapse plans (empty when this isn't a
 * height-collapsing table row).
 */
function tableRowCellPlans(el, exitMap) {
  if (!("height" in exitMap)) return [];
  if (getComputedStyle(el).display !== "table-row") return [];

  const plans = [];
  for (const cell of el.children) {
    if (cell.tagName !== "TD" && cell.tagName !== "TH") continue;
    const ccs = getComputedStyle(cell);
    plans.push({
      cell,
      from: {
        paddingTop: parseFloat(ccs.paddingTop) || 0,
        paddingBottom: parseFloat(ccs.paddingBottom) || 0,
        fontSize: parseFloat(ccs.fontSize) || 0,
        lineHeight:
          ccs.lineHeight === "normal"
            ? (parseFloat(ccs.fontSize) || 0) * 1.2
            : parseFloat(ccs.lineHeight) || 0,
        overflow: "hidden",
      },
      to: {
        paddingTop: 0,
        paddingBottom: 0,
        fontSize: 0,
        lineHeight: 0,
        overflow: "hidden",
      },
    });
  }

  return plans;
}

/**
 * The per-frame sibling-remeasure loop, shared across every size-collapse exit
 * in the same parent. Only one runs per parent no matter how many rows are
 * collapsing at once: a loop per row would remeasure every sibling once per row
 * per frame (O(rows²)) and lock the tab on a big list. It refreshes the parent's
 * child caches each frame until the parent has no collapsing child left, then
 * nulls them so the post-removal relayout has no stale prev to FLIP against.
 */
const activeTicks = new Set();
function startParentTick(parent) {
  if (activeTicks.has(parent)) return;
  activeTicks.add(parent);

  const tick = () => {
    const stillCollapsing = [...parent.children].some(
      (c) => c.__shiftTransitioning && c.hasAttribute("data-shift"),
    );
    if (stillCollapsing && parent.isConnected) {
      refreshChildLayouts(parent);
      requestAnimationFrame(tick);
      return;
    }
    activeTicks.delete(parent);
    if (parent.isConnected) clearChildLayouts(parent);
  };
  requestAnimationFrame(tick);
}

/**
 * Is there a tracked sibling after `el` that will stay through this patch and
 * reflow up into its slot? "Staying" = already entered (SEEN) and not itself
 * mid-exit. Used only under the opt-in `pin_exit`.
 */
function hasStayingSiblingAfter(el) {
  let sib = el.nextElementSibling;
  while (sib) {
    if (
      sib.hasAttribute("data-shift") &&
      SEEN.has(sib) &&
      !sib.__shiftTransitioning
    ) {
      return true;
    }
    sib = sib.nextElementSibling;
  }
  return false;
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
