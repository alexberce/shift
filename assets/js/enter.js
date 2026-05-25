/**
 * Enter animation. Runs once per element, the first time we encounter it
 * (either at init or via MutationObserver after LiveView patches it in).
 *
 * Smart defaults — these exist so the most common animations are just
 * `<.animated>`:
 *   - Opacity 0 -> 1 fade is added unless `disable: [:fade]`.
 *   - For every property mentioned in `initial` but not in `animate`, the
 *     target is auto-resolved to its natural resting value: REST[key] for
 *     transforms/opacity, the measured natural size for height/width.
 *   - When animating size, padding/margin/border on the same axis collapse
 *     with it so the box can actually reach 0 (border-box would otherwise
 *     plateau at the padding total).
 *
 * Element state set here: SEEN, TRACKED membership; __shiftLayout,
 * __shiftSiblingIndex, parent.__shiftLastEnterMs; and __shiftTransitioning
 * during a size enter.
 */

import { SEEN, TRACKED, readSpec } from "./state.js";
import { measure } from "./measure.js";
import {
  REST,
  fillCollapseProps,
  toKeyframe,
  tweenTiming,
  buildKeyframes,
} from "./keyframes.js";

export function enter(el) {
  if (SEEN.has(el)) return;
  SEEN.add(el);
  TRACKED.add(el);

  const spec = readSpec(el);
  if (!spec) return;

  /**
   * Every animated element seeds its layout, so a later mid-life change
   * (position OR size) can be measured against it. If the element is
   * currently hidden (under `display: none`), `measure` returns null —
   * we leave `__shiftLayout` undefined and let relayout seed it once the
   * element actually has a layout.
   */
  const initialLayout = measure(el);
  if (initialLayout) el.__shiftLayout = initialLayout;

  /**
   * Cache the element's position in its parent so we can restore it on exit
   * if morphdom shuffles us around to fit the new tree. Stamp the parent so
   * a concurrent exit on a sibling can recognise this as a popLayout-style
   * replacement (sliding window, toast cascade) and pin the exit out of
   * flow. Without a fresh-enter signal we leave the exit in flow — pinning
   * a lone exit shrinks the parent and snaps whatever sits below.
   */
  if (el.parentElement) {
    el.__shiftSiblingIndex = [...el.parentElement.children].indexOf(el);
    el.parentElement.__shiftLastEnterMs = performance.now();
  }

  const disabled = spec.disable || [];
  const wantFade = !disabled.includes("fade");

  const initial = spec.initial ? { ...spec.initial } : {};
  const animate = spec.animate ? { ...spec.animate } : {};

  /**
   * Default fade-in. Opacity is the universal "appearance" animation —
   * requiring users to write it on every element is needless ceremony.
   */
  if (wantFade) {
    if (!("opacity" in initial)) initial.opacity = 0;
    if (!("opacity" in animate)) animate.opacity = 1;
  }

  /**
   * For any property mentioned in `initial` but not in `animate`, default
   * the target to its natural resting value (or the measured natural size
   * for height/width). So `initial={%{y: 16}}` automatically animates to
   * `y: 0`, no need to spell out the obvious target.
   */
  for (const key in initial) {
    if (key in animate) continue;
    if (key === "height") animate[key] = el.offsetHeight;
    else if (key === "width") animate[key] = el.offsetWidth;
    else if (key in REST) animate[key] = REST[key];
  }

  /**
   * Collapse padding/margin/border along the same axis so the box can
   * actually shrink to nothing instead of plateauing at the padding total.
   */
  if ("height" in initial) fillCollapseProps(initial, animate, el, "height");
  if ("width" in initial) fillCollapseProps(initial, animate, el, "width");

  /**
   * Whenever size is animated, hold `overflow: hidden` so content doesn't
   * spill while the box is mid-grow.
   */
  const hasSize =
    "height" in initial ||
    "width" in initial ||
    "height" in animate ||
    "width" in animate;
  if (hasSize) {
    initial.overflow = "hidden";
    animate.overflow = "hidden";
  }

  if (Object.keys(initial).length === 0 && Object.keys(animate).length === 0)
    return;

  let anim;
  if (Object.keys(initial).length > 0 && Object.keys(animate).length > 0) {
    const { keyframes, options } = buildKeyframes(
      initial,
      animate,
      spec.transition,
      "enter",
    );
    anim = el.animate(keyframes, options);
  } else if (Object.keys(animate).length > 0) {
    anim = el.animate(
      [toKeyframe(animate)],
      tweenTiming(spec.transition, "enter"),
    );
  } else {
    return;
  }

  if (hasSize) {
    /**
     * The enter animation is about to clamp the element to height: 0 (or
     * similar) for its first frame, which would corrupt any mid-life size
     * measurement happening in this same observer callback. Mark the
     * element so relayout skips it until the entrance settles, then refresh
     * the cached layout from the now-stable natural state and cancel the
     * WAAPI animation so the element reverts to its natural overflow.
     */
    el.__shiftTransitioning = true;
    anim.addEventListener("finish", () => {
      el.__shiftTransitioning = false;
      el.__shiftLayout = measure(el);
      anim.cancel();
    });
    anim.addEventListener("cancel", () => {
      el.__shiftTransitioning = false;
    });
  }
}
