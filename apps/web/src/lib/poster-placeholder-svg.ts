type Palette = {
  base: string;
  a: string;
  b: string;
  c: string;
  glow: string;
  accent: string;
};

const DARK_PALETTES: readonly Palette[] = [
  {
    base: "#071a10",
    a: "#1a4530",
    b: "#2d6b42",
    c: "#5aad72",
    glow: "#a8d5b5",
    accent: "#d4a574",
  },
  {
    base: "#0a2416",
    a: "#245c3a",
    b: "#3d8a54",
    c: "#6bb87f",
    glow: "#c5e0cc",
    accent: "#e8c47c",
  },
  {
    base: "#0a1620",
    a: "#163848",
    b: "#1f6b6e",
    c: "#3aa8a0",
    glow: "#9fd9d0",
    accent: "#7bc48f",
  },
  {
    base: "#12151c",
    a: "#2a3340",
    b: "#3d5a4c",
    c: "#6b8f7a",
    glow: "#c5d4cc",
    accent: "#c4a574",
  },
  {
    base: "#1a120c",
    a: "#3d2a18",
    b: "#5c4030",
    c: "#8a6a4a",
    glow: "#e0d0b8",
    accent: "#4f9f68",
  },
  {
    base: "#0c1420",
    a: "#1a3048",
    b: "#2a5080",
    c: "#4a7ab0",
    glow: "#b8cce0",
    accent: "#5aad72",
  },
  {
    base: "#140f18",
    a: "#2a2238",
    b: "#3d3858",
    c: "#6a6888",
    glow: "#d0cce0",
    accent: "#6bb87f",
  },
  {
    base: "#06140c",
    a: "#163828",
    b: "#28704a",
    c: "#4f9f68",
    glow: "#b8d9c4",
    accent: "#c97858",
  },
  {
    base: "#101818",
    a: "#1e3a3a",
    b: "#2f5c52",
    c: "#4a9080",
    glow: "#b8ddd4",
    accent: "#e0b060",
  },
  {
    base: "#0c1f14",
    a: "#1d4a30",
    b: "#358a52",
    c: "#7bc48f",
    glow: "#d8ebe0",
    accent: "#8eb4d4",
  },
];

/** Soft but clearly tinted — readable in light mode, not washed grey. */
const LIGHT_PALETTES: readonly Palette[] = [
  {
    base: "#d5ebe0",
    a: "#8fd4a8",
    b: "#4f9f68",
    c: "#2d6b42",
    glow: "#f4fff8",
    accent: "#d4a574",
  },
  {
    base: "#d8eee3",
    a: "#7bc48f",
    b: "#3d8a54",
    c: "#1d4a30",
    glow: "#f2fbf5",
    accent: "#e0b060",
  },
  {
    base: "#d2ebe8",
    a: "#6bc4bb",
    b: "#2f8f88",
    c: "#1a5c58",
    glow: "#f0fffd",
    accent: "#7bc48f",
  },
  {
    base: "#dde5e1",
    a: "#9bb5a8",
    b: "#5a7f6c",
    c: "#3d5a4c",
    glow: "#f5f8f6",
    accent: "#c4a574",
  },
  {
    base: "#ebe0d2",
    a: "#d4b896",
    b: "#b8895c",
    c: "#8a6a4a",
    glow: "#fff8f0",
    accent: "#5aad72",
  },
  {
    base: "#d6e2f0",
    a: "#8eb4d4",
    b: "#4a7ab0",
    c: "#2a5080",
    glow: "#f3f8ff",
    accent: "#5aad72",
  },
  {
    base: "#e2dde8",
    a: "#b0a8c4",
    b: "#7a7298",
    c: "#5a5878",
    glow: "#f8f6fc",
    accent: "#6bb87f",
  },
  {
    base: "#d4eadc",
    a: "#7bc48f",
    b: "#3d8a54",
    c: "#28704a",
    glow: "#f0faf3",
    accent: "#c97858",
  },
  {
    base: "#d2e8e3",
    a: "#7bbbb0",
    b: "#4a9080",
    c: "#2f5c52",
    glow: "#f0faf7",
    accent: "#e0b060",
  },
  {
    base: "#d8ecdf",
    a: "#8fd4a0",
    b: "#5aad72",
    c: "#358a52",
    glow: "#f2fbf5",
    accent: "#8eb4d4",
  },
];

/** Shared Arbor mark + EVENT wordmark paths (from /arbor-event.svg). */
const EVENT_LOGO_PATHS = [
  "M132.633 122.452L100.786 62.1746L68.937 1.89718C67.6007 -0.632394 65.4134 -0.632394 64.0766 1.89718L32.2285 62.1746L0.380356 122.452C-0.700131 124.496 0.650006 127.052 2.81052 127.052H53.9464C56.6816 127.052 58.5725 128.918 57.6061 130.665L49.3515 145.583L34.4281 172.552C33.3339 174.529 34.7014 177 36.8896 177H66.7369H95.4928C98.1664 177 99.8369 173.981 98.5001 171.566L84.1219 145.583L75.7086 130.377C74.8192 128.77 76.5587 127.052 79.0756 127.052H130.203C132.364 127.052 133.714 124.496 132.633 122.452Z",
  "M220.147 35.5439C220.147 15.8967 204.541 0 185.252 0H144.904C141.621 0 138.959 2.66372 138.959 5.94958V121.223C138.959 124.508 141.621 127.172 144.904 127.172H217.352C222.319 127.172 225.095 121.439 222.019 117.537L190.001 76.931C188.077 74.4925 189.829 70.7507 192.859 70.0733C208.483 66.5788 220.147 52.53 220.147 35.5439Z",
  "M296.524 63.9755C293.859 62.0148 293.28 57.8307 295.334 55.2361C299.945 49.4145 302.741 42.0323 302.741 33.9365C302.741 15.1821 287.87 0 269.5 0H240.019C237.556 0 235.561 1.99779 235.561 4.46218V122.71C235.561 125.175 237.556 127.172 240.019 127.172H276.498C295.392 127.172 310.613 111.633 310.613 92.3427C310.613 80.6644 305.121 70.2987 296.524 63.9755Z",
  "M379.066 0C344.573 0 316.559 28.3381 316.559 63.4985C316.559 98.6589 344.573 127.172 379.066 127.172C413.384 127.172 441.398 98.6589 441.398 63.4985C441.398 28.3381 413.384 0 379.066 0Z",
  "M499.334 78.1358C497.027 75.2094 499.135 70.6797 502.73 69.7056C517.602 65.6766 528.532 51.9864 528.532 35.544C528.532 15.8968 512.925 0 493.636 0H451.801C449.339 0 447.343 1.99779 447.343 4.46218V122.71C447.343 125.175 449.339 127.172 451.801 127.172H528.802C532.527 127.172 534.609 122.872 532.302 119.946L499.334 78.1358Z",
  "M243.664 202V136.72H289.456V151.408H261.136V166.576H284.752V180.496H261.136V187.312H290.8V202H243.664ZM355.728 136.72L324.912 202.672C324.624 203.248 324.048 203.248 323.76 202.672L293.04 136.72H311.664L325.008 167.152L337.968 136.72H355.728ZM361.789 202V136.72H407.581V151.408H379.261V166.576H402.877V180.496H379.261V187.312H408.925V202H361.789ZM474.791 203.152L433.799 169.456V202H417.383V135.856C417.383 135.28 417.671 134.8 418.727 135.664L459.719 169.456V136.72H476.135V202.96C476.135 203.728 475.847 204.016 474.791 203.152ZM501.332 202V151.408H484.052V136.72H536.084V151.408H518.804V202H501.332Z",
] as const;

/** Shared Arbor mark + ARTIST wordmark paths (from /arbor-artist.svg). */
const ARTIST_LOGO_PATHS = [
  EVENT_LOGO_PATHS[0]!,
  EVENT_LOGO_PATHS[1]!,
  EVENT_LOGO_PATHS[2]!,
  EVENT_LOGO_PATHS[3]!,
  EVENT_LOGO_PATHS[4]!,
  "M231.872 196.432L229.472 202H212.384L244.16 135.568C244.448 134.896 245.024 134.896 245.312 135.568L276.992 202H258.944L256.448 196.432C256.544 196.432 231.872 196.432 231.872 196.432ZM250.688 183.376L243.968 168.208L237.44 183.376H250.688ZM323.424 183.472L335.04 202H316.128L307.008 187.024H300.48V202H283.008V136.72H307.776C325.344 136.72 335.232 147.856 335.232 162.352C335.232 171.76 331.104 179.248 323.424 183.472ZM300.48 173.104H306.912C314.784 173.104 317.664 168.688 317.664 162.352C317.664 156.016 314.784 151.504 306.912 151.504H300.48V173.104ZM357.207 202V151.408H339.927V136.72H391.959V151.408H374.679V202H357.207ZM400.204 202V136.72H417.676V202H400.204ZM451.144 202.96C436.456 202.96 428.104 196.24 424.072 190.864L436.744 181.36C439.912 185.296 443.848 188.464 450.376 188.464C455.56 188.464 458.632 186.928 458.632 183.28C458.632 180.496 456.52 179.152 452.2 177.712L444.52 175.12C435.016 171.952 428.296 166.192 428.296 155.44C428.296 142.576 438.952 135.952 450.568 135.952C462.088 135.952 468.424 140.08 472.264 144.592L462.28 155.056C459.592 152.272 456.712 150.352 451.528 150.352C447.304 150.352 445.192 152.272 445.192 154.864C445.192 157.36 446.632 158.608 449.8 159.664L458.44 162.544C471.496 166.864 475.912 173.104 475.912 182.32C475.912 194.32 468.424 202.96 451.144 202.96ZM495.301 202V151.408H478.021V136.72H530.052V151.408H512.773V202H495.301Z",
] as const;

const LOGO_VIEWBOX_WIDTH = 538;
const LOGO_VIEWBOX_HEIGHT = 208;

export type PosterPlaceholderTheme = "light" | "dark";
export type PosterPlaceholderVariant = "event" | "artist";

export type BuildPosterPlaceholderSvgOptions = {
  seed: string;
  theme: PosterPlaceholderTheme;
  variant?: PosterPlaceholderVariant;
};

/** Bump when SVG output changes so immutable caches refresh. */
export const POSTER_PLACEHOLDER_VERSION = "2";

const SEED_PATTERN = /^[A-Za-z0-9_:-]{1,128}$/;

export function isValidPosterPlaceholderSeed(seed: string) {
  return SEED_PATTERN.test(seed);
}

function hashString(value: string) {
  return [...value].reduce((hash, char) => Math.imul(31, hash) + char.charCodeAt(0), 0);
}

function seededValue(seed: number, offset: number) {
  const value = Math.sin(seed + offset * 999) * 10_000;
  return value - Math.floor(value);
}

/** Mid-tone colors only — skip near-white `glow` so dark posters stay dark. */
function pickBlobColor(palette: Palette, seed: number, offset: number) {
  const colors = [palette.a, palette.b, palette.c, palette.accent];
  return colors[Math.floor(seededValue(seed, offset) * colors.length) % colors.length]!;
}

function buildLogoMarkup(variant: PosterPlaceholderVariant, fill: string, opacity: number, padPercent: number) {
  const paths = variant === "artist" ? ARTIST_LOGO_PATHS : EVENT_LOGO_PATHS;
  const pathMarkup = paths.map((d) => `<path d="${d}" />`).join("");

  // Fit wordmark into the padded content box (same idea as object-contain + padding).
  const boxX = (400 * padPercent) / 100;
  const boxY = (500 * padPercent) / 100;
  const boxW = 400 - boxX * 2;
  const boxH = 500 - boxY * 2;
  const scale = Math.min(boxW / LOGO_VIEWBOX_WIDTH, boxH / LOGO_VIEWBOX_HEIGHT);
  const drawnW = LOGO_VIEWBOX_WIDTH * scale;
  const drawnH = LOGO_VIEWBOX_HEIGHT * scale;
  const tx = boxX + (boxW - drawnW) / 2;
  const ty = boxY + (boxH - drawnH) / 2;

  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})" fill="${fill}" opacity="${opacity.toFixed(3)}">${pathMarkup}</g>`;
}

/**
 * Deterministic poster SVG — soft radial blobs, inlined wordmark (no external refs).
 * Safe to use as &lt;img src&gt; (browsers block external &lt;image&gt; inside img SVGs).
 */
export function buildPosterPlaceholderSvg({
  seed,
  theme,
  variant = "event",
}: BuildPosterPlaceholderSvgOptions) {
  const isDark = theme === "dark";
  const hash = Math.abs(hashString(seed));
  const palette = (isDark ? DARK_PALETTES : LIGHT_PALETTES)[hash % DARK_PALETTES.length]!;

  const spotCount = 3 + Math.floor(seededValue(hash, 0) * 4);
  const layout = Math.floor(seededValue(hash, 40) * 3);
  const logoOpacity = isDark ? 0.28 + seededValue(hash, 43) * 0.14 : 0.32 + seededValue(hash, 43) * 0.12;
  const logoPad = 14 + Math.round(seededValue(hash, 44) * 10);
  const angle = Math.round(90 + seededValue(hash, 13) * 120);
  const washStop = 35 + seededValue(hash, 45) * 40;
  const bottomDepth = 28 + seededValue(hash, 47) * 30;
  const showRibbon = seededValue(hash, 48) > 0.45;
  const showAccentOrb = seededValue(hash, 49) > 0.35;
  const logoFill = isDark ? "#ffffff" : "#0a0a0a";

  const spots = Array.from({ length: spotCount }, (_, index) => {
    const t = seededValue(hash, 10 + index * 7);
    const u = seededValue(hash, 11 + index * 7);
    let x: number;
    let y: number;

    if (layout === 0) {
      x = 10 + t * 80;
      y = 5 + u * 45;
    } else if (layout === 1) {
      x = 5 + t * 90;
      y = 8 + t * 70 + (u - 0.5) * 25;
    } else {
      x = 5 + t * 90;
      y = 5 + u * 90;
    }

    // Larger radii + lower opacity ≈ soft “blur” without CSS filters.
    const size = 48 + seededValue(hash, 12 + index * 7) * 56;
    const stretch = 0.75 + seededValue(hash, 13 + index * 7) * 0.7;

    return {
      x: (x / 100) * 400,
      y: (y / 100) * 500,
      rx: (size / 100) * 400 * 0.55,
      ry: (size / 100) * 500 * 0.55 * stretch,
      color: pickBlobColor(palette, hash, 14 + index * 7),
      opacity: (isDark ? 0.22 : 0.28) + seededValue(hash, 15 + index * 7) * 0.22,
    };
  });

  const blobGradients = spots
    .map(
      (spot, index) => `
    <radialGradient id="blob-${index}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${spot.color}" stop-opacity="${spot.opacity.toFixed(3)}" />
      <stop offset="55%" stop-color="${spot.color}" stop-opacity="${(spot.opacity * 0.35).toFixed(3)}" />
      <stop offset="100%" stop-color="${spot.color}" stop-opacity="0" />
    </radialGradient>`,
    )
    .join("");

  const blobs = spots
    .map(
      (spot, index) =>
        `<ellipse cx="${spot.x.toFixed(1)}" cy="${spot.y.toFixed(1)}" rx="${spot.rx.toFixed(1)}" ry="${spot.ry.toFixed(1)}" fill="url(#blob-${index})" />`,
    )
    .join("");

  const accentOrb = showAccentOrb
    ? (() => {
        const x = ((15 + seededValue(hash, 50) * 70) / 100) * 400;
        const y = ((20 + seededValue(hash, 51) * 55) / 100) * 500;
        const size = 30 + seededValue(hash, 52) * 36;
        const opacity = (isDark ? 0.2 : 0.25) + seededValue(hash, 54) * 0.18;
        const rx = (size / 100) * 400 * 0.5;
        const ry = (size / 100) * 500 * 0.5;
        return `
    <radialGradient id="accent" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="${opacity.toFixed(3)}" />
      <stop offset="60%" stop-color="${palette.accent}" stop-opacity="${(opacity * 0.3).toFixed(3)}" />
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0" />
    </radialGradient>
    <ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#accent)" />`;
      })()
    : "";

  const ribbonOpacity = isDark ? 0.28 : 0.36;
  const ribbon = showRibbon
    ? `<rect width="400" height="500" fill="url(#ribbon)" opacity="${ribbonOpacity}" />`
    : "";

  const logo = buildLogoMarkup(variant, logoFill, logoOpacity, logoPad);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500" role="img" aria-label="Poster placeholder">
  <defs>
    <linearGradient id="wash" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${palette.a}" />
      <stop offset="${washStop.toFixed(1)}%" stop-color="${palette.base}" />
      <stop offset="100%" stop-color="${palette.base}" />
    </linearGradient>
    <linearGradient id="ribbon" gradientTransform="rotate(${angle + 40} 0.5 0.5)">
      <stop offset="35%" stop-color="${palette.accent}" stop-opacity="0" />
      <stop offset="48%" stop-color="${palette.accent}" stop-opacity="0.33" />
      <stop offset="62%" stop-color="${palette.accent}" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${palette.base}" stop-opacity="0.92" />
      <stop offset="100%" stop-color="${palette.base}" stop-opacity="0" />
    </linearGradient>
    ${blobGradients}
  </defs>
  <rect width="400" height="500" fill="${palette.base}" />
  <rect width="400" height="500" fill="url(#wash)" />
  ${blobs}
  ${accentOrb}
  ${ribbon}
  <rect y="${(500 * (100 - bottomDepth)) / 100}" width="400" height="${(500 * bottomDepth) / 100}" fill="url(#bottom)" />
  ${logo}
</svg>`;
}

export function posterPlaceholderPath(
  seed: string,
  options: { theme: PosterPlaceholderTheme; variant?: PosterPlaceholderVariant },
) {
  const params = new URLSearchParams({
    theme: options.theme,
    variant: options.variant ?? "event",
    v: POSTER_PLACEHOLDER_VERSION,
  });
  return `/poster-placeholder/${encodeURIComponent(seed)}?${params.toString()}`;
}
