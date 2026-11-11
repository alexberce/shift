import { describe, it, expect, beforeEach } from "vitest";
import { relayout } from "../js/relayout.js";
import { withoutLayoutAnimations } from "../js/measure.js";
import { TRACKED } from "../js/state.js";

function fakeAnimation(keyframes) {
  return {
    effect: { keyframes },
    playState: "running",
    cancelled: false,
    cancel() {
      this.playState = "idle";
      this.cancelled = true;
    },
    addEventListener() {},
  };
}

/** offsetHeight is the first keyframe height while a running layout animation has its effect attached. */
function row(naturalHeight) {
  const el = document.createElement("div");
  el.dataset.shift = "{}";
  document.body.appendChild(el);

  el.naturalHeight = naturalHeight;
  el.started = [];
  el.animate = (keyframes) => {
    const anim = fakeAnimation(keyframes);
    el.started.push(anim);
    return anim;
  };

  const height = () => {
    const anim = el.__shiftFlip;
    const animated = anim?.effect && anim.playState === "running" && anim.effect.keyframes[0].height;
    return animated ? parseFloat(animated) : el.naturalHeight;
  };

  Object.defineProperties(el, {
    offsetTop: { value: 10, configurable: true },
    offsetLeft: { value: 0, configurable: true },
    offsetWidth: { value: 400, configurable: true },
    offsetHeight: { get: height, configurable: true },
    offsetParent: { value: document.body, configurable: true },
  });

  TRACKED.add(el);
  return el;
}

function storedLayout(height) {
  return { top: 10, left: 0, width: 400, height, localTop: 10, localLeft: 0, parent: document.body };
}

beforeEach(() => {
  TRACKED.clear();
  document.body.innerHTML = "";
});

describe("relayout", () => {
  it("does not restart a running size animation when the layout did not change", () => {
    const el = row(98);
    el.__shiftLayout = storedLayout(98);
    const running = fakeAnimation([{ height: "87px" }, { height: "98px" }]);
    el.__shiftFlip = running;

    relayout();

    expect(el.started).toHaveLength(0);
    expect(running.cancelled).toBe(false);
    expect(el.__shiftLayout.height).toBe(98);
  });

  it("restarts from the stored height when the layout changes during a size animation", () => {
    const el = row(118);
    el.__shiftLayout = storedLayout(98);
    const running = fakeAnimation([{ height: "87px" }, { height: "98px" }]);
    el.__shiftFlip = running;

    relayout();

    expect(running.cancelled).toBe(true);
    expect(el.started).toHaveLength(1);
    const heights = el.started[0].effect.keyframes.map((k) => k.height).filter(Boolean);
    expect(heights[0]).toBe("98px");
    expect(heights[heights.length - 1]).toBe("118px");
    expect(el.__shiftLayout.height).toBe(118);
  });
});

describe("withoutLayoutAnimations", () => {
  it("measures without running layout animations and reattaches them", () => {
    const el = row(98);
    const running = fakeAnimation([{ height: "87px" }, { height: "98px" }]);
    const effect = running.effect;
    el.__shiftFlip = running;

    expect(el.offsetHeight).toBe(87);
    expect(withoutLayoutAnimations(() => el.offsetHeight)).toBe(98);
    expect(running.effect).toBe(effect);
    expect(el.offsetHeight).toBe(87);
  });
});
