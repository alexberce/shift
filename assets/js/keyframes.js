/**
 * Keyframe construction: converts user-facing motion specs
 * ({x, y, scale, opacity, height, ...}) into WAAPI keyframe objects, and
 * builds the {keyframes, options} pair the runtime hands to `el.animate()`.
 */

import { solveSpring } from "./spring.js";

export const DEFAULT_DURATION = 0.3;

/** Shorthand names -> CSS transform functions. */
export const TRANSFORM_FN = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  scale: "scale",
  scaleX: "scaleX",
  scaleY: "scaleY",
  rotate: "rotate",
  rotateX: "rotateX",
  rotateY: "rotateY",
  skewX: "skewX",
  skewY: "skewY",
};

export const TRANSFORM_UNIT = {
  x: "px",
  y: "px",
  z: "px",
  rotate: "deg",
  rotateX: "deg",
  rotateY: "deg",
  skewX: "deg",
  skewY: "deg",
};

/** Properties that take a px unit when given a bare number. */
export const PX_PROPS = new Set([
  "height",
  "width",
  "top",
  "left",
  "right",
  "bottom",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
]);

/**
 * When height/width animates to or from 0, padding/margin/border on that
 * axis have to collapse with it — otherwise the box can't shrink past the
 * padding total (with box-sizing: border-box), which is the bug that makes
 * accordions look like they plateau and snap.
 */
export const COLLAPSE_PROPS = {
  height: [
    "paddingTop",
    "paddingBottom",
    "marginTop",
    "marginBottom",
    "borderTopWidth",
    "borderBottomWidth",
  ],
  width: [
    "paddingLeft",
    "paddingRight",
    "marginLeft",
    "marginRight",
    "borderLeftWidth",
    "borderRightWidth",
  ],
};

/**
 * Resting value of a property — the implicit "from" for exit animations and
 * the implicit "to" for any property mentioned only in `initial`.
 */
export const REST = {
  opacity: 1,
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  skewX: 0,
  skewY: 0,
};

/**
 * Phase-aware easing defaults. Enter decelerates into rest (ease-out), and
 * exit + mid-life size/position use ease-in-out so visible motion starts
 * immediately and runs through the full duration (a "departing" ease-in
 * reads as a delay-then-snap, which feels instant). The user's explicit
 * `easing` always wins.
 */
export const DEFAULT_EASING = {
  enter: "cubic-bezier(0.22, 1, 0.36, 1)",
  exit: "cubic-bezier(0.4, 0, 0.2, 1)",
  layout: "cubic-bezier(0.4, 0, 0.2, 1)",
};

/**
 * Augment `collapsed` (the 0-side) and `natural` (the measured-side) maps
 * in place: any collapse-axis prop not already declared gets 0 on the
 * collapsed side and the element's computed value on the natural side.
 */
export function fillCollapseProps(collapsed, natural, el, axis) {
  const cs = getComputedStyle(el);
  for (const prop of COLLAPSE_PROPS[axis]) {
    if (!(prop in collapsed)) collapsed[prop] = 0;
    if (!(prop in natural)) natural[prop] = parseFloat(cs[prop]) || 0;
  }
}

/**
 * Turn a {opacity, x, y, scale, width, ...} map into a single WAAPI keyframe
 * object, composing every transform shorthand into one `transform` string
 * and suffixing px on bare numeric layout values.
 */
export function toKeyframe(values) {
  const frame = {};
  const transforms = [];

  for (const key in values) {
    const fn = TRANSFORM_FN[key];
    if (fn) {
      const value = values[key];
      const unit = TRANSFORM_UNIT[key] || "";
      const arg = typeof value === "number" && unit ? `${value}${unit}` : value;
      transforms.push(`${fn}(${arg})`);
    } else if (PX_PROPS.has(key) && typeof values[key] === "number") {
      frame[key] = `${values[key]}px`;
    } else {
      frame[key] = values[key];
    }
  }

  if (transforms.length) frame.transform = transforms.join(" ");
  return frame;
}

export function tweenTiming(transition = {}, phase) {
  return {
    duration: (transition.duration ?? DEFAULT_DURATION) * 1000,
    delay: (transition.delay ?? 0) * 1000,
    easing: transition.easing ?? DEFAULT_EASING[phase] ?? "ease",
    fill: "both",
  };
}

/**
 * Build the WAAPI keyframes + options to animate from one value map to
 * another. `phase` is one of "enter" / "exit" / "layout" and selects the
 * default easing when the user didn't specify one.
 *
 * Spring transitions go through solveSpring, which returns a sampled
 * progress curve; we interpolate every numeric key across that curve and
 * emit one keyframe per sample. Tweens emit just two keyframes (from/to)
 * and let the CSS easing function shape the motion.
 */
export function buildKeyframes(from, to, transition = {}, phase) {
  if (transition.type === "spring") {
    const { progress, durationMs } = solveSpring(transition);
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);

    const keyframes = progress.map((p) => {
      const values = {};
      for (const key of keys) {
        const a = from[key];
        const b = to[key];
        values[key] =
          typeof a === "number" && typeof b === "number" ? a + (b - a) * p : b;
      }
      return toKeyframe(values);
    });

    return {
      keyframes,
      options: {
        duration: durationMs,
        delay: (transition.delay ?? 0) * 1000,
        easing: "linear",
        fill: "both",
      },
    };
  }

  return {
    keyframes: [toKeyframe(from), toKeyframe(to)],
    options: tweenTiming(transition, phase),
  };
}
