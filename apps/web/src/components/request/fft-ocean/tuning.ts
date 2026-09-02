/**
 * Canonical parameter table copied from front/fft-ocean-1 DEFAULT_SETTINGS,
 * settings constants, uniform-packing, and bloom-pass.
 *
 * Particle colors retinted to Arbor primary green (oklch 0.527 0.154 150)
 * — linear-ish RGB punched for the additive particle + bloom path.
 */
export const OCEAN_TUNING = {
  simulation: {
    oceanSize: 200,
    worldSize: 400,
    timeScale: 0.6,
    spectrumTimeScale: 0.5,
    windSpeed: 12.9,
    windAngle: 4.83,
    amplitude: 1.3,
    choppiness: 1.51,
    displacementScale: 0.005,
    foamThreshold: 0,
  },
  particles: {
    pointSize: 0.75,
    fadeNear: 60,
    fadeFar: 250,
    fadePower: 3.2,
    // Deep canopy base
    oceanColor: [0.004, 0.028, 0.01, 0] as const,
    // Crest / fresnel — bright Arbor green
    neonColor: [0.12, 0.92, 0.32, 0] as const,
    // Breaking foam — mint lift toward primary-foreground
    foamColor: [0.55, 0.95, 0.72, 0] as const,
  },
  camera: {
    // Gallery reframe: the docs canvas is much taller than front's hero strip.
    // Raising and backing off the rig keeps the horizon in the upper third.
    eye: [0, 30, 90] as const,
    target: [0, 5, 55] as const,
    pitchDegrees: -10,
    fovDegrees: 90,
    near: 0.1,
    far: 2000,
  },
  bloom: {
    threshold: 0.28,
    smoothWidth: 0.01,
    strength: 0.11,
    radius: 0.46,
    levels: 5,
    kernelRadii: [6, 10, 14, 18, 22] as const,
  },
} as const;

/**
 * Per-theme particle palettes. `dark` is the canonical Arbor-green ocean;
 * `light` is the pale/white ocean used against light-mode backgrounds.
 */
export const OCEAN_PALETTES = {
  dark: {
    oceanColor: OCEAN_TUNING.particles.oceanColor,
    neonColor: OCEAN_TUNING.particles.neonColor,
    foamColor: OCEAN_TUNING.particles.foamColor,
    gain: [1, 1, 1, 1] as const,
  },
  light: {
    oceanColor: [0.98, 0.99, 0.975, 0] as const,
    neonColor: [1, 1, 1, 0] as const,
    foamColor: [1, 1, 1, 0] as const,
    // Lift the near-white particles (the shader halves the base color and
    // uses tiny base alphas) so the light ocean reads clearly on a pale bg.
    gain: [2, 2, 2, 4] as const,
  },
} as const;

export type OceanPaletteKey = keyof typeof OCEAN_PALETTES;

/** Matches front's `gaussianCoefficients`: sigma=radius/3, no normalization pass. */
export function gaussianCoefficients(kernelRadius: number): readonly number[] {
  return Array.from({ length: 24 }, (_, index) =>
    index < kernelRadius
      ? (0.39894 * Math.exp((-0.5 * index * index) / (kernelRadius / 3) ** 2)) /
        (kernelRadius / 3)
      : 0
  );
}
