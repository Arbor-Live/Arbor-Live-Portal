"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type PosterPlaceholderProps = {
  seed: string;
  title?: string;
  className?: string;
};

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

function hashString(value: string) {
  return [...value].reduce((hash, char) => Math.imul(31, hash) + char.charCodeAt(0), 0);
}

function seededValue(seed: number, offset: number) {
  const value = Math.sin(seed + offset * 999) * 10_000;
  return value - Math.floor(value);
}

function pickColor(palette: Palette, seed: number, offset: number) {
  const colors = [palette.a, palette.b, palette.c, palette.glow, palette.accent];
  return colors[Math.floor(seededValue(seed, offset) * colors.length) % colors.length]!;
}

function subscribeDark(onStoreChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

function useIsDark() {
  return useSyncExternalStore(subscribeDark, getIsDark, () => false);
}

export function PosterPlaceholder({ seed, title, className }: PosterPlaceholderProps) {
  const isDark = useIsDark();
  const hash = Math.abs(hashString(seed));
  const palette = (isDark ? DARK_PALETTES : LIGHT_PALETTES)[hash % DARK_PALETTES.length]!;

  const spotCount = 3 + Math.floor(seededValue(hash, 0) * 4);
  const layout = Math.floor(seededValue(hash, 40) * 3);
  const blurClass =
    seededValue(hash, 41) > 0.66 ? "blur-[48px]" : seededValue(hash, 41) > 0.33 ? "blur-3xl" : "blur-2xl";
  const grainOpacity = isDark ? 0.08 + seededValue(hash, 42) * 0.1 : 0.04 + seededValue(hash, 42) * 0.05;
  const logoOpacity = isDark ? 0.22 + seededValue(hash, 43) * 0.16 : 0.28 + seededValue(hash, 43) * 0.14;
  const logoPad = 12 + Math.round(seededValue(hash, 44) * 12);
  const angle = Math.round(90 + seededValue(hash, 13) * 120);
  const washStop = 35 + seededValue(hash, 45) * 40;
  const bottomDepth = 28 + seededValue(hash, 47) * 30;
  const showRibbon = seededValue(hash, 48) > 0.45;
  const showAccentOrb = seededValue(hash, 49) > 0.35;
  const uid = `pp-${hash}`;

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

    return {
      x,
      y,
      size: 32 + seededValue(hash, 12 + index * 7) * 48,
      stretch: 0.75 + seededValue(hash, 13 + index * 7) * 0.7,
      color: pickColor(palette, hash, 14 + index * 7),
      opacity: (isDark ? 0.35 : 0.45) + seededValue(hash, 15 + index * 7) * 0.35,
    };
  });

  return (
    <div
      aria-label={title || "Poster placeholder"}
      role="img"
      className={cn("relative isolate overflow-hidden", className)}
      style={{ backgroundColor: palette.base }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(${angle}deg, ${palette.a} 0%, ${palette.base} ${washStop}%, ${palette.base} 100%)`,
        }}
      />

      {spots.map((spot, index) => (
        <div
          key={index}
          aria-hidden
          className={cn("absolute rounded-full", blurClass)}
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: `${spot.size}%`,
            height: `${spot.size * spot.stretch}%`,
            background: spot.color,
            opacity: spot.opacity,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {showAccentOrb ? (
        <div
          aria-hidden
          className={cn("absolute rounded-full", blurClass)}
          style={{
            left: `${15 + seededValue(hash, 50) * 70}%`,
            top: `${20 + seededValue(hash, 51) * 55}%`,
            width: `${25 + seededValue(hash, 52) * 30}%`,
            height: `${25 + seededValue(hash, 53) * 30}%`,
            background: palette.accent,
            opacity: 0.3 + seededValue(hash, 54) * 0.25,
            transform: "translate(-50%, -50%)",
          }}
        />
      ) : null}

      {showRibbon ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.3 : 0.4,
            background: `linear-gradient(${angle + 40}deg, transparent 35%, ${palette.accent}55 48%, transparent 62%)`,
          }}
        />
      ) : null}

      <svg
        aria-hidden
        className={cn(
          "absolute inset-0 size-full",
          isDark ? "mix-blend-overlay" : "mix-blend-soft-light",
        )}
        style={{ opacity: grainOpacity } satisfies CSSProperties}
      >
        <filter id={`${uid}-noise`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency={0.65 + seededValue(hash, 55) * 0.45}
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${uid}-noise)`} />
      </svg>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${bottomDepth}%`,
          background: `linear-gradient(to top, ${palette.base}e6, transparent)`,
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/arbor-event.svg"
        alt=""
        className={cn(
          "absolute inset-0 size-full object-contain brightness-0",
          isDark && "invert",
        )}
        style={{ opacity: logoOpacity, padding: `${logoPad}%` }}
      />
    </div>
  );
}
