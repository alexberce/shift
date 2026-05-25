/**
 * Shift — animations for Phoenix LiveView, that just work.
 *
 * One MutationObserver watches the whole document. Any element rendered with
 * a `data-shift` attribute (emitted by the `<.animated>` component) is
 * animated in when it appears, out when LiveView removes it (via a
 * `shift:exit` event), and automatically animates its mid-life changes —
 * position (FLIP) and size (height/width) — when those change.
 *
 * The inferred mid-life animations are on by default. Opt out per element
 * with `disable={[:position]}` / `disable={[:size]}` / `disable={[:position,
 * :size]}`.
 *
 * Transitions are tweens by default (duration + easing). Pass
 * `transition: %{type: :spring, ...}` and the runtime simulates a real
 * spring and bakes the motion into keyframes.
 *
 * This file is the public entry point. The work is split across:
 *   state.js      — SEEN / TRACKED / readSpec cache
 *   measure.js    — body-relative layout measurement
 *   spring.js     — pure numerical spring solver
 *   keyframes.js  — pure keyframe construction helpers
 *   enter.js      — enter animation + smart defaults
 *   exit.js       — exit animation + cascade restore + pin-out-of-flow
 *   relayout.js   — inferred FLIP / size animations
 */

import { enter } from "./enter.js";
import { exit } from "./exit.js";
import { relayout } from "./relayout.js";
import { TRACKED } from "./state.js";
import { measure } from "./measure.js";

function scan(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches("[data-shift]")) enter(node);
  node.querySelectorAll("[data-shift]").forEach(enter);
}

/**
 * Coalesce a burst of MutationObserver callbacks into a single relayout per
 * frame.
 *
 * LiveView patches the DOM in bursts — a single user interaction can produce
 * dozens of MutationRecords (text-node updates, attribute flips, child
 * re-insertions) within a few ms. Running relayout per record would mean
 * dozens of full passes over every animated element on the page, each one
 * forcing a layout read. Coalescing to one pass per frame means the
 * FLIP/size measurements all observe the same post-burst layout, and the
 * heavy work runs once.
 */
let relayoutScheduled = false;
function scheduleRelayout() {
  if (relayoutScheduled) return;
  relayoutScheduled = true;
  requestAnimationFrame(() => {
    relayoutScheduled = false;
    relayout();
  });
}

/**
 * Wire the runtime up to the page. Call once on page load, after the DOM is
 * parsed (e.g. from your app.js after liveSocket.connect()).
 */
export function init() {
  /** Elements present in the initial server render. */
  document.querySelectorAll("[data-shift]").forEach(enter);

  /**
   * Elements LiveView patches in later, plus inferred animations for
   * anything whose position or size changed.
   */
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) scan(node);
    }
    scheduleRelayout();
  }).observe(document.body, { childList: true, subtree: true });

  /** Exit animations, dispatched by the component's `phx-remove`. */
  document.addEventListener("shift:exit", (event) => exit(event.target));

  /**
   * Window resize reflows the page without firing any DOM mutations, so the
   * MutationObserver never wakes up and every tracked element's cached
   * `__shiftLayout` goes stale. The next real layout change would then FLIP
   * against the pre-resize positions, animating the resize delta. Refresh
   * every cache on resize (rAF-coalesced for noisy resize streams).
   */
  let resizeScheduled = false;
  window.addEventListener("resize", () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      for (const el of TRACKED) {
        if (!el.isConnected) continue;
        if (el.__shiftTransitioning) continue;
        el.__shiftLayout = measure(el);
      }
    });
  });
}
