# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning:
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
