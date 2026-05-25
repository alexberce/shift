defmodule Shift.MixProject do
  use Mix.Project

  @version "0.1.3"
  @source_url "https://github.com/alexberce/shift"

  def project do
    [
      app: :shift,
      version: @version,
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      package: package(),
      description: description(),
      source_url: @source_url,
      homepage_url: @source_url,
      docs: docs()
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [
      {:phoenix_live_view, "~> 1.0"},
      {:jason, "~> 1.4"},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  defp description do
    """
    Animations for Phoenix LiveView, that just work. One <.animated> \
    component, smart defaults, real spring physics — animate enter, exit, \
    position and size straight from HEEx.\
    """
  end

  defp package do
    [
      maintainers: ["Alexandru Berce"],
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      files: ~w(lib assets/js mix.exs README.md LICENSE CHANGELOG.md .formatter.exs)
    ]
  end

  defp docs do
    [
      main: "Shift",
      extras: ["README.md", "CHANGELOG.md"]
    ]
  end
end
