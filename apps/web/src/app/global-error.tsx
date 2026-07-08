"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import "@/app/globals.css";

const AUTH_REQUIRED_MESSAGE = "You must be signed in.";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const isAuthError = error.message?.trim() === AUTH_REQUIRED_MESSAGE;

  useEffect(() => {
    if (isAuthError) {
      const redirectUrl = window.location.pathname + window.location.search;
      router.replace(`/sign-in?redirect=${encodeURIComponent(redirectUrl)}`);
    }
  }, [isAuthError, router]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col items-center justify-center bg-background px-6 py-16 text-center text-foreground">
        <Image
          src="/icon.svg"
          alt="Arbor Live"
          width={56}
          height={74}
          className="h-14 w-auto brightness-0 dark:invert"
          priority
        />
        <h2
          className="mt-6 text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          {isAuthError ? "Your session has ended" : "Something went wrong"}
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {isAuthError
            ? "We couldn't verify your account. Taking you back to sign in so you can pick up where you left off."
            : "The application hit an unexpected error. Please try again, or return to the dashboard."}
        </p>
        {!isAuthError && (
          <p className="mt-4 max-w-xl break-words font-mono text-xs text-muted-foreground">
            {error.message || "Unknown error"}
            {error.digest ? ` (ref ${error.digest})` : ""}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center justify-center bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.replace(isAuthError ? "/sign-in" : "/dashboard")}
            className="inline-flex h-9 items-center justify-center border border-border bg-background px-3 text-sm font-medium"
          >
            {isAuthError ? "Go to sign in" : "Back to dashboard"}
          </button>
        </div>
      </body>
    </html>
  );
}