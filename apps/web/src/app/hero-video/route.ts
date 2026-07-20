const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile/i;
const SAFARI_USER_AGENT = /Safari/i;
const NON_SAFARI_USER_AGENT = /Chrome|Chromium|CriOS|Edg|OPR|FxiOS/i;

export function GET(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const isMobile = MOBILE_USER_AGENT.test(userAgent);
  const isSafari =
    SAFARI_USER_AGENT.test(userAgent) && !NON_SAFARI_USER_AGENT.test(userAgent);

  const assetPath = isMobile
    ? "/dnm-mobile-h264.mp4"
    : isSafari
      ? "/dnm-opti-265.mp4"
      : "/dnm-opti-h264.mp4";

  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL(assetPath, request.url).toString(),
      "Cache-Control": "private, max-age=3600",
      Vary: "User-Agent",
    },
  });
}
