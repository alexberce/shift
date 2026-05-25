defmodule Shift do
  @moduledoc """
  Animations for Phoenix LiveView, that just work.

  Render a `<.animated>` element and the client runtime animates it in
  when it enters the DOM, animates it out when LiveView removes it, and
  FLIP-animates it to its new position whenever the layout shifts in
  between. The whole API is one component.

      <.animated
        :for={card <- @cards}
        id={card.id}
        initial={%{y: 16, scale: 0.95}}
        exit={%{y: -16, scale: 0.95}}
        transition={%{type: :spring}}
      >
        {card.label}
      </.animated>

  `initial`, `animate` and `exit` take a map of style values. Alongside
  plain CSS properties (`opacity`, `background-color`, `height`, ...) you
  can use shorthands for common CSS transforms — `x`, `y`, `scale`,
  `rotate` and friends — which the runtime composes into a single CSS
  `transform` string.

  Transitions are tweens by default (`duration`, `delay`, `easing`). Pass
  `transition: %{type: :spring, stiffness: 260, damping: 20, mass: 1}` and
  the runtime solves the spring ODE and bakes the curve into keyframes —
  overshoot, under-/over-damped behavior, and interrupted motion all stay
  physical.

  See the [README](readme.html) for a tour of the common patterns
  (enter/exit, smart-resolved targets, FLIP, height animations).
  """
  use Phoenix.Component

  alias Phoenix.LiveView.JS

  @default_duration 0.3

  attr :initial, :map, default: nil, doc: "style values applied before the enter animation"
  attr :animate, :map, default: nil, doc: "style values to animate to once in the DOM"
  attr :exit, :map, default: nil, doc: "style values to animate to when LiveView removes the element"

  attr :disable, :list,
    default: [],
    doc:
      "inferred mid-life animations to opt out of for this element. " <>
        "Valid atoms: :position, :size. Defaults to none disabled."

  attr :transition, :map,
    default: %{},
    doc: """
    Tween: `%{duration: seconds, delay: seconds, easing: "ease-in-out"}` \
    where `easing` is any CSS easing-function string \
    (`"ease"`, `"linear"`, `"cubic-bezier(...)"`, `"steps(...)"`, ...). \
    Spring: `%{type: :spring, stiffness: 260, damping: 20, mass: 1}`.\
    """

  attr :class, :any, default: nil
  attr :rest, :global
  slot :inner_block

  def animated(assigns) do
    spec =
      %{
        initial: assigns.initial,
        animate: assigns.animate,
        exit: assigns.exit,
        disable: assigns.disable,
        transition: assigns.transition
      }
      |> Enum.reject(fn {_key, value} -> is_nil(value) or value == %{} or value == [] end)
      |> Map.new()

    assigns = assign(assigns, :shift, Jason.encode!(spec))

    ~H"""
    <div
      class={@class}
      data-shift={@shift}
      phx-remove={exit_js(@transition)}
      {@rest}
    >
      {render_slot(@inner_block)}
    </div>
    """
  end

  # The transition here is visually a no-op — its only job is to make LiveView
  # defer the actual node removal by `time` ms, which is the window the JS
  # runtime uses to play the real exit animation.
  defp exit_js(transition) do
    JS.dispatch("shift:exit")
    |> JS.transition({"shift-exiting", "", ""}, time: exit_time(transition))
  end

  # Tweens carry an explicit duration. Springs settle on their own, so we
  # estimate the settle time from the parameters: the oscillation envelope
  # decays as e^(-t * damping / 2*mass), reaching ~0.1% at
  # t ≈ 13.8 * mass / damping. Capped at 6 s so a misconfigured spring
  # can't strand a kept-alive node in the DOM.
  defp exit_time(%{type: :spring} = transition) do
    mass = Map.get(transition, :mass, 1.0)
    damping = Map.get(transition, :damping, 22.0)
    min(round(13.8 * mass / damping * 1000) + 80, 6000)
  end

  defp exit_time(transition) do
    seconds = Map.get(transition, :duration, @default_duration)
    round(seconds * 1000)
  end
end
