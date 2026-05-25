import { describe, it, expect } from "vitest";
import {
  toKeyframe,
  tweenTiming,
  buildKeyframes,
  DEFAULT_EASING,
  REST,
} from "../js/keyframes.js";

describe("toKeyframe", () => {
  it("composes transform shorthands into one transform string", () => {
    expect(toKeyframe({ x: 16, y: 8, scale: 0.9 })).toEqual({
      transform: "translateX(16px) translateY(8px) scale(0.9)",
    });
  });

  it("uses deg units for rotate/skew shorthands", () => {
    expect(toKeyframe({ rotate: 45, skewX: 5 })).toEqual({
      transform: "rotate(45deg) skewX(5deg)",
    });
  });

  it("suffixes px on bare numeric layout values (height, width, padding, ...)", () => {
    expect(toKeyframe({ height: 100, paddingTop: 12 })).toEqual({
      height: "100px",
      paddingTop: "12px",
    });
  });

  it("passes string values through verbatim (already-unit-suffixed or non-numeric)", () => {
    expect(toKeyframe({ height: "auto", opacity: 0.5 })).toEqual({
      height: "auto",
      opacity: 0.5,
    });
  });

  it("merges transforms and non-transforms in the same keyframe", () => {
    const k = toKeyframe({ x: 10, opacity: 0, height: 50 });
    expect(k).toEqual({
      transform: "translateX(10px)",
      opacity: 0,
      height: "50px",
    });
  });

  it("returns empty object for empty input", () => {
    expect(toKeyframe({})).toEqual({});
  });
});

describe("tweenTiming", () => {
  it("converts seconds to ms for duration and delay", () => {
    const opts = tweenTiming({ duration: 0.5, delay: 0.2 }, "enter");
    expect(opts.duration).toBe(500);
    expect(opts.delay).toBe(200);
  });

  it("falls back to defaults when fields are omitted", () => {
    const opts = tweenTiming({}, "enter");
    expect(opts.duration).toBe(300);
    expect(opts.delay).toBe(0);
    expect(opts.easing).toBe(DEFAULT_EASING.enter);
  });

  it("user easing wins over phase default", () => {
    const opts = tweenTiming({ easing: "linear" }, "enter");
    expect(opts.easing).toBe("linear");
  });

  it("uses phase-appropriate default easing", () => {
    expect(tweenTiming({}, "enter").easing).toBe(DEFAULT_EASING.enter);
    expect(tweenTiming({}, "exit").easing).toBe(DEFAULT_EASING.exit);
    expect(tweenTiming({}, "layout").easing).toBe(DEFAULT_EASING.layout);
  });

  it("always sets fill: both", () => {
    expect(tweenTiming({}, "enter").fill).toBe("both");
  });
});

describe("buildKeyframes — tween", () => {
  it("emits two keyframes (from, to) with linear default easing supplied by tweenTiming", () => {
    const { keyframes, options } = buildKeyframes(
      { opacity: 0 },
      { opacity: 1 },
      { duration: 0.3 },
      "enter",
    );
    expect(keyframes).toHaveLength(2);
    expect(keyframes[0]).toEqual({ opacity: 0 });
    expect(keyframes[1]).toEqual({ opacity: 1 });
    expect(options.duration).toBe(300);
  });
});

describe("buildKeyframes — spring", () => {
  it("emits a multi-keyframe sequence with linear easing (the spring curve IS the easing)", () => {
    const { keyframes, options } = buildKeyframes(
      { x: 0 },
      { x: 100 },
      { type: "spring", stiffness: 200, damping: 20 },
      "enter",
    );
    expect(keyframes.length).toBeGreaterThan(10);
    expect(options.easing).toBe("linear");
    expect(options.fill).toBe("both");
    expect(options.duration).toBeGreaterThan(0);
  });

  it("interpolates numeric keys across the spring progress curve", () => {
    const { keyframes } = buildKeyframes(
      { x: 0 },
      { x: 100 },
      /** Over-damped → monotonic settle, no oscillation. */
      { type: "spring", stiffness: 120, damping: 24 },
      "enter",
    );
    /** First keyframe should be at x: 0, last at ~x: 100. */
    expect(keyframes[0].transform).toMatch(/translateX\(0/);
    const lastTransform = keyframes.at(-1).transform;
    const lastX = Number(lastTransform.match(/translateX\(([-\d.]+)px\)/)[1]);
    expect(Math.abs(lastX - 100)).toBeLessThan(0.5);
  });

  it("under-damped springs include overshoot keyframes (values > 100% of the delta)", () => {
    const { keyframes } = buildKeyframes(
      { x: 0 },
      { x: 100 },
      { type: "spring", stiffness: 280, damping: 10 },
      "enter",
    );
    const xs = keyframes.map((k) => Number(k.transform.match(/translateX\(([-\d.]+)px\)/)[1]));
    expect(Math.max(...xs)).toBeGreaterThan(105);
  });

  it("non-numeric values are passed through (no interpolation)", () => {
    const { keyframes } = buildKeyframes(
      { height: 0, overflow: "hidden" },
      { height: 80, overflow: "hidden" },
      { type: "spring", stiffness: 200, damping: 20 },
      "enter",
    );
    for (const kf of keyframes) {
      expect(kf.overflow).toBe("hidden");
    }
  });
});

describe("REST", () => {
  it("provides resting defaults for every transform shorthand", () => {
    expect(REST.x).toBe(0);
    expect(REST.y).toBe(0);
    expect(REST.scale).toBe(1);
    expect(REST.rotate).toBe(0);
    expect(REST.opacity).toBe(1);
  });
});
