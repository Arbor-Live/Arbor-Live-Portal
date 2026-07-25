"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { signInSchema, type SignInFormValues } from "@/lib/validations/auth";

function authErrorMessage(error: { message?: unknown }, fallback: string) {
  return typeof error.message === "string" ? error.message : fallback;
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const redirectTarget = useMemo(() => {
    const target = searchParams.get("redirect") ?? "/dashboard";
    return target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
  }, [searchParams]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const form = useConvexForm<SignInFormValues>({
    schema: signInSchema,
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (emailFromQuery) form.setValue("email", emailFromQuery);
  }, [emailFromQuery, form]);

  const onSubmit = form.submitMutation(async (values) => {
    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: redirectTarget,
    });
    if (result.error) {
      throw new Error(
        result.error.message === "Unable to sign in."
          ? "We could not sign you in with those credentials."
          : (result.error.message ?? "Unable to sign in."),
      );
    }
    return result;
  });

  const onPasskeySignIn = async () => {
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        throw new Error(authErrorMessage(result.error, "Unable to sign in with passkey."));
      }
      window.location.href = redirectTarget;
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "Unable to sign in with passkey.");
    } finally {
      setPasskeyBusy(false);
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
              width={1014}
              height={463}
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

          <Form {...form}>
            <form
              method="post"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <TextFormField name="email" label="Email" type="email" />
              <TextFormField name="password" label="Password" type="password" />

              <Button
                type="submit"
                disabled={form.saveStatus === "saving"}
                className="w-full"
              >
                {form.saveStatus === "saving" ? "Signing you in..." : "Sign in to dashboard"}
              </Button>

              {form.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{form.saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={passkeyBusy}
            onClick={() => void onPasskeySignIn()}
          >
            {passkeyBusy ? "Checking passkey…" : "Sign in with passkey"}
          </Button>

          {passkeyError ? (
            <Alert variant="destructive">
              <AlertDescription>{passkeyError}</AlertDescription>
            </Alert>
          ) : null}

          <Button asChild variant="link" className="px-0">
            <Link href="/forgot-password">Forgot your password?</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
