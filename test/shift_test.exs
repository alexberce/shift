defmodule ShiftTest do
  use ExUnit.Case, async: true

  import Phoenix.LiveViewTest
  import Phoenix.Component

  defp data_shift_json(html) do
    [_, json] = Regex.run(~r/data-shift="([^"]+)"/, html)

    json
    |> String.replace("&quot;", "\"")
    |> Jason.decode!()
  end

  defp phx_remove_string(html) do
    [_, attr] = Regex.run(~r/phx-remove="([^"]+)"/, html)
    attr
  end

  describe "data-shift JSON serialization" do
    test "drops nil / empty spec fields (no `null` or empty maps in JSON)" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated initial={%{y: 16}} />
        """)

      assert data_shift_json(html) == %{"initial" => %{"y" => 16}}
    end

    test "serializes initial, animate, exit and transition together" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated
          initial={%{y: 16}}
          animate={%{y: 0}}
          exit={%{y: -16}}
          transition={%{duration: 0.3}}
        />
        """)

      assert data_shift_json(html) == %{
               "initial" => %{"y" => 16},
               "animate" => %{"y" => 0},
               "exit" => %{"y" => -16},
               "transition" => %{"duration" => 0.3}
             }
    end

    test "serializes spring transition (atom :spring → string 'spring')" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated transition={%{type: :spring, stiffness: 200, damping: 20}} />
        """)

      assert data_shift_json(html) == %{
               "transition" => %{
                 "type" => "spring",
                 "stiffness" => 200,
                 "damping" => 20
               }
             }
    end

    test "drops disable when empty list" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated initial={%{y: 16}} disable={[]} />
        """)

      refute Map.has_key?(data_shift_json(html), "disable")
    end

    test "keeps disable when populated" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated initial={%{y: 16}} disable={[:position]} />
        """)

      assert data_shift_json(html)["disable"] == ["position"]
    end
  end

  describe "rendered HTML" do
    test "renders a div with the user's class and id" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated id="card-7" class="rounded-box bg-base-200" initial={%{opacity: 0}} />
        """)

      assert html =~ ~r/<div[^>]*id="card-7"/
      assert html =~ ~r/<div[^>]*class="rounded-box bg-base-200"/
    end

    test "renders an arbitrary tag via the `as` attribute" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated as="li" initial={%{y: 16}}>Item</Shift.animated>
        """)

      assert html =~ ~r/<li[^>]*data-shift=/
      assert html =~ "Item"
      assert html =~ ~r/<\/li>/
      refute html =~ "<div"
    end

    test "renders as span (inline)" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated as="span" initial={%{opacity: 0}}>Inline</Shift.animated>
        """)

      assert html =~ ~r/<span[^>]*data-shift=/
      assert html =~ "Inline"
    end

    test "renders as section, preserving class and data-shift" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated as="section" class="hero" initial={%{y: 24}} />
        """)

      assert html =~ ~r/<section[^>]*class="hero"[^>]*data-shift=/
    end

    test "renders inner_block content inside the div" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated initial={%{y: 16}}>Hello</Shift.animated>
        """)

      assert html =~ "Hello"
    end

    test "passes through arbitrary attributes via :rest" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated initial={%{y: 16}} data-test-tag="spec" />
        """)

      assert html =~ ~r/data-test-tag="spec"/
    end
  end

  describe "phx-remove (exit deferral)" do
    test "tween exit-time matches the user duration in milliseconds" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated exit={%{y: 16}} transition={%{duration: 0.5}} />
        """)

      attr = phx_remove_string(html)
      # JS commands serialize as JSON; the runtime escapes the quotes — look
      # for the time argument inside.
      assert attr =~ ~r/&quot;time&quot;:500\b/
    end

    test "default tween duration is 0.3s when not specified" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated exit={%{opacity: 0}} />
        """)

      attr = phx_remove_string(html)
      assert attr =~ ~r/&quot;time&quot;:300\b/
    end

    test "spring exit-time is estimated from damping (settle envelope)" do
      # exit_time formula for spring: round(13.8 * mass / damping * 1000) + 80
      # mass=1, damping=20: round(13.8 / 20 * 1000) + 80 = 690 + 80 = 770
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated
          exit={%{x: 40}}
          transition={%{type: :spring, stiffness: 200, damping: 20, mass: 1}}
        />
        """)

      attr = phx_remove_string(html)
      assert attr =~ ~r/&quot;time&quot;:770\b/
    end

    test "spring exit-time is capped at 6000 ms even for tiny damping" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated
          exit={%{x: 40}}
          transition={%{type: :spring, stiffness: 200, damping: 0.1, mass: 1}}
        />
        """)

      attr = phx_remove_string(html)
      assert attr =~ ~r/&quot;time&quot;:6000\b/
    end

    test "dispatches the shift:exit event" do
      assigns = %{}

      html =
        rendered_to_string(~H"""
        <Shift.animated exit={%{opacity: 0}} />
        """)

      attr = phx_remove_string(html)
      assert attr =~ "shift:exit"
    end
  end
end
