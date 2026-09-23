export const REQUEST_PUBLIC_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function isRequestPublicTokenExpired(
  request: { submittedAt: number },
  now = Date.now(),
): boolean {
  return now > request.submittedAt + REQUEST_PUBLIC_TOKEN_TTL_MS;
}
