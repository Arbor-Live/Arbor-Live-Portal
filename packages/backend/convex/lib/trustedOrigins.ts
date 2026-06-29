export function isProductionAuthEnvironment() {
  return process.env.ARBOR_ENV === "production";
}

export function buildTrustedOrigins(siteUrl: string): string[] {
  const origins = new Set([
    siteUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  if (!isProductionAuthEnvironment()) {
    origins.add("https://*.vercel.app");
    origins.add("http://localhost:*");
    origins.add("http://127.0.0.1:*");
  }

  return Array.from(origins);
}
