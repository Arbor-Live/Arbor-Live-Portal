import {
  buildPosterPlaceholderSvg,
  isValidPosterPlaceholderSeed,
  type PosterPlaceholderTheme,
  type PosterPlaceholderVariant,
} from "@/lib/poster-placeholder-svg";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function parseTheme(value: string | null): PosterPlaceholderTheme {
  return value === "light" ? "light" : "dark";
}

function parseVariant(value: string | null): PosterPlaceholderVariant {
  return value === "artist" ? "artist" : "event";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ seed: string }> },
) {
  const { seed: rawSeed } = await context.params;
  const seed = decodeURIComponent(rawSeed);

  if (!isValidPosterPlaceholderSeed(seed)) {
    return new Response("Invalid seed", { status: 400 });
  }

  const url = new URL(request.url);
  const theme = parseTheme(url.searchParams.get("theme"));
  const variant = parseVariant(url.searchParams.get("variant"));

  const svg = buildPosterPlaceholderSvg({ seed, theme, variant });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
