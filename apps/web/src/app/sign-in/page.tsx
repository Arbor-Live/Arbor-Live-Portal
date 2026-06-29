"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
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

export default function SignInPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

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
      callbackURL: "/dashboard",
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

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center px-6 pb-20">
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <TextFormField name="email" label="Email" type="email" />
              <TextFormField name="password" label="Password" type="password" />

              <Button
                type="submit"
                disabled={form.saveStatus === "saving"}
                className="w-full"
              >
                {form.saveStatus === "saving" ? "Signing you in..." : "Sign in to dashboard"}
              </Button>
            </form>
          </Form>

          <Button asChild variant="link" className="px-0">
            <Link href="/forgot-password">Forgot your password?</Link>
          </Button>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        isSubmitting={form.saveStatus === "saving"}
        saveLabel="Sign in"
        onSave={() => void form.handleSubmit(onSubmit)()}
        onDiscard={() => form.reset()}
        onRetry={() => void form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}
