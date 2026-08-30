struct U {
  time: f32,
  w: f32,
  h: f32,
  aspect: f32,
};
@group(0) @binding(0) var<uniform> u: U;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn noise2(p: vec2f) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  let sm = fp * fp * (3.0 - 2.0 * fp);
  let a = hash21(ip);
  let b = hash21(ip + vec2f(1.0, 0.0));
  let c = hash21(ip + vec2f(0.0, 1.0));
  let d = hash21(ip + vec2f(1.0, 1.0));
  return mix(mix(a, b, sm.x), mix(c, d, sm.x), sm.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var pp = p;
  for (var k = 0; k < 4; k++) {
    v = v + amp * noise2(pp);
    pp = pp * 2.03 + vec2f(17.3, 9.1);
    amp = amp * 0.5;
  }
  return v;
}

fn toroidalDelta(a: vec2f, b: vec2f, period: vec2f) -> vec2f {
  var d = a - b;
  d = d - period * round(d / period);
  return d;
}

fn bokeh(p: vec2f, t: f32, count: i32, sizeScale: f32, brightness: f32) -> f32 {
  var acc = 0.0;
  let period = vec2f(u.aspect, 0.9);
  let yBase = 0.05;
  for (var i = 0; i < count; i++) {
    let fi = f32(i);
    let s1 = hash21(vec2f(fi, 1.0));
    let s2 = hash21(vec2f(fi, 2.0));
    let s3 = hash21(vec2f(fi, 3.0));
    let speed = 0.02 + 0.04 * s3;
    let bx = fract(s1 + 0.02 * t * speed * 3.0) * u.aspect;
    let by = fract(s2 + 0.008 * t * speed) * period.y + yBase;
    let r = (0.02 + 0.09 * s2) * sizeScale;
    let d = length(toroidalDelta(p, vec2f(bx, by), period));
    acc = acc + smoothstep(r, r * 0.35, d) * brightness * (0.4 + 0.6 * s3);
  }
  return acc;
}

fn cafeScene(p: vec2f, uv: vec2f, t: f32) -> vec3f {
  var col = mix(vec3f(0.1, 0.07, 0.05), vec3f(0.17, 0.11, 0.075), uv.y);

  let wx = smoothstep(0.12, 0.3, p.x) * (1.0 - smoothstep(0.62, 0.8, p.x));
  let wy = smoothstep(0.1, 0.25, uv.y) * (1.0 - smoothstep(0.5, 0.7, uv.y));
  col = col + vec3f(0.9, 0.6, 0.3) * wx * wy * 0.4;

  col = col + vec3f(1.0, 0.55, 0.24) * bokeh(p, t, 12, 2.0, 0.4);
  col = col + vec3f(0.95, 0.4, 0.3) * bokeh(p + vec2f(0.4, 0.2), t * 1.3, 8, 1.5, 0.28);

  let haze = fbm(p * vec2f(2.0, 2.6) + vec2f(0.0, t * 0.02));
  col = col + vec3f(0.75, 0.7, 0.66) * haze * 0.05;

  return col;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = u.time;
  let p = vec2f(uv.x * u.aspect, uv.y);

  let period = 0.05;
  let stripPos = p.x / period;
  let ramp = fract(stripPos) - 0.5;

  let off = ramp * 0.11 + 0.035 * sin(t * 0.22 + p.y * 0.6);
  let sampleP = vec2f(p.x + off, p.y + ramp * 0.03);

  var col = cafeScene(sampleP, uv, t);

  col = col * (0.94 + 0.12 * ramp);

  let edgeDist = min(fract(stripPos), 1.0 - fract(stripPos));
  let frame = exp(-edgeDist * edgeDist * 1400.0);
  col = col + vec3f(0.55, 0.4, 0.24) * frame * 0.5;

  let vd = length(uv - vec2f(0.5, 0.45));
  col = col * (1.0 - 0.35 * smoothstep(0.3, 0.9, vd));
  col = col + (hash21(uv * 731.0 + fract(t) * 7.3) - 0.5) * (2.0 / 255.0);

  return vec4f(col, 1.0);
}
