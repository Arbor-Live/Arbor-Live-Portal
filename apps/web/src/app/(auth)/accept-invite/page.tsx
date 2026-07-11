"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { authClient } from "@/lib/auth-client";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  acceptInviteSchema,
  type AcceptInviteFormValues,
} from "@/lib/validations/auth";

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const invite = useQuery(api.userInvites.getInviteByToken, token ? { token } : "skip");
  const acceptInvite = useMutation(api.userInvites.acceptInviteWithPassword);

  const form = useConvexForm<AcceptInviteFormValues>({
    schema: acceptInviteSchema,
    defaultValues: { name: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    if (!token) {
      throw new Error("Missing invitation token.");
    }
    const result = await acceptInvite({
      token,
      name: values.name?.trim() || undefined,
      password: values.password,
    });
    const signInResult = await authClient.signIn.email({
      email: result.email,
      password: values.password,
      callbackURL: "/dashboard",
    });
    if (signInResult.error) {
      throw new Error(
        signInResult.error.message ?? "Account created, but sign-in failed. Try signing in.",
      );
    }
    return result;
  });

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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="rounded-none border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{invite.organizationName}</p>
                  <p className="text-muted-foreground">{invite.email}</p>
                </div>

                <TextFormField name="name" label="Your name" placeholder="Optional" />
                <TextFormField name="password" label="Password" type="password" />
                <TextFormField
                  name="confirmPassword"
                  label="Confirm password"
                  type="password"
                />

                <Button
                  type="submit"
                  disabled={form.saveStatus === "saving"}
                  className="w-full"
                >
                  {form.saveStatus === "saving" ? "Creating account..." : "Create account"}
                </Button>

                {form.saveError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{form.saveError}</AlertDescription>
                  </Alert>
                ) : null}
              </form>
            </Form>
          )}

          <Button asChild variant="link" className="px-0">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
