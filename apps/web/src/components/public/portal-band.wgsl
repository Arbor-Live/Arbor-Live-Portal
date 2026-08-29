// Thin Arbor-green aurora for public portal heroes (booking track, quotes, etc.).
struct Uniforms {
  time: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = u.time * 0.22;
  let wave = sin((uv.x * 6.283185) + t) * 0.5 + 0.5;
  let wave2 = sin((uv.x * 3.1) - t * 1.3 + uv.y * 2.0) * 0.5 + 0.5;
  let falloff = smoothstep(1.05, 0.15, uv.y);
  // Arbor primary ~ linear green, lifted for bloom-less display
  let deep = vec3f(0.01, 0.06, 0.025);
  let mid = vec3f(0.04, 0.28, 0.09);
  let bright = vec3f(0.12, 0.72, 0.28);
  var rgb = mix(deep, mid, wave);
  rgb = mix(rgb, bright, wave2 * 0.45);
  let alpha = falloff * (0.35 + 0.4 * wave);
  return vec4f(rgb * alpha, alpha);
}
