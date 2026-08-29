/** Prefer uploaded portal profile photo over Better Auth `image`. */
export function pickUserProfileImageUrl(
  avatarUrl?: string | null,
  image?: string | null,
): string | undefined {
  const uploaded = avatarUrl?.trim();
  if (uploaded) return uploaded;
  const authImage = image?.trim();
  return authImage || undefined;
}
