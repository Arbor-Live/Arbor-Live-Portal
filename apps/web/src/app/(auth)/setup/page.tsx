"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/lib/convex-api";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestWizardNav } from "@/components/request/request-wizard-nav";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

type StepId = "welcome" | "identity" | "password" | "thankYou";

const STEP_ORDER: StepId[] = ["welcome", "identity", "password", "thankYou"];
const PROGRESS_STEPS: StepId[] = ["identity", "password"];

const STEP_HEADLINES: Record<StepId, string> = {
  welcome: "Set up Arbor Live",
  identity: "Who's setting this up?",
  password: "Choose a password",
  thankYou: "You're all set",
};

export default function SetupPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const availability = useQuery(api.bootstrap.isSetupAvailable, {});
  const setupFirstAdmin = useMutation(api.bootstrap.setupFirstAdmin);

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
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

  const currentStep = STEP_ORDER[stepIndex] ?? "welcome";
  const progressIndex = Math.max(0, PROGRESS_STEPS.indexOf(currentStep));
  const progressPercent =
    currentStep === "welcome"
      ? 0
      : currentStep === "thankYou"
        ? 100
        : ((progressIndex + 1) / PROGRESS_STEPS.length) * 100;

  const slideVariants = useMemo(
    () => ({
      enter: (dir: number) =>
        prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? 40 : -40, scale: 0.98 },
      center: prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 },
      exit: (dir: number) =>
        prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? -40 : 40, scale: 0.98 },
    }),
    [prefersReducedMotion],
  );

  const advance = useCallback(() => {
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, STEP_ORDER.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setFieldError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }, []);

  const goNext = useCallback(async () => {
    setFieldError(null);
    setSubmitError(null);

    if (currentStep === "welcome") {
      advance();
      return;
    }

    if (currentStep === "identity") {
      if (!name.trim()) {
        setFieldError("Enter your name.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setFieldError("Enter a valid email address.");
        return;
      }
      advance();
      return;
    }

    if (currentStep === "password") {
      if (password.length < 8) {
        setFieldError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setFieldError("Passwords do not match.");
        return;
      }
      // UI-only walkthrough when setup is already locked (dev preview).
      if (devPreview && availability?.available === false) {
        advance();
        return;
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
        advance();
      } catch (error) {
        setSubmitError(getConvexErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    advance();
  }, [
    advance,
    availability?.available,
    confirmPassword,
    currentStep,
    devPreview,
    email,
    name,
    password,
    setupFirstAdmin,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      if (currentStep === "thankYou") return;
      event.preventDefault();
      void goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStep, goNext]);

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
    <RequestWizardShell
      eyebrow={devPreview ? "Dev preview · First-time setup" : "First-time setup"}
      meta="Arbor Live"
      progressPercent={progressPercent}
      footer={
        currentStep !== "thankYou" ? (
          <RequestWizardNav
            showBack={stepIndex > 0}
            showNext
            nextLabel={currentStep === "password" ? "Create admin account" : "Next"}
            isSubmitting={isSubmitting}
            onBack={goBack}
            onNext={() => void goNext()}
          />
        ) : null
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        {submitError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring}
            className="space-y-6 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-6"
          >
            <motion.h1
              className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, ...spring }}
            >
              {STEP_HEADLINES[currentStep]}
            </motion.h1>

            {currentStep === "welcome" ? (
              <div className="space-y-3 text-sm text-foreground/70">
                <p>
                  No admin account exists yet for this Arbor Live deployment. Let&apos;s create the
                  first one so you can sign in and start configuring the portal.
                </p>
                <p>This will only take a minute.</p>
              </div>
            ) : null}

            {currentStep === "identity" ? (
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
                {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
              </div>
            ) : null}

            {currentStep === "password" ? (
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
                {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
              </div>
            ) : null}

            {currentStep === "thankYou" ? (
              <div className="space-y-4 text-sm text-foreground/70">
                <p>
                  Your admin account is ready and you&apos;re signed in. Redirecting you to the
                  dashboard…
                </p>
                <Button onClick={() => router.push("/dashboard")}>Go to dashboard</Button>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </RequestWizardShell>
  );
}
