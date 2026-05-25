import { describe, it, expect } from "vitest";
import { solveSpring } from "../js/spring.js";

describe("solveSpring", () => {
  it("starts at progress 0 and ends within rest tolerance of 1", () => {
    const { progress } = solveSpring({ stiffness: 200, damping: 20, mass: 1 });
    expect(progress[0]).toBe(0);
    expect(Math.abs(progress.at(-1) - 1)).toBeLessThan(0.001);
  });

  it("does NOT overshoot when over-damped (damping > 2*sqrt(stiffness*mass))", () => {
    /**
     * Critical damping for stiffness=120, mass=1 is 2*sqrt(120) ≈ 21.9.
     * damping=24 is over-critical → monotonic settle, no overshoot.
     */
    const { progress } = solveSpring({ stiffness: 120, damping: 24, mass: 1 });
    const max = Math.max(...progress);
    /** Allow tiny float noise from Euler integration. */
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it("DOES overshoot when under-damped", () => {
    /**
     * Critical damping for stiffness=280, mass=1 ≈ 33.5. damping=10 is
     * well under-critical → strong overshoot expected.
     */
    const { progress } = solveSpring({ stiffness: 280, damping: 10, mass: 1 });
    const max = Math.max(...progress);
    expect(max).toBeGreaterThan(1.2);
  });

  it("snappier presets (higher stiffness, near-critical damping) settle faster", () => {
    const gentle = solveSpring({ stiffness: 120, damping: 24, mass: 1 });
    const snappy = solveSpring({ stiffness: 400, damping: 34, mass: 1 });
    expect(snappy.durationMs).toBeLessThan(gentle.durationMs);
  });

  it("uses defaults when stiffness/damping/mass omitted", () => {
    const { progress, durationMs } = solveSpring({});
    expect(progress[0]).toBe(0);
    expect(durationMs).toBeGreaterThan(0);
    expect(Math.abs(progress.at(-1) - 1)).toBeLessThan(0.001);
  });

  it("stops within maxSteps (no infinite loop) even for very low damping", () => {
    /**
     * maxSteps is 240*6 = 1440 internal iterations; durationMs is
     * steps * dt where dt = 1/240, so the cap is 6000ms.
     */
    const { durationMs } = solveSpring({ stiffness: 400, damping: 1, mass: 1 });
    expect(durationMs).toBeLessThanOrEqual(6000);
  });
});
