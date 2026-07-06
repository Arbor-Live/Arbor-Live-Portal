"use client";

import Link from "next/link";
import { useState } from "react";
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
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validations/auth";

export default function ForgotPasswordPage() {
  const [success, setSuccess] = useState<string | null>(null);

  const form = useConvexForm<ForgotPasswordFormValues>({
    schema: forgotPasswordSchema,
    defaultValues: { email: "" },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    setSuccess(null);
    const result = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to request reset.");
    }
    setSuccess("If your email exists, a reset link has been sent.");
    form.reset(values);
    return result;
  });

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your account email to receive a password reset link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <TextFormField name="email" label="Email" type="email" />

              {success ? (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                disabled={form.saveStatus === "saving"}
                className="w-full"
              >
                {form.saveStatus === "saving" ? "Sending..." : "Send reset link"}
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
