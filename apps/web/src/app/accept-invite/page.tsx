"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
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

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const invite = useQuery(api.userInvites.getInviteByToken, token ? { token } : "skip");
  const acceptInvite = useMutation(api.userInvites.acceptInviteWithPassword);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing invitation token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await acceptInvite({
        token,
        name: name.trim() || undefined,
        password,
      });
      const signInResult = await authClient.signIn.email({
        email: result.email,
        password,
        callbackURL: "/dashboard",
      });
      if (signInResult.error) {
        setError(signInResult.error.message ?? "Account created, but sign-in failed. Try signing in.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to accept invitation.");
    } finally {
      setIsLoading(false);
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
          <CardTitle>Accept your invitation</CardTitle>
          <CardDescription>Set up your Arbor Live account to get started.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <Alert variant="destructive">
              <AlertDescription>Invalid invitation link.</AlertDescription>
            </Alert>
          ) : invite === undefined ? (
            <p className="text-sm text-muted-foreground">Loading invitation...</p>
          ) : invite === null ? (
            <Alert variant="destructive">
              <AlertDescription>This invitation is invalid or has already been used.</AlertDescription>
            </Alert>
          ) : invite.expired ? (
            <Alert variant="destructive">
              <AlertDescription>
                This invitation has expired. Ask your admin to send a new invite.
              </AlertDescription>
            </Alert>
          ) : invite.hasAccount ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  {invite.email} already has an Arbor Live account. Sign in to access{" "}
                  {invite.organizationName}.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link href={`/sign-in?email=${encodeURIComponent(invite.email)}`}>Sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="rounded-none border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{invite.organizationName}</p>
                <p className="text-muted-foreground">{invite.email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}

          <Button asChild variant="link" className="px-0">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
