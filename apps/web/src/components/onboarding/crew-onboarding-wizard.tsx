"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestWizardNav } from "@/components/request/request-wizard-nav";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { UserAvatarUploadPreview } from "@/components/account/user-avatar";
import {
  OnboardingAckCheckbox,
  OnboardingLinkCard,
  OnboardingSkipButton,
  OnboardingTextarea,
  OnboardingYesNoChoice,
} from "@/components/onboarding/onboarding-ui";
import { FWS_JOB_INFO, ONBOARDING_LINKS } from "@/lib/onboarding-links";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

/**
 * getMyCrewOnboarding's inferred return type is a narrow union across its two
 * code paths (existing row vs. synthetic not-started fallback), so TS won't
 * let us read optional fields directly. This mirrors the declared Convex
 * validator shape where every progress field is genuinely optional.
 */
type CrewOnboardingData = {
  status: "not_started" | "in_progress" | "completed" | "waived";
  incompleteStepCount: number;
  profileCompletedAt?: number;
  whatsappAcknowledgedAt?: number;
  instagramAcknowledgedAt?: number;
  hasFederalWorkStudy?: boolean | null;
  fwsAcknowledgedAt?: number;
  narcanCompletedAt?: number;
  soberMonitorCompletedAt?: number;
  emergencySopsAcknowledgedAt?: number;
  crewExpectationsAcknowledgedAt?: number;
  liftingCompletedAt?: number;
  hasValidDriversLicense?: boolean;
  cartTrainingCompletedAt?: number;
  oseHiringFormCompletedAt?: number;
  timecardAcknowledgedAt?: number;
  agreedToOnboardingDocAt?: number;
  signatureLegalName?: string;
  completedAt?: number;
  profile: {
    name: string;
    email: string;
    avatarUrl?: string;
    calendarInviteEmail?: string;
    showOnPublicCrewPage: boolean;
    publicCrewDescription?: string;
  };
};

type StepId =
  | "welcome"
  | "profile"
  | "whatsapp"
  | "instagram"
  | "fws"
  | "training"
  | "gettingPaid"
  | "hours"
  | "signature"
  | "thankYou";

const STEP_ORDER: StepId[] = [
  "welcome",
  "profile",
  "whatsapp",
  "instagram",
  "fws",
  "training",
  "gettingPaid",
  "hours",
  "signature",
  "thankYou",
];

const PROGRESS_STEPS: StepId[] = STEP_ORDER.filter(
  (id) => id !== "welcome" && id !== "thankYou",
);

const STEP_HEADLINES: Record<StepId, string> = {
  welcome: "Welcome to Arbor Live",
  profile: "Tell us about yourself",
  whatsapp: "Join the crew chat",
  instagram: "Follow us on Instagram",
  fws: "Federal Work Study",
  training: "Required training",
  gettingPaid: "Getting paid",
  hours: "Logging your hours",
  signature: "Sign your onboarding agreement",
  thankYou: "You're all set!",
};

type FormState = {
  name: string;
  /** Account email — Boring Avatar seed (not calendar invite). */
  email: string;
  calendarInviteEmail: string;
  showOnPublicCrewPage: boolean;
  publicCrewDescription: string;
  whatsappAcknowledged: boolean;
  instagramAcknowledged: boolean;
  hasFederalWorkStudy: boolean | null;
  fwsAcknowledged: boolean;
  narcanCompleted: boolean;
  soberMonitorCompleted: boolean;
  emergencySopsAcknowledged: boolean;
  crewExpectationsAcknowledged: boolean;
  liftingCompleted: boolean;
  hasValidDriversLicense: boolean;
  cartTrainingCompleted: boolean;
  oseHiringFormCompleted: boolean;
  timecardAcknowledged: boolean;
  signatureLegalName: string;
  agreedToDoc: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  calendarInviteEmail: "",
  showOnPublicCrewPage: false,
  publicCrewDescription: "",
  whatsappAcknowledged: false,
  instagramAcknowledged: false,
  hasFederalWorkStudy: null,
  fwsAcknowledged: false,
  narcanCompleted: false,
  soberMonitorCompleted: false,
  emergencySopsAcknowledged: false,
  crewExpectationsAcknowledged: false,
  liftingCompleted: false,
  hasValidDriversLicense: false,
  cartTrainingCompleted: false,
  oseHiringFormCompleted: false,
  timecardAcknowledged: false,
  signatureLegalName: "",
  agreedToDoc: false,
};

export function CrewOnboardingWizard() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const onboarding = useQuery(api.onboarding.getMyCrewOnboarding, {}) as
    | CrewOnboardingData
    | null
    | undefined;
  const saveProfileStep = useMutation(api.onboarding.saveCrewProfileStep);
  const saveOnboardingStep = useMutation(api.onboarding.saveCrewOnboardingStep);
  const completeOnboarding = useMutation(api.onboarding.completeCrewOnboarding);
  const ensureOnboarding = useMutation(api.onboarding.ensureMyCrewOnboarding);
  const generateAvatarUploadUrl = useMutation(api.account.generateAvatarUploadUrl);
  const setMyAvatar = useMutation(api.account.setMyAvatar);

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Local blob preview from an in-progress upload; server avatarUrl (which may
  // arrive slightly after the onboarding row is created) is used otherwise.
  const [avatarPreviewOverride, setAvatarPreviewOverride] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    void ensureOnboarding({});
  }, [ensureOnboarding]);

  useEffect(() => {
    if (!onboarding || hydratedRef.current) return;
    hydratedRef.current = true;
    setForm({
      name: onboarding.profile.name ?? "",
      email: onboarding.profile.email ?? "",
      calendarInviteEmail: onboarding.profile.calendarInviteEmail ?? "",
      showOnPublicCrewPage: onboarding.profile.showOnPublicCrewPage ?? false,
      publicCrewDescription: onboarding.profile.publicCrewDescription ?? "",
      whatsappAcknowledged: Boolean(onboarding.whatsappAcknowledgedAt),
      instagramAcknowledged: Boolean(onboarding.instagramAcknowledgedAt),
      hasFederalWorkStudy: onboarding.hasFederalWorkStudy ?? null,
      fwsAcknowledged: Boolean(onboarding.fwsAcknowledgedAt),
      narcanCompleted: Boolean(onboarding.narcanCompletedAt),
      soberMonitorCompleted: Boolean(onboarding.soberMonitorCompletedAt),
      emergencySopsAcknowledged: Boolean(onboarding.emergencySopsAcknowledgedAt),
      crewExpectationsAcknowledged: Boolean(onboarding.crewExpectationsAcknowledgedAt),
      liftingCompleted: Boolean(onboarding.liftingCompletedAt),
      hasValidDriversLicense: Boolean(onboarding.hasValidDriversLicense),
      cartTrainingCompleted: Boolean(onboarding.cartTrainingCompletedAt),
      oseHiringFormCompleted: Boolean(onboarding.oseHiringFormCompletedAt),
      timecardAcknowledged: Boolean(onboarding.timecardAcknowledgedAt),
      signatureLegalName: onboarding.signatureLegalName ?? "",
      agreedToDoc: Boolean(onboarding.agreedToOnboardingDocAt),
    });
  }, [onboarding]);

  // Avatar/email seed for the avatar preview are decorative-only (not part of
  // the submitted profile payload), so they're derived directly from the live
  // query instead of copied into `form` — this also naturally covers the
  // avatar arriving after the initial hydrate (ensure-row race).
  const avatarUrl = avatarPreviewOverride ?? onboarding?.profile.avatarUrl ?? "";
  const avatarSeedEmail = onboarding?.profile.email || form.email || "crew";

  useEffect(() => {
    if (!previewReady || devPreview) return;
    if (onboarding === null) {
      router.replace("/dashboard");
      return;
    }
    if (onboarding && (onboarding.status === "completed" || onboarding.status === "waived")) {
      router.replace("/dashboard");
    }
  }, [onboarding, router, previewReady, devPreview]);

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

  const goToDashboard = useCallback(() => router.push("/dashboard"), [router]);

  // Walk the UI without writing when previewing without an onboarding row.
  const previewOnly = Boolean(devPreview && onboarding === null);

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
    setError(null);

    try {
      if (currentStep === "welcome") {
        advance();
        return;
      }

      if (currentStep === "profile") {
        if (!form.name.trim()) {
          setFieldError("Enter your name.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveProfileStep({
          name: form.name.trim(),
          calendarInviteEmail: form.calendarInviteEmail.trim() || undefined,
          showOnPublicCrewPage: form.showOnPublicCrewPage,
          publicCrewDescription: form.publicCrewDescription.trim() || undefined,
        });
        advance();
        return;
      }

      if (currentStep === "whatsapp") {
        if (!form.whatsappAcknowledged) {
          setFieldError("Confirm you've joined the WhatsApp group to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({ whatsappAcknowledged: true });
        advance();
        return;
      }

      if (currentStep === "instagram") {
        if (!form.instagramAcknowledged) {
          setFieldError("Confirm you've followed both accounts to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({ instagramAcknowledged: true });
        advance();
        return;
      }

      if (currentStep === "fws") {
        if (form.hasFederalWorkStudy === null) {
          setFieldError("Select whether you have Federal Work Study.");
          return;
        }
        if (!form.fwsAcknowledged) {
          setFieldError("Check the acknowledgement box to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({
          hasFederalWorkStudy: form.hasFederalWorkStudy,
          fwsAcknowledged: true,
        });
        advance();
        return;
      }

      if (currentStep === "training") {
        const incomplete =
          !form.narcanCompleted ||
          !form.soberMonitorCompleted ||
          !form.emergencySopsAcknowledged ||
          !form.crewExpectationsAcknowledged ||
          !form.liftingCompleted ||
          (form.hasValidDriversLicense && !form.cartTrainingCompleted);
        if (incomplete) {
          setFieldError("Complete every training item above to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({
          narcanCompleted: true,
          soberMonitorCompleted: true,
          emergencySopsAcknowledged: true,
          crewExpectationsAcknowledged: true,
          liftingCompleted: true,
          hasValidDriversLicense: form.hasValidDriversLicense,
          cartTrainingCompleted: form.hasValidDriversLicense ? true : undefined,
        });
        advance();
        return;
      }

      if (currentStep === "gettingPaid") {
        if (!form.oseHiringFormCompleted) {
          setFieldError("Confirm you've submitted the OSE hiring form to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({ oseHiringFormCompleted: true });
        advance();
        return;
      }

      if (currentStep === "hours") {
        if (!form.timecardAcknowledged) {
          setFieldError("Confirm you understand the timecard process to continue.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveOnboardingStep({ timecardAcknowledged: true });
        advance();
        return;
      }

      if (currentStep === "signature") {
        if (form.signatureLegalName.trim().length < 2) {
          setFieldError("Type your full legal name to sign.");
          return;
        }
        if (!form.agreedToDoc) {
          setFieldError("Check the box to agree before signing.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await completeOnboarding({
          signatureLegalName: form.signatureLegalName.trim(),
          signatureUserAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        });
        advance();
        return;
      }

      advance();
    } catch (submitError) {
      setError(getConvexErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    advance,
    completeOnboarding,
    currentStep,
    form,
    previewOnly,
    saveOnboardingStep,
    saveProfileStep,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      if (currentStep === "thankYou") return;
      event.preventDefault();
      void goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStep, goNext]);

  async function onAvatarSelected(file: File) {
    if (previewOnly) {
      setAvatarPreviewOverride(URL.createObjectURL(file));
      return;
    }
    setAvatarBusy(true);
    setError(null);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Profile photo must be 2 MB or smaller.");
      }
      const uploadUrl = await generateAvatarUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setMyAvatar({ storageId });
      setAvatarPreviewOverride(URL.createObjectURL(file));
    } catch (uploadError) {
      setError(getConvexErrorMessage(uploadError));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (onboarding === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your onboarding…</p>
      </div>
    );
  }

  if (!onboarding && !devPreview) {
    return null;
  }

  return (
    <>
      {currentStep !== "thankYou" ? <OnboardingSkipButton onSkip={goToDashboard} /> : null}
      <RequestWizardShell
        eyebrow={devPreview ? "Dev preview · Crew onboarding" : "Crew onboarding"}
        meta="Arbor Live"
        progressPercent={progressPercent}
        footer={
          currentStep !== "thankYou" ? (
            <RequestWizardNav
              showBack={stepIndex > 0}
              showNext
              nextLabel={currentStep === "signature" ? "Sign & submit" : "Next"}
              isSubmitting={isSubmitting}
              onBack={goBack}
              onNext={() => void goNext()}
            />
          ) : null
        }
      >
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
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

              <StepBody
                stepId={currentStep}
                form={form}
                setForm={setForm}
                fieldError={fieldError}
                avatarBusy={avatarBusy}
                avatarUrl={avatarUrl}
                avatarSeedEmail={avatarSeedEmail}
                onAvatarSelected={onAvatarSelected}
                onGoToDashboard={goToDashboard}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </RequestWizardShell>
    </>
  );
}

function StepBody({
  stepId,
  form,
  setForm,
  fieldError,
  avatarBusy,
  avatarUrl,
  avatarSeedEmail,
  onAvatarSelected,
  onGoToDashboard,
}: {
  stepId: StepId;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  fieldError: string | null;
  avatarBusy: boolean;
  avatarUrl: string;
  avatarSeedEmail: string;
  onAvatarSelected: (file: File) => void;
  onGoToDashboard: () => void;
}) {
  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

  switch (stepId) {
    case "welcome":
      return (
        <div className="space-y-4 text-sm text-foreground/70">
          <p>
            We&apos;re glad you&apos;re joining the crew. This short walkthrough covers everything
            you need before your first shift: our WhatsApp and Instagram, required safety
            training, Federal Work Study, how to get paid, and logging your hours.
          </p>
          <p>It takes about 10 minutes. You can leave anytime and pick up where you left off.</p>
        </div>
      );

    case "profile":
      return (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <UserAvatarUploadPreview
              name={form.name || "Crew member"}
              email={avatarSeedEmail}
              imageUrl={avatarUrl || null}
            />
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                id="crew-avatar-input"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onAvatarSelected(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={() => document.getElementById("crew-avatar-input")?.click()}
              >
                {avatarBusy ? "Uploading…" : "Upload photo"}
              </Button>
              <p className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB. Optional.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crew-name">Full name</Label>
            <Input
              id="crew-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Your full name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="crew-calendar-email">Calendar invite email (optional)</Label>
            <Input
              id="crew-calendar-email"
              type="email"
              value={form.calendarInviteEmail}
              onChange={(event) => patch({ calendarInviteEmail: event.target.value })}
              placeholder="Leave blank to use your account email"
            />
          </div>

          <OnboardingAckCheckbox
            checked={form.showOnPublicCrewPage}
            onChange={(next) => patch({ showOnPublicCrewPage: next })}
            label="List me on the public crew page with a short blurb."
          />

          {form.showOnPublicCrewPage ? (
            <OnboardingTextarea
              value={form.publicCrewDescription}
              onChange={(event) => patch({ publicCrewDescription: event.target.value })}
              placeholder="A sentence or two about yourself…"
            />
          ) : null}

          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "whatsapp":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Crew coordination, shift reminders, and last-minute changes all happen in our WhatsApp
            group, <span className="font-medium">{ONBOARDING_LINKS.whatsappGroupName}</span>.
          </p>
          <OnboardingLinkCard
            href={ONBOARDING_LINKS.whatsappInvite}
            title="Join the WhatsApp group"
            description={ONBOARDING_LINKS.whatsappGroupName}
          />
          <OnboardingAckCheckbox
            checked={form.whatsappAcknowledged}
            onChange={(next) => patch({ whatsappAcknowledged: next })}
            label="I've joined the Arbor WhatsApp group."
          />
          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "instagram":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Follow both of our accounts to stay in the loop on events and see your work featured.
          </p>
          <div className="space-y-2">
            <OnboardingLinkCard
              href={ONBOARDING_LINKS.instagramArbor}
              title="Follow @thearborstanford"
              description="Main Arbor Live account"
            />
            <OnboardingLinkCard
              href={ONBOARDING_LINKS.instagramTrivia}
              title="Follow @arbortrivia"
              description="Trivia nights and specials"
            />
          </div>
          <OnboardingAckCheckbox
            checked={form.instagramAcknowledged}
            onChange={(next) => patch({ instagramAcknowledged: next })}
            label="I've followed both Instagram accounts."
          />
          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "fws":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Do you have Federal Work Study (FWS) awarded through Stanford financial aid?
          </p>
          <OnboardingYesNoChoice
            value={form.hasFederalWorkStudy}
            onChange={(next) => patch({ hasFederalWorkStudy: next })}
          />

          {form.hasFederalWorkStudy ? (
            <div className="space-y-3 border border-border/50 bg-background/50 p-3 text-sm">
              <div className="space-y-2 text-foreground/70">
                <p className="font-medium text-foreground">Submit an FWS Authorization Request</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    Open the FWS page and click{" "}
                    <span className="font-medium text-foreground">
                      &ldquo;FWS Authorization Request&rdquo;
                    </span>
                    .
                  </li>
                  <li>Enter the job, supervisor, and HR details shown below.</li>
                  <li>
                    Under{" "}
                    <span className="font-medium text-foreground">
                      Department HR Administrator
                    </span>
                    , enter {FWS_JOB_INFO.hrAdminName}&apos;s info (she is different from your
                    supervisor).
                  </li>
                </ol>
              </div>

              <OnboardingLinkCard
                href={ONBOARDING_LINKS.fwsInfo}
                title="Open the FWS page"
                description='Then click “FWS Authorization Request”'
              />

              <div className="space-y-3 border-t border-border/50 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  2. Job info
                </p>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-foreground/80">Hiring Department</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.hiringDepartment}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Job Title</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.jobTitle}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-foreground/80">Brief Description of Duties</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.briefDescription}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Hourly Wage</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.hourlyWage}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Project Task Award</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.projectTaskAward}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-3 border-t border-border/50 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  3. Supervisor
                </p>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-foreground/80">Supervisor&apos;s Name</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.supervisorName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Supervisor&apos;s Email</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.supervisorEmail}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-3 border-t border-border/50 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  4. Department HR Administrator
                </p>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-foreground/80">Administrator&apos;s Name</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.hrAdminName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground/80">Administrator&apos;s Email</dt>
                    <dd className="text-muted-foreground">{FWS_JOB_INFO.hrAdminEmail}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {form.hasFederalWorkStudy !== null ? (
            <OnboardingAckCheckbox
              checked={form.fwsAcknowledged}
              onChange={(next) => patch({ fwsAcknowledged: next })}
              label={
                form.hasFederalWorkStudy
                  ? "I've submitted (or will submit) the FWS Authorization Request with the details above."
                  : "I understand I don't have Federal Work Study and will be paid through Arbor's standard process."
              }
            />
          ) : null}

          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "training":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Complete each training item below. Some are quick videos or guides, others are short
            forms or tests.
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Narcan training video</p>
            <div className="overflow-hidden border border-border/50 bg-black/5 aspect-video">
              <iframe
                title="Narcan training video"
                src={ONBOARDING_LINKS.narcanVideoEmbed}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <OnboardingLinkCard
              href={ONBOARDING_LINKS.narcanVideo}
              title="Open video in YouTube"
              description="If the embed doesn't load"
            />
            <OnboardingAckCheckbox
              checked={form.narcanCompleted}
              onChange={(next) => patch({ narcanCompleted: next })}
              label="I've watched the Narcan training video."
            />
          </div>

          <div className="space-y-2">
            <OnboardingLinkCard href={ONBOARDING_LINKS.soberMonitorsGuide} title="Sober monitors guide" />
            <OnboardingLinkCard href={ONBOARDING_LINKS.soberMonitorsTest} title="Sober monitors test" />
            <OnboardingAckCheckbox
              checked={form.soberMonitorCompleted}
              onChange={(next) => patch({ soberMonitorCompleted: next })}
              label="I've reviewed the sober monitors guide and completed the test."
            />
          </div>

          <div className="space-y-2">
            <OnboardingLinkCard href={ONBOARDING_LINKS.onboardingDoc} title="Emergency SOPs & crew expectations" description="Notion onboarding doc" />
            <OnboardingAckCheckbox
              checked={form.emergencySopsAcknowledged}
              onChange={(next) => patch({ emergencySopsAcknowledged: next })}
              label="I've read the emergency SOPs."
            />
            <OnboardingAckCheckbox
              checked={form.crewExpectationsAcknowledged}
              onChange={(next) => patch({ crewExpectationsAcknowledged: next })}
              label="I've read the crew expectations."
            />
          </div>

          <div className="space-y-2">
            <OnboardingLinkCard
              href={ONBOARDING_LINKS.liftingTrainingUrl}
              title="Lifting & material handling training"
              description={`STARS Express · ${ONBOARDING_LINKS.liftingTrainingCode}`}
            />
            <OnboardingAckCheckbox
              checked={form.liftingCompleted}
              onChange={(next) => patch({ liftingCompleted: next })}
              label="I've completed the lifting training."
            />
          </div>

          <div className="space-y-2 border-t border-border/50 pt-4">
            <p className="text-sm text-foreground/70">
              Do you have a valid driver&apos;s license? Crew with a license can also complete cart
              training.
            </p>
            <OnboardingYesNoChoice
              value={form.hasValidDriversLicense}
              onChange={(next) =>
                patch({
                  hasValidDriversLicense: next,
                  cartTrainingCompleted: next ? form.cartTrainingCompleted : false,
                })
              }
            />
            {form.hasValidDriversLicense ? (
              <>
                <OnboardingLinkCard
                  href={ONBOARDING_LINKS.starsPortal}
                  title="Cart training"
                  description={`STARS code: ${ONBOARDING_LINKS.cartTrainingCode}`}
                />
                <OnboardingAckCheckbox
                  checked={form.cartTrainingCompleted}
                  onChange={(next) => patch({ cartTrainingCompleted: next })}
                  label="I've completed cart training."
                />
              </>
            ) : null}
          </div>

          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "gettingPaid":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Complete the Office of Student Engagement (OSE) hiring form so we can set you up to get
            paid. If you have questions, reach out to our Stanford HR contact,{" "}
            <span className="font-medium">{FWS_JOB_INFO.hrAdminName}</span> (
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={`mailto:${FWS_JOB_INFO.hrAdminEmail}`}
            >
              {FWS_JOB_INFO.hrAdminEmail}
            </a>
            ).
          </p>
          <OnboardingLinkCard href={ONBOARDING_LINKS.oseHiringForm} title="Open the OSE hiring form" />
          <OnboardingAckCheckbox
            checked={form.oseHiringFormCompleted}
            onChange={(next) => patch({ oseHiringFormCompleted: next })}
            label="I've submitted the OSE hiring form."
          />
          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "hours":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Log your worked hours in Sequoia after every shift so payroll stays accurate.
          </p>
          <OnboardingLinkCard
            href={ONBOARDING_LINKS.sequoiaTimecardHelp}
            title="Sequoia Time Card guide"
            description="How to enter time, effort, and absences"
          />
          <OnboardingAckCheckbox
            checked={form.timecardAcknowledged}
            onChange={(next) => patch({ timecardAcknowledged: next })}
            label="I understand how to log my hours in Sequoia."
          />
          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "signature":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            Review the full onboarding agreement, then sign below to complete onboarding.
          </p>
          <OnboardingLinkCard href={ONBOARDING_LINKS.onboardingDoc} title="Review the onboarding agreement" />

          <div className="space-y-2">
            <Label htmlFor="crew-signature">Type your full legal name to sign</Label>
            <Input
              id="crew-signature"
              value={form.signatureLegalName}
              onChange={(event) => patch({ signatureLegalName: event.target.value })}
              placeholder="Full legal name"
              autoFocus
            />
          </div>

          <OnboardingAckCheckbox
            checked={form.agreedToDoc}
            onChange={(next) => patch({ agreedToDoc: next })}
            label="I agree to the onboarding terms and expectations above."
          />

          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
      );

    case "thankYou":
      return (
        <div className="space-y-4 text-sm text-foreground/70">
          <p>Welcome to the crew! Your onboarding is complete.</p>
          <Button onClick={onGoToDashboard}>Go to dashboard</Button>
        </div>
      );

    default:
      return null;
  }
}
