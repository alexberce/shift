import { describe, it, expect } from "vitest";
import { measure } from "../js/measure.js";

/**
 * jsdom has no layout engine: every element reports `offsetParent === null`
 * and zero offset metrics. `measure` reads that as "not laid out" and returns
 * null, so to exercise the real measurement we stub a fake layout onto the
 * elements (an own property shadows jsdom's prototype getter).
 */
function stubLayout(el, { top = 0, left = 0, width = 0, height = 0, offsetParent }) {
  Object.defineProperties(el, {
    offsetTop: { value: top, configurable: true },
    offsetLeft: { value: left, configurable: true },
    offsetWidth: { value: width, configurable: true },
    offsetHeight: { value: height, configurable: true },
    offsetParent: { value: offsetParent ?? null, configurable: true },
  });
}

describe("measure", () => {
  it("returns null for an unlaid-out element (offsetParent is null)", () => {
    const el = document.createElement("div");
    expect(measure(el)).toBeNull();
  });

  it("sums offsetTop/offsetLeft up the offsetParent chain", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.appendChild(inner);
    document.body.appendChild(outer);

    // outer sits at (20, 100) with the body as its offsetParent;
    // inner sits at (3, 5) with outer as its offsetParent.
    stubLayout(outer, {
      left: 20,
      top: 100,
      width: 200,
      height: 50,
      offsetParent: document.body,
    });
    stubLayout(inner, {
      left: 3,
      top: 5,
      width: 40,
      height: 10,
      offsetParent: outer,
    });

    const m = measure(inner);

    // body-relative position = inner's offset summed with outer's
    expect(m).toMatchObject({
      top: 105,
      left: 23,
      width: 40,
      height: 10,
      parent: outer,
    });

    // local position = body-relative minus the parent's body-relative offset
    expect(m.localTop).toBe(5);
    expect(m.localLeft).toBe(3);

    document.body.removeChild(outer);
  });
});
