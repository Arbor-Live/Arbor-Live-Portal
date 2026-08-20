"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api } from "@/lib/convex-api";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import {
  Questionnaire,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  QUESTIONNAIRE_ITEM_CLASSNAME,
  QUESTIONNAIRE_TITLE_CLASSNAME,
  handleQuestionnaireEnter,
  MarkStepAnswered,
  QuestionnaireWizardFooter,
  QuestionnaireWizardProgress,
} from "@/components/ui/questionnaire-wizard";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";

type StepId = "welcome" | "identity" | "password";

const QUESTION_STEPS: StepId[] = ["welcome", "identity", "password"];

const STEP_HEADLINES: Record<StepId | "thankYou", string> = {
  welcome: "Set up Arbor Live",
  identity: "Who's setting this up?",
  password: "Choose a password",
  thankYou: "You're all set",
};

export default function SetupPage() {
  const router = useRouter();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const availability = useQuery(api.bootstrap.isSetupAvailable, {});
  const setupFirstAdmin = useMutation(api.bootstrap.setupFirstAdmin);

  const [item, setItem] = useState<StepId>("welcome");
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!previewReady || devPreview) return;
    if (availability && availability.available === false) {
      router.replace("/sign-in");
    }
  }, [availability, router, previewReady, devPreview]);

  const items = useMemo<QuestionnaireItemDefinition[]>(
    () => QUESTION_STEPS.map((name) => ({ name, required: true })),
    [],
  );

  const goNext = useCallback(
    async (current: StepId) => {
      setFieldError(null);
      setSubmitError(null);

      if (current === "welcome") return true;

      if (current === "identity") {
        if (!name.trim()) {
          setFieldError("Enter your name.");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          setFieldError("Enter a valid email address.");
          return false;
        }
        return true;
      }

      if (current === "password") {
        if (password.length < 8) {
          setFieldError("Password must be at least 8 characters.");
          return false;
        }
        if (password !== confirmPassword) {
          setFieldError("Passwords do not match.");
          return false;
        }
        if (devPreview && availability?.available === false) {
          return true;
        }
        setIsSubmitting(true);
        try {
          await setupFirstAdmin({
            name: name.trim(),
            email: email.trim(),
            password,
          });
          const signInResult = await authClient.signIn.email({
            email: email.trim(),
            password,
            callbackURL: "/dashboard",
          });
          if (signInResult.error) {
            throw new Error(
              signInResult.error.message ?? "Account created, but sign-in failed. Try signing in.",
            );
          }
          return true;
        } catch (error) {
          setSubmitError(getConvexErrorMessage(error));
          return false;
        } finally {
          setIsSubmitting(false);
        }
      }

      return true;
    },
    [availability?.available, confirmPassword, devPreview, email, name, password, setupFirstAdmin],
  );

  const handleItemChange = useCallback(
    async (next: string) => {
      const currentIndex = QUESTION_STEPS.indexOf(item);
      const requestedIndex = QUESTION_STEPS.indexOf(next as StepId);
      const goingBack = requestedIndex !== -1 && requestedIndex < currentIndex;
      if (goingBack) {
        setFieldError(null);
        setItem(next as StepId);
        return;
      }
      if (await goNext(item)) setItem(next as StepId);
    },
    [goNext, item],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (await goNext("password")) setDone(true);
    },
    [goNext],
  );

  if (availability === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking setup status…</p>
      </div>
    );
  }

  if (availability.available === false && !devPreview) {
    return null;
  }

  return (
    <Questionnaire
      className="flex min-h-0 w-full flex-1 flex-col gap-0"
      items={items}
      item={item}
      shortcuts="letters"
      onItemChange={(next) => void handleItemChange(next)}
      onSubmit={(event) => void handleSubmit(event)}
      onKeyDown={handleQuestionnaireEnter}
    >
      <RequestWizardShell
        eyebrow={devPreview ? "Dev preview · First-time setup" : "First-time setup"}
        meta="Arbor Live"
        progress={
          <QuestionnaireWizardProgress complete={done} label="First-time setup progress" />
        }
        footer={
          done ? null : (
            <QuestionnaireWizardFooter
              disabled={isSubmitting}
              isSubmitting={isSubmitting}
              submitLabel="Create admin account"
            />
          )
        }
      >
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
          {submitError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          {done ? (
            <div className={QUESTIONNAIRE_ITEM_CLASSNAME}>
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {STEP_HEADLINES.thankYou}
              </h1>
              <div className="space-y-4 text-sm text-foreground/70">
                <p>
                  Your admin account is ready and you&apos;re signed in. Redirecting you to the
                  dashboard…
                </p>
                <Button onClick={() => router.push("/dashboard")}>Go to dashboard</Button>
              </div>
            </div>
          ) : (
            QUESTION_STEPS.map((stepId) => (
              <QuestionnaireItem
                key={stepId}
                name={stepId}
                required
                invalid={stepId !== "welcome" && Boolean(fieldError)}
                className={QUESTIONNAIRE_ITEM_CLASSNAME}
              >
                <QuestionnaireTitle className={QUESTIONNAIRE_TITLE_CLASSNAME}>
                  {STEP_HEADLINES[stepId]}
                </QuestionnaireTitle>
                {stepId === "welcome" ? (
                  <div className="space-y-3 text-sm text-foreground/70">
                    <p>
                      No admin account exists yet for this Arbor Live deployment. Let&apos;s create the
                      first one so you can sign in and start configuring the portal.
                    </p>
                    <p>This will only take a minute.</p>
                  </div>
                ) : null}

                {stepId === "identity" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="setup-name">Your name</Label>
                      <Input
                        id="setup-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Jordan Rivera"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="setup-email">Email</Label>
                      <Input
                        id="setup-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@arborlive.com"
                      />
                    </div>
                  </div>
                ) : null}

                {stepId === "password" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="setup-password">Password</Label>
                      <Input
                        id="setup-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="setup-confirm-password">Confirm password</Label>
                      <Input
                        id="setup-confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
                  </div>
                ) : null}

                <MarkStepAnswered />
                <QuestionnaireError className="text-sm">
                  {stepId === item ? fieldError : null}
                </QuestionnaireError>
              </QuestionnaireItem>
            ))
          )}
        </div>
      </RequestWizardShell>
    </Questionnaire>
  );
}
