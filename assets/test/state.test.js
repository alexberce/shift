import { describe, it, expect, beforeEach } from "vitest";
import { readSpec, SEEN, TRACKED } from "../js/state.js";

function makeEl(spec) {
  const el = document.createElement("div");
  if (spec !== undefined) el.dataset.shift = JSON.stringify(spec);
  return el;
}

describe("readSpec", () => {
  it("parses JSON from the data-shift attribute", () => {
    const el = makeEl({ initial: { x: 16 }, transition: { duration: 0.3 } });
    expect(readSpec(el)).toEqual({
      initial: { x: 16 },
      transition: { duration: 0.3 },
    });
  });

  it("caches the parsed spec keyed on the raw string", () => {
    const el = makeEl({ initial: { x: 16 } });
    const first = readSpec(el);
    const second = readSpec(el);
    /** Same reference = cached, no re-parse. */
    expect(first).toBe(second);
  });

  it("re-parses when the raw data-shift string changes (server re-render)", () => {
    const el = makeEl({ transition: { stiffness: 200 } });
    const first = readSpec(el);
    el.dataset.shift = JSON.stringify({ transition: { stiffness: 400 } });
    const second = readSpec(el);
    expect(first).not.toBe(second);
    expect(second.transition.stiffness).toBe(400);
  });

  it("returns null for invalid JSON without throwing", () => {
    const el = document.createElement("div");
    el.dataset.shift = "{not json";
    expect(readSpec(el)).toBeNull();
  });

  it("returns null for missing data-shift attribute (no throw)", () => {
    const el = document.createElement("div");
    expect(readSpec(el)).toBeNull();
  });
});

describe("SEEN / TRACKED sets exist and are usable", () => {
  beforeEach(() => {
    /**
     * Tests share module-level singletons; clear TRACKED before each test
     * so cross-test pollution doesn't bite.
     */
    TRACKED.clear();
  });

  it("TRACKED is a Set, SEEN is a WeakSet (membership only)", () => {
    const el = document.createElement("div");
    TRACKED.add(el);
    SEEN.add(el);
    expect(TRACKED.has(el)).toBe(true);
    expect(SEEN.has(el)).toBe(true);
  });
});
