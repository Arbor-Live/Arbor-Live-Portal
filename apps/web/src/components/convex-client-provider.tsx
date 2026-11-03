"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { useUseAuthFromBetterAuth } from "@/lib/convex-better-auth";

// Static access so Next.js can inline NEXT_PUBLIC_CONVEX_URL in the client bundle.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Add it to apps/web/.env.local or packages/backend/.env.local (as CONVEX_URL), then restart `pnpm dev`.",
  );
}

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: React.ReactNode;
  initialToken?: string | null;
}) {
  // Not `ConvexBetterAuthProvider`: its auth hook re-authenticates Convex when
  // the session finishes loading, which can fail every query on the page. See
  // `nextAuthBinding`.
  const useAuth = useUseAuthFromBetterAuth(authClient, initialToken);
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
