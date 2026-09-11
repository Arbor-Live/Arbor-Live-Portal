"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { authClient } from "@/lib/auth-client";

/**
 * Attaches Better Auth session identity to Sentry so client errors include
 * who was signed in. Cleared on logout / session loss.
 */
export function SentryUserContext() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  useEffect(() => {
    if (!user?.id) {
      Sentry.setUser(null);
      return;
    }

    Sentry.setUser({
      id: user.id,
      email: typeof user.email === "string" ? user.email : undefined,
      username: typeof user.name === "string" ? user.name : undefined,
    });
  }, [user?.id, user?.email, user?.name]);

  return null;
}
