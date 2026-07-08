"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const AUTH_REQUIRED_MESSAGE = "You must be signed in.";

type ErrorStateProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
};

export function ErrorState({
  error,
  reset,
  title = "Something went wrong",
  description,
}: ErrorStateProps) {
  const router = useRouter();
  const isAuthError = error.message?.trim() === AUTH_REQUIRED_MESSAGE;

  useEffect(() => {
    if (isAuthError) {
      const redirectUrl = window.location.pathname + window.location.search;
      const signOutAndRedirect = async () => {
        try {
          const { authClient } = await import("@/lib/auth-client");
          await authClient.signOut();
        } catch {
          // best effort: the session token may already be invalid
        }
        router.replace(`/sign-in?redirect=${encodeURIComponent(redirectUrl)}`);
      };
      void signOutAndRedirect();
    }
  }, [isAuthError, router]);

  if (isAuthError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <Image
          src="/icon.svg"
          alt="Arbor Live"
          width={56}
          height={74}
          className="h-14 w-auto brightness-0 dark:invert"
          priority
        />
        <div className="space-y-2">
          <h2
            className="font-heading text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Your session has ended
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            We couldn&apos;t verify your account. Taking you back to sign in so you can
            pick up where you left off.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => router.replace("/sign-in")}>
            Go to sign in
          </Button>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Image
        src="/icon.svg"
        alt="Arbor Live"
        width={56}
        height={74}
        className="h-14 w-auto brightness-0 dark:invert"
        priority
      />
      <div className="space-y-2">
        <h2
          className="font-heading text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          {title}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {description ??
            "An unexpected error occurred while loading this page. Please try again."}
        </p>
      </div>
      <Alert variant="destructive" className="mx-auto max-w-xl text-left">
        <AlertDescription className="break-words font-mono text-xs">
          {error.message || "Unknown error"}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">Back to dashboard</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/sign-in">Sign in</a>
        </Button>
      </div>
    </div>
  );
}