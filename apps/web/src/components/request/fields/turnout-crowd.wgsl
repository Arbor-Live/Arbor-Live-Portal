struct Uniforms {
  resolution: vec2f,
  time: f32,
  energy: f32,
  animate: f32,
  count: f32,
  danceMax: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const ARC_START: f32 = 0.314159265;
const ARC_END: f32 = 2.827433385;
const ORIGIN_Y: f32 = 24.0;

fn rowCapacity(row: u32) -> u32 {
  return 7u + row * 5u;
}

fn personBase(index: u32, energy: f32) -> vec2f {
  var remaining = index;
  var row = 0u;
  loop {
    let capacity = rowCapacity(row);
    if remaining < capacity {
      let capF = f32(capacity);
      let t = select(0.5, f32(remaining) / max(capF - 1.0, 1.0), capacity > 1u);
      let angle = ARC_START + t * (ARC_END - ARC_START);
      let radius = 18.0 + f32(row) * 12.0 + energy * 2.5;
      return vec2f(cos(angle) * radius, ORIGIN_Y + sin(angle) * radius * 0.72);
    }
    remaining -= capacity;
    row += 1u;
  }
}

fn easeInOut(t: f32) -> f32 {
  if t < 0.5 {
    return 2.0 * t * t;
  }
  let x = -2.0 * t + 2.0;
  return 1.0 - x * x / 2.0;
}

fn danceKeyframe(eased: f32, sway: f32, bounce: f32) -> vec2f {
  let segment = min(eased * 4.0, 4.0);
  let i = min(3u, u32(floor(segment)));
  let f = segment - floor(segment);
  var a = vec2f(0.0);
  var b = vec2f(0.0);
  switch i {
    case 0u: {
      a = vec2f(0.0, 0.0);
      b = vec2f(sway, -bounce);
    }
    case 1u: {
      a = vec2f(sway, -bounce);
      b = vec2f(-sway * 0.5, bounce * 0.2);
    }
    case 2u: {
      a = vec2f(-sway * 0.5, bounce * 0.2);
      b = vec2f(sway * 0.35, -bounce * 0.55);
    }
    case 3u: {
      a = vec2f(sway * 0.35, -bounce * 0.55);
      b = vec2f(0.0, 0.0);
    }
    default: {
      a = vec2f(0.0, 0.0);
      b = vec2f(0.0, 0.0);
    }
  }
  return mix(a, b, f);
}

fn danceOffset(index: u32, energy: f32) -> vec2f {
  if u.animate < 0.5 || u.count > u.danceMax {
    return vec2f(0.0);
  }
  let bounce = 2.0 + energy * 0.5;
  let sway = 1.0 + energy * 0.4;
  let phase = f32(index) * 0.31;
  let duration = 0.8 + f32(index % 4u) * 0.1;
  let delay = phase * 0.07;
  let elapsed = u.time - delay;
  if elapsed < 0.0 {
    return vec2f(0.0);
  }
  let normalized = fract(elapsed / duration);
  return danceKeyframe(easeInOut(normalized), sway, bounce);
}

fn dotColor(index: u32, energy: f32) -> vec3f {
  let primary = vec3f(0.12, 0.72, 0.28);
  let primaryDim = vec3f(0.08, 0.5, 0.2);
  let amber = vec3f(0.98, 0.65, 0.09);
  let orange = vec3f(0.98, 0.55, 0.11);
  if energy >= 4.0 {
    let m = index % 3u;
    if m == 0u { return amber; }
    if m == 1u { return primary; }
    return orange;
  }
  if energy >= 3.0 {
    if index % 2u == 0u { return primary; }
    return primaryDim;
  }
  return primary;
}

fn quadCorner(vertexIndex: u32) -> vec2f {
  let cornerIndex = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u)[vertexIndex % 6u];
  switch cornerIndex {
    case 0u: { return vec2f(-1.0, -1.0); }
    case 1u: { return vec2f( 1.0, -1.0); }
    case 2u: { return vec2f(-1.0,  1.0); }
    default: { return vec2f( 1.0,  1.0); }
  }
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) radius: f32,
};

@vertex fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let base = personBase(instanceIndex, u.energy);
  let dance = danceOffset(instanceIndex, u.energy);
  let px = vec2f(u.resolution.x * 0.5 + base.x + dance.x, base.y + dance.y);

  let countHint = u.count;
  let radius = select(select(5.0, 3.0, countHint > 80.0), 2.0, countHint > 200.0);
  let corner = quadCorner(vertexIndex);
  let clipPx = px + corner * radius;
  let ndc = vec2f(
    clipPx.x / u.resolution.x * 2.0 - 1.0,
    1.0 - clipPx.y / u.resolution.y * 2.0,
  );

  var out: VertexOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.local = corner;
  out.color = dotColor(instanceIndex, u.energy);
  out.radius = radius;
  return out;
}

@fragment fn fs_main(input: VertexOut) -> @location(0) vec4f {
  let dist = length(input.local);
  let alpha = smoothstep(1.05, 0.75, dist) * 0.92;
  return vec4f(input.color * alpha, alpha);
}
