# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning:
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.1.4

### Fixed

- Layout cache now seeds when an element transitions from hidden to
  visible. The v0.1.3 fix stopped caching a bogus `(0, 0)` for elements
  inside a `display: none` ancestor, but the cache stayed empty until
  the first DOM mutation while visible — and by that point the move
  had already happened, leaving FLIP without a pre-move position to
  animate from. An `IntersectionObserver` now watches every tracked
  element and seeds the cache the moment visibility changes.

## v0.1.3

### Fixed

- Elements that mount inside a `display: none` ancestor no longer cache
  a bogus `(0, 0)` layout. The next time they appear and then change,
  FLIP would diff against the stale zero and fly the element in from
  the top-left of the page. `measure` now returns `null` when the
  element has no layout, and the cache stays empty until the element
  is actually visible.
- Cross-parent moves where the element becomes the *first* child of
  its new parent now animate. The previous local-position FLIP gate
  saw `localTop = 0` in both the old and new parent and skipped the
  animation entirely. Relayout now also FLIPs whenever the element's
  parent itself changes, using the body-relative delta for the
  transform amount.

## v0.1.2

### Fixed

- Position FLIP is now gated by the element's position relative to its
  immediate parent, not its body-relative offset. Previously, any layout
  change that shrank content above a tracked list — a delete in one
  demo, for instance — would shift everything below it in body
  coordinates, and Shift would FLIP every unrelated element down the
  page back to its old absolute position. Now only elements whose
  position within their own parent changes get animated; the body-
  relative delta is still what the FLIP translates by, so bottom-
  anchored layouts (toast stacks) keep working.
- Cached layouts now refresh on window resize. The MutationObserver
  doesn't fire on a resize, so previously every tracked element's
  `__shiftLayout` went stale and the next real layout change would FLIP
  against the pre-resize positions — animating the resize delta into
  whatever change came next. A debounced resize listener now remeasures
  every tracked element so the next FLIP starts from the current layout.

## v0.1.1

### Fixed

- Sibling layout caches now refresh on every animation frame during a
  size-collapsing exit, and are nulled when the element is finally
  removed. Previously, the post-removal relayout would FLIP each
  neighbor by the full reflow distance, snapping them back to their
  pre-exit positions and animating up again.

### Added

- Special-case collapse for `<tr>` exits. Because `display: table-row`
  derives its height from the tallest cell rather than its own CSS
  `height`, each cell's padding, `font-size`, and `line-height` are
  now animated to zero alongside the row's exit. The row's intrinsic
  height shrinks with the animation while the table layout stays
  intact.
- `fontSize` and `lineHeight` added to `PX_PROPS` so the keyframe
  builder emits them with a `px` unit instead of as bare numbers
  (which WAAPI silently ignores).

## v0.1.0

Initial release.

### Added

- `<.animated>` component — one component for enter, exit, layout (FLIP),
  and size animations.
- Tween transitions with phase-aware easing defaults (ease-out on enter,
  ease-in-out on exit and layout).
- Spring transitions backed by a numerical ODE solver — overshoot and
  damping behave physically.
- Smart defaults: opacity fade by default, auto-resolved targets when only
  `initial` is given, padding/margin/border collapse on size animations.
- Inferred mid-life animations — position and size changes animate
  automatically; opt out per element with `disable: [:position, :size]`.
- Server-driven exits via `phx-remove`, with cascading-order preservation
  and sliding-window stack handling out of the box.
