/**
 * Inferred mid-life animations.
 *
 * Walks every tracked element, compares its last-known layout with where/
 * what it is now, and animates any delta:
 *
 *   position changed -> FLIP (First-Last-Invert-Play): the element is now at
 *     its new layout position, but we animate `translate(dx, dy) → 0` so it
 *     visually starts from its old position and slides to the new one.
 *
 *   size changed -> interpolate width/height from old to new; hold
 *     `overflow: hidden` throughout so content doesn't spill mid-grow.
 *
 * Per-element opt-outs via spec.disable: ["position"] / ["size"].
 */

import { TRACKED, readSpec } from "./state.js";
import { measure } from "./measure.js";
import { buildKeyframes } from "./keyframes.js";

export function relayout() {
  const changed = [];

  for (const el of TRACKED) {
    /**
     * Drop nodes that have been detached from the document (post-exit DOM
     * removal). Cheap O(1) `isConnected` check beats the alternative of a
     * global MutationObserver tracking removals.
     */
    if (!el.isConnected) {
      TRACKED.delete(el);
      continue;
    }
    /**
     * Skip elements whose enter/exit is currently mutating their size —
     * the WAAPI animation transiently clamps offsetHeight, which would
     * look like a real layout change and trigger a competing FLIP.
     */
    if (el.__shiftTransitioning) continue;

    const spec = readSpec(el);
    if (!spec) continue;

    const prev = el.__shiftLayout;
    const next = measure(el);
    el.__shiftLayout = next;
    /**
     * Refresh the cached DOM slot too — this is the element's "last stable
     * position", which is what we want to restore to if it later exits.
     * The value set at enter time goes stale as other siblings come and go.
     */
    if (el.parentElement) {
      el.__shiftSiblingIndex = [...el.parentElement.children].indexOf(el);
    }
    if (!prev) continue;

    const disabled = spec.disable || [];
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    const dw = next.width - prev.width;
    const dh = next.height - prev.height;

    const animatePos =
      !disabled.includes("position") && (Math.abs(dx) > 1 || Math.abs(dy) > 1);
    const animateSize =
      !disabled.includes("size") && (Math.abs(dw) > 1 || Math.abs(dh) > 1);

    if (animatePos || animateSize) {
      changed.push({
        el,
        dx,
        dy,
        prevW: prev.width,
        prevH: prev.height,
        newW: next.width,
        newH: next.height,
        animatePos,
        animateSize,
        spec,
      });
    }
  }

  for (const item of changed) {
    if (item.el.__shiftFlip) item.el.__shiftFlip.cancel();

    const from = {};
    const to = {};

    if (item.animatePos) {
      from.x = item.dx;
      from.y = item.dy;
      to.x = 0;
      to.y = 0;
    }

    if (item.animateSize) {
      from.width = item.prevW;
      from.height = item.prevH;
      to.width = item.newW;
      to.height = item.newH;
      /**
       * Discrete value held in every keyframe — keeps content from spilling
       * while the box is partway through its new dimensions.
       */
      from.overflow = "hidden";
      to.overflow = "hidden";
    }

    const { keyframes, options } = buildKeyframes(
      from,
      to,
      item.spec.transition,
      "layout",
    );
    const anim = item.el.animate(keyframes, options);
    /**
     * When the animation completes naturally, cancel it so the element
     * reverts to its natural DOM dimensions (which equal the end state —
     * no visual jump, but the WAAPI animation is removed instead of being
     * left to "fill" forever, which would freeze the element at the
     * animated end value).
     */
    anim.addEventListener("finish", () => anim.cancel());
    item.el.__shiftFlip = anim;
  }
}
