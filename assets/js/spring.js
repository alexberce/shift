/**
 * Numerical spring solver.
 *
 * Integrates a damped-spring ODE with semi-implicit (symplectic) Euler at
 * 240 Hz, sampling every 4 steps into a `progress` array of values in [0, 1+]
 * (overshoot is naturally represented as progress > 1). The caller multiplies
 * each sample by the visual delta to build keyframes; WAAPI then plays them
 * with `easing: "linear"` so the spring curve drives the motion verbatim.
 *
 *   stiffness  - Hooke's-law constant. Higher = pulls back harder = faster.
 *   damping    - velocity-proportional resistance. Higher = settles sooner.
 *   mass       - inertia. Higher = slower to start AND stop.
 *
 * Critical damping = 2 * sqrt(stiffness * mass). damping >= critical -> no
 * overshoot. damping < critical -> oscillates and overshoots.
 */
export function solveSpring(transition) {
  const stiffness = transition.stiffness ?? 170;
  const damping = transition.damping ?? 22;
  const mass = transition.mass ?? 1;

  const dt = 1 / 240;
  const sampleEvery = 4;
  const restDelta = 0.001;
  const maxSteps = 240 * 6;

  let displacement = 1;
  let velocity = 0;
  const progress = [0];
  let steps = 0;

  while (steps < maxSteps) {
    const accel = (-stiffness * displacement - damping * velocity) / mass;
    velocity += accel * dt;
    displacement += velocity * dt;
    steps += 1;
    if (steps % sampleEvery === 0) progress.push(1 - displacement);
    if (Math.abs(displacement) < restDelta && Math.abs(velocity) < restDelta)
      break;
  }
  if (steps % sampleEvery !== 0) progress.push(1 - displacement);

  return { progress, durationMs: steps * dt * 1000 };
}
