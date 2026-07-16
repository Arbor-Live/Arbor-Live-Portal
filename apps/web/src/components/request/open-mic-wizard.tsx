"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { submitOpenMicSignup } from "@/app/public/open-mic/actions";
import { RequestWizardNav } from "@/components/request/request-wizard-nav";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { MultiChoiceField } from "@/components/request/fields/multi-choice-field";
import { TextField } from "@/components/request/fields/text-field";
import { TextareaField } from "@/components/request/fields/textarea-field";
import { OpenMicIntroSlide } from "@/components/request/open-mic-intro-slide";
import { formatDateTime } from "@/lib/format";
import {
  OPEN_MIC_EQUIPMENT_OPTIONS,
  OPEN_MIC_INTRO_STEP,
  openMicSignupDefaultValues,
  openMicSignupSchema,
  getActiveSteps,
  type OpenMicSignupFormValues,
  type OpenMicStepConfig,
  type OpenMicStepId,
} from "@/lib/validations/open-mic";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

function StepSubheader({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <div className="space-y-3 text-sm text-foreground/70">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

export function OpenMicWizard() {
  const prefersReducedMotion = useReducedMotion();
  const marketingSettings = useQuery(api.marketingSettings.get, {});
  const activeNight = useQuery(api.openMic.getActiveNight, {});
  const showIntro = marketingSettings?.openMicMarketingBoost === true;

  const form = useForm<OpenMicSignupFormValues>({
    resolver: zodResolver(openMicSignupSchema as never) as Resolver<OpenMicSignupFormValues>,
    defaultValues: openMicSignupDefaultValues,
    mode: "onTouched",
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ nightTitle: string; nightStartAt: number } | null>(null);
  const directionRef = useRef(1);

  const equipment = form.watch("equipment");
  const showBgMusicLink = equipment.includes("Background Music");

  const baseSteps = useMemo(
    () => getActiveSteps({ showBgMusicLink }),
    [showBgMusicLink],
  );

  const activeSteps = useMemo<OpenMicStepConfig[]>(
    () => (showIntro ? [OPEN_MIC_INTRO_STEP, ...baseSteps] : baseSteps),
    [showIntro, baseSteps],
  );

  const currentStep = activeSteps[stepIndex] ?? activeSteps[0]!;

  const progressSteps = activeSteps.filter(
    (step) => step.id !== "intro" && step.id !== "welcome" && step.id !== "thankYou",
  );
  const progressIndex = Math.max(
    0,
    progressSteps.findIndex((step) => step.id === currentStep.id),
  );
  const progressPercent =
    currentStep.id === "intro" || currentStep.id === "welcome"
      ? 0
      : currentStep.id === "thankYou"
        ? 100
        : ((progressIndex + 1) / progressSteps.length) * 100;

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
    directionRef.current = 1;
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, activeSteps.length - 1));
  }, [activeSteps.length]);

  const goNext = useCallback(async () => {
    setSubmitError(null);
    const step = activeSteps[stepIndex]!;

    if (step.id === "intro" || step.id === "welcome") {
      advance();
      return;
    }

    if (step.fields.length > 0 && !step.skippable) {
      const valid = await form.trigger(step.fields);
      if (!valid) return;
    }

    if (step.id === "notes") {
      if (!activeNight) {
        setSubmitError("No upcoming open mic night is open for sign-ups right now. Check back soon!");
        return;
      }
      setIsSubmitting(true);
      const result = await submitOpenMicSignup(activeNight._id, form.getValues());
      setIsSubmitting(false);
      if (!result.ok) {
        setSubmitError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof OpenMicSignupFormValues, { message });
          }
        }
        return;
      }
      setConfirmation({ nightTitle: result.nightTitle, nightStartAt: result.nightStartAt });
    }

    advance();
  }, [activeSteps, activeNight, advance, form, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex === 0 || currentStep.id === "thankYou") return;
    directionRef.current = -1;
    setDirection(-1);
    setStepIndex((index) => Math.max(index - 1, 0));
  }, [currentStep.id, stepIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      if (currentStep.id === "thankYou") return;
      event.preventDefault();
      void goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStep.id, goNext]);

  if (activeNight === undefined) {
    return (
      <PublicMarketingLayout hideFooter>
        <RequestWizardShell eyebrow="Open Mic sign-up" progressPercent={0}>
          <div className="px-4 py-8 sm:px-6">
            <p className="text-sm text-foreground/70">Loading…</p>
          </div>
        </RequestWizardShell>
      </PublicMarketingLayout>
    );
  }

  if (activeNight === null) {
    return (
      <PublicMarketingLayout hideFooter>
        <RequestWizardShell eyebrow="Open Mic sign-up" progressPercent={0}>
          <div className="px-4 py-8 sm:px-6">
            <div className="space-y-3 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-6">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                No open mic right now
              </h1>
              <p className="text-sm text-foreground/70">
                There isn&apos;t an upcoming Arbor Live open mic accepting sign-ups at the moment.
                Check back closer to the next night, or follow us on Instagram for the schedule.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://instagram.com/thearborstanford"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @thearborstanford
                </a>
              </Button>
            </div>
          </div>
        </RequestWizardShell>
      </PublicMarketingLayout>
    );
  }

  return (
    <PublicMarketingLayout hideFooter>
      <RequestWizardShell
        eyebrow={`Open Mic sign-up · ${activeNight.title}`}
        meta={formatDateTime(activeNight.startAt)}
        progressPercent={progressPercent}
        footer={
          currentStep.id !== "thankYou" && currentStep.id !== "intro" ? (
            <RequestWizardNav
              showBack={stepIndex > 0}
              showNext
              nextLabel={currentStep.id === "notes" ? "Sign me up" : "Next"}
              isSubmitting={isSubmitting}
              skippable={currentStep.skippable}
              onBack={goBack}
              onNext={() => void goNext()}
              onSkip={() => {
                directionRef.current = 1;
                setDirection(1);
                setStepIndex((index) => Math.min(index + 1, activeSteps.length - 1));
              }}
            />
          ) : null
        }
      >
        <FormProvider {...form}>
          <form
            className="flex min-h-0 w-full flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void goNext();
            }}
          >
            <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("website")} />

            <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              {submitError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}

              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentStep.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={spring}
                  className="space-y-6 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-6"
                >
                  {currentStep.id === "intro" ? (
                    <OpenMicIntroSlide onContinue={() => void goNext()} />
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <motion.h1
                          className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
                          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05, ...spring }}
                        >
                          {currentStep.headline}
                        </motion.h1>
                        {currentStep.subheader ? <StepSubheader text={currentStep.subheader} /> : null}
                      </div>

                      <StepBody
                        stepId={currentStep.id}
                        confirmation={confirmation}
                      />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </form>
        </FormProvider>
      </RequestWizardShell>
    </PublicMarketingLayout>
  );
}

function StepBody({
  stepId,
  confirmation,
}: {
  stepId: OpenMicStepId;
  confirmation: { nightTitle: string; nightStartAt: number } | null;
}) {
  switch (stepId) {
    case "name":
      return <TextField name="name" label="Your name" placeholder="First and last name" autoFocus />;
    case "email":
      return <TextField name="email" label="Stanford email" placeholder="you@stanford.edu" type="email" autoFocus />;
    case "whatYoureDoing":
      return (
        <TextareaField
          name="whatTheyreDoing"
          label="Your answer"
          placeholder="Singing a song, doing a comedy set, playing guitar..."
          autoFocus
        />
      );
    case "equipment":
      return <MultiChoiceField name="equipment" options={OPEN_MIC_EQUIPMENT_OPTIONS} />;
    case "bgMusicLink":
      return (
        <TextField
          name="bgMusicLink"
          label="Background music link"
          placeholder="https://youtube.com/watch?v=..."
          type="text"
          autoFocus
        />
      );
    case "notes":
      return (
        <TextareaField
          name="notes"
          label="Your answer"
          placeholder="Pronouns, set length, anything we should know..."
          autoFocus
        />
      );
    case "thankYou":
      return (
        <div className="space-y-4 text-sm text-foreground/70">
          <p>You&apos;re on the list — we&apos;ll call you up when it&apos;s your turn.</p>
          {confirmation ? (
            <div className="border border-border/50 bg-background/50 p-4 text-foreground">
              <p className="font-medium">{confirmation.nightTitle}</p>
              <p className="mt-1 text-foreground/70">{formatDateTime(confirmation.nightStartAt)}</p>
            </div>
          ) : null}
          <p>
            Bring friends, show up on time, and check in with the crew when you arrive so we know
            you&apos;re here.
          </p>
        </div>
      );
    default:
      return null;
  }
}