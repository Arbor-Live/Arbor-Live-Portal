"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (emailFromQuery) setEmail(emailFromQuery);
  }, [emailFromQuery]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to sign in.");
    }
  };

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2">
            <Image
              src="/logo.svg"
              alt="Arbor Live logo"
              width={220}
              height={48}
              className="h-10 w-auto brightness-0 dark:invert"
              priority
            />
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            The Arbor portal is currently only available to certain people.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-none border bg-muted/30 p-3">
            <p className="font-medium">Invite-only access</p>
            <p className="text-sm text-muted-foreground">
              If you are new to Arbor Live operations, ask the ops team for an invite.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {error === "Unable to sign in."
                    ? "We could not sign you in with those credentials."
                    : error}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Signing you in..." : "Sign in to dashboard"}
            </Button>
          </form>

          <Button asChild variant="link" className="px-0">
            <Link href="/forgot-password">Forgot your password?</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
