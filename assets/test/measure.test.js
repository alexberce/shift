import { describe, it, expect } from "vitest";
import { measure } from "../js/measure.js";

/**
 * jsdom doesn't implement layout, so offsetTop/Left/Width/Height are all 0.
 * These tests verify the shape and the offsetParent walk, not actual pixels.
 */
describe("measure", () => {
  it("returns {top, left, width, height} for a detached element (all 0 in jsdom)", () => {
    const el = document.createElement("div");
    expect(measure(el)).toEqual({ top: 0, left: 0, width: 0, height: 0 });
  });

  it("walks the offsetParent chain (sums offsetTop/Left)", () => {
    /**
     * jsdom returns 0 for offsetTop on every element, so we just verify
     * the loop terminates and doesn't crash on nested DOM.
     */
    const outer = document.createElement("div");
    const middle = document.createElement("div");
    const inner = document.createElement("div");
    outer.appendChild(middle);
    middle.appendChild(inner);
    document.body.appendChild(outer);

    const m = measure(inner);
    expect(m).toMatchObject({
      top: expect.any(Number),
      left: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });

    document.body.removeChild(outer);
  });
});
