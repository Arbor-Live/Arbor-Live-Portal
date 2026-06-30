"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validations/auth";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token"), [searchParams]);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useConvexForm<ResetPasswordFormValues>({
    schema: resetPasswordSchema,
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    setSuccess(null);
    if (!token) {
      throw new Error("Missing or invalid reset token.");
    }
    const result = await authClient.resetPassword({
      token,
      newPassword: values.password,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to reset password.");
    }
    setSuccess("Password reset complete. You can now sign in.");
    form.reset();
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
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <TextFormField name="password" label="New password" type="password" />
              <TextFormField
                name="confirmPassword"
                label="Confirm password"
                type="password"
              />

              {success ? (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                disabled={form.saveStatus === "saving" || !token}
                className="w-full"
              >
                {form.saveStatus === "saving" ? "Updating..." : "Update password"}
              </Button>

              {form.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{form.saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </Form>

          <Button asChild variant="link" className="px-0">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
