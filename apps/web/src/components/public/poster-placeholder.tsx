import { cn } from "@/lib/utils";

type PosterPlaceholderProps = {
  seed: string;
  title?: string;
  className?: string;
};

/** Arbor forest greens — same family as brand primary / prior poster avatars. */
const PALETTES = [
  {
    base: "#071a10",
    a: "#1a4530",
    b: "#2d6b42",
    c: "#5aad72",
    glow: "#a8d5b5",
  },
  {
    base: "#0a2416",
    a: "#245c3a",
    b: "#3d8a54",
    c: "#6bb87f",
    glow: "#c5e0cc",
  },
  {
    base: "#06140c",
    a: "#163828",
    b: "#28704a",
    c: "#4f9f68",
    glow: "#b8d9c4",
  },
  {
    base: "#0c1f14",
    a: "#1d4a30",
    b: "#358a52",
    c: "#7bc48f",
    glow: "#d8ebe0",
  },
] as const;

function hashString(value: string) {
  return [...value].reduce((hash, char) => Math.imul(31, hash) + char.charCodeAt(0), 0);
}

function seededValue(seed: number, offset: number) {
  const value = Math.sin(seed + offset * 999) * 10_000;
  return value - Math.floor(value);
}

export function PosterPlaceholder({ seed, title, className }: PosterPlaceholderProps) {
  const hash = Math.abs(hashString(seed));
  const palette = PALETTES[hash % PALETTES.length]!;

  // Anchor spots in a pleasant composition (corners + soft center), not fully random.
  const spots = [
    {
      x: 12 + seededValue(hash, 1) * 28,
      y: 8 + seededValue(hash, 2) * 22,
      size: 55 + seededValue(hash, 3) * 25,
      color: palette.c,
      opacity: 0.55,
    },
    {
      x: 55 + seededValue(hash, 4) * 30,
      y: 35 + seededValue(hash, 5) * 30,
      size: 45 + seededValue(hash, 6) * 30,
      color: palette.b,
      opacity: 0.5,
    },
    {
      x: 5 + seededValue(hash, 7) * 35,
      y: 55 + seededValue(hash, 8) * 30,
      size: 50 + seededValue(hash, 9) * 28,
      color: palette.a,
      opacity: 0.65,
    },
    {
      x: 48 + seededValue(hash, 10) * 35,
      y: 62 + seededValue(hash, 11) * 25,
      size: 40 + seededValue(hash, 12) * 25,
      color: palette.glow,
      opacity: 0.28,
    },
  ];

  const angle = Math.round(135 + seededValue(hash, 13) * 50);
  const uid = `pp-${hash}`;

  return (
    <div
      aria-label={title || "Poster placeholder"}
      role="img"
      className={cn("relative isolate overflow-hidden", className)}
      style={{ backgroundColor: palette.base }}
    >
      {/* Base diagonal wash */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(${angle}deg, ${palette.a} 0%, ${palette.base} 55%, ${palette.base} 100%)`,
        }}
      />

      {/* Soft mesh orbs */}
      {spots.map((spot, index) => (
        <div
          key={index}
          aria-hidden
          className="absolute rounded-full blur-3xl"
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: `${spot.size}%`,
            height: `${spot.size * 1.15}%`,
            background: spot.color,
            opacity: spot.opacity,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {/* Top light kiss */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/3"
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% -10%, ${palette.glow}55, transparent 70%)`,
        }}
      />

      {/* Fine grain */}
      <svg aria-hidden className="absolute inset-0 size-full opacity-[0.14] mix-blend-overlay">
        <filter id={`${uid}-noise`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${uid}-noise)`} />
      </svg>

      {/* Bottom depth */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background: `linear-gradient(to top, ${palette.base}ee, transparent)`,
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/arbor-event.svg"
        alt=""
        className="absolute inset-0 size-full object-contain p-[15%] opacity-30 brightness-0 invert"
      />
    </div>
  );
}
