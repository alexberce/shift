# Shift

[![Hex.pm](https://img.shields.io/hexpm/v/shift.svg)](https://hex.pm/packages/shift)
[![Hex Docs](https://img.shields.io/badge/hex-docs-blueviolet)](https://hexdocs.pm/shift)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Animations for Phoenix LiveView, that just work.

One `<.animated>` component. Real spring physics. Smart defaults that read
your intent and fill in the rest. Animate enter, exit, position and size
straight from HEEx.

## Install

```elixir
def deps do
  [
    {:shift, "~> 0.1"}
  ]
end
```

In `assets/js/app.js`:

```js
import { init as initShift } from "../../deps/shift/assets/js/shift.js"
initShift()
```

Then `import Shift` wherever you want `<.animated>` available — usually once
in your `MyAppWeb.html_helpers/0`.

## What you get

Everything below runs through the same `<.animated>` component. You declare
what you want; Shift figures out the rest.

**Enter & exit.** `initial` is the state before entering, `exit` is the state
when LiveView removes the element. Opacity fade is added for free.

```heex
<.animated :if={@open} initial={%{scale: 0.9}} exit={%{scale: 0.95}}>
  Modal contents
</.animated>
```

**Smart-resolved targets.** Mention a property in `initial`, leave it out of
`animate` — Shift fills the target with its natural resting value.

```heex
<.animated initial={%{y: 16}}>
  Slides up from y=16 to y=0 (auto-resolved). Opacity fades 0 -> 1 (default).
</.animated>
```

**Real springs, not easings.** A solver runs the ODE and bakes the motion
into keyframes. Interrupt, overshoot, settle — it all behaves like a
physical object.

```heex
<.animated
  initial={%{scale: 0.9}}
  transition={%{type: :spring, stiffness: 260, damping: 20}}
>
  ...
</.animated>
```

**Layout animations (FLIP), automatic.** When an element's position changes
between renders, Shift animates it from the old position to the new one. No
opt-in needed.

```heex
<.animated :for={item <- @sorted_items} id={item.id}>
  {item.label}
</.animated>
```

**Height & width animations.** Animate from `height: 0` and Shift handles
the rest — padding/margin/border collapse with the box so accordions don't
plateau, `overflow: hidden` is held throughout so content doesn't spill.

```heex
<.animated :if={@open} initial={%{height: 0}} exit={%{height: 0}}>
  Expanding panel of any height.
</.animated>
```

**Any HTML tag.** Default is `<div>`, but pass `as=` to render anything —
useful for animating list items, inline text, semantic sections.

```heex
<ul>
  <.animated :for={item <- @items} as="li" id={item.id} initial={%{y: 8}}>
    {item.label}
  </.animated>
</ul>
```

## `<.animated>` attributes

| Attribute    | Type   | Default | Purpose                                                                                         |
| ------------ | ------ | ------- | ----------------------------------------------------------------------------------------------- |
| `as`         | string | `"div"` | HTML tag to render — any valid element name (`"li"`, `"span"`, `"section"`, ...).               |
| `initial`    | map    | `nil`   | Style values applied before the enter animation. Drives the enter "from".                       |
| `animate`    | map    | `nil`   | Target style values for enter. Auto-resolved from `initial` if omitted.                         |
| `exit`       | map    | `nil`   | Style values to animate to when LiveView removes the element.                                   |
| `transition` | map    | `%{}`   | Tween: `%{duration: s, delay: s, easing: "ease-in-out"}` — `easing` is any CSS easing string. Spring: `%{type: :spring, stiffness: 260, damping: 20, mass: 1}`. |
| `disable`    | list   | `[]`    | Opt out of inferred behaviors: `:fade`, `:position`, `:size`.                                   |
| `class`      | string | `nil`   | Standard HTML class attribute.                                                                  |

All other HTML attributes (`id`, `data-*`, `aria-*`, ...) pass through to
the underlying `<div>` via `:global`.

### Transform shorthands

Inside any of the value maps you can use shorthand names for common CSS
transform functions. They compose into a single CSS `transform` string:

| Shorthand                       | Unit | Becomes                  |
| ------------------------------- | ---- | ------------------------ |
| `x`, `y`, `z`                   | px   | `translateX/Y/Z(Npx)`    |
| `scale`, `scaleX`, `scaleY`     | —    | `scale(N)` / `scaleX(N)` |
| `rotate`, `rotateX`, `rotateY`  | deg  | `rotate(Ndeg)` etc.      |
| `skewX`, `skewY`                | deg  | `skewX/Y(Ndeg)`          |

CSS properties (`opacity`, `background-color`, `height`, ...) work as-is.
Bare numbers on layout properties (`height`, `width`, `padding-*`,
`margin-*`, `border-*-width`) get a `px` suffix.

## How it works

A single `MutationObserver` watches the document. Every element with a
`data-shift` attribute is tracked through three lifecycle phases:

- **Enter** — when the element first appears (initial render or LiveView
  patch). Reads `initial` / `animate` from the spec and plays the
  transition.
- **Exit** — when LiveView removes the element. Triggered by a `shift:exit`
  event dispatched from `phx-remove`; LiveView keeps the node alive for the
  exit duration before actually removing it.
- **Layout** — between renders, if an element's position or size changed, a
  FLIP / size animation runs automatically. Opt out per-element with
  `disable={[:position]}` / `disable={[:size]}`.

There's some additional finesse for tricky cases — cascading exits stay in
order even when morphdom shuffles kept-alive nodes, sliding-window stacks
lift exits out of flow to avoid a phantom slot, and `overflow: hidden` is
held through size animations so content doesn't spill mid-grow. None of
this surfaces as API; it just works.

## Requirements

- Elixir ~> 1.15
- Phoenix LiveView ~> 1.0
- Modern browser with the Web Animations API (every browser since 2020)
