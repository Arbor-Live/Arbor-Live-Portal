"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  handleQuestionnaireEnter,
  MarkStepAnswered,
  QuestionnaireFieldError,
  QuestionnaireWizardFooter,
  QuestionnaireWizardProgress,
} from "@/components/ui/questionnaire-wizard";
import { normalizeAvatarFile } from "@/lib/image-processing";
import {
  OnboardingAckCheckbox,
  OnboardingLinkCard,
  OnboardingSkipButton,
} from "@/components/onboarding/onboarding-ui";
import { CONTRACTOR_PAY_INFO, ONBOARDING_LINKS } from "@/lib/onboarding-links";
import { pacificDateAndTimeToMs, pacificDateKey } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";
import { EMPTY_FORM, QUESTION_STEPS, STEP_HEADLINES, stepOrderForPayroll } from "./crew/constants";
import type { FormState, StepId } from "./crew/types";
import { WelcomeStep } from "./crew/steps/welcome-step";
import { ProfileStep } from "./crew/steps/profile-step";
import { PasskeyStep } from "./crew/steps/passkey-step";
import { WhatsappStep } from "./crew/steps/whatsapp-step";
import { InstagramStep } from "./crew/steps/instagram-step";
import { FwsStep } from "./crew/steps/fws-step";
import { TrainingStep } from "./crew/steps/training-step";
import { GettingPaidStep } from "./crew/steps/getting-paid-step";

export function CrewOnboardingWizard() {
  const router = useRouter();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const onboarding = useQuery(api.onboarding.getMyCrewOnboarding, {});
  const saveProfileStep = useMutation(api.onboarding.saveCrewProfileStep);
  const saveOnboardingStep = useMutation(api.onboarding.saveCrewOnboardingStep);
  const completeOnboarding = useMutation(api.onboarding.completeCrewOnboarding);
  const ensureOnboarding = useMutation(api.onboarding.ensureMyCrewOnboarding);
  const generateAvatarUploadUrl = useMutation(api.account.generateAvatarUploadUrl);
  const setMyAvatar = useMutation(api.account.setMyAvatar);

  const [item, setItem] = useState<StepId>("welcome");
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [hasAddedPasskey, setHasAddedPasskey] = useState(false);
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
      phone: onboarding.profile.phone ?? "",
      calendarInviteEmail: onboarding.profile.calendarInviteEmail ?? "",
      showOnPublicCrewPage: onboarding.profile.showOnPublicCrewPage ?? false,
      publicCrewDescription: onboarding.profile.publicCrewDescription ?? "",
      pronouns: onboarding.profile.pronouns ?? "",
      username: onboarding.profile.username ?? "",
      gradYear: onboarding.profile.gradYear != null ? String(onboarding.profile.gradYear) : "",
      stanfordPosition: onboarding.profile.stanfordPosition ?? "",
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
      studentId: onboarding.studentId ?? "",
      employmentStartDate:
        onboarding.employmentStartDate != null ? pacificDateKey(onboarding.employmentStartDate) : "",
      hasOtherCampusEmployment: onboarding.hasOtherCampusEmployment ?? null,
      otherCampusEmploymentHours:
        onboarding.otherCampusEmploymentHours != null
          ? String(onboarding.otherCampusEmploymentHours)
          : "",
      i9Acknowledged: Boolean(onboarding.i9AcknowledgedAt),
      timecardAcknowledged: Boolean(onboarding.timecardAcknowledgedAt),
      contractorPayAcknowledged: Boolean(onboarding.contractorPayAcknowledgedAt),
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

  const payrollMethod = onboarding?.payrollMethod ?? "stanford";
  const stepOrder = stepOrderForPayroll(payrollMethod);
  const currentStep = item;

  const items = useMemo<QuestionnaireItemDefinition[]>(
    () =>
      QUESTION_STEPS.map((name) => ({
        name,
        required: true,
        disabled: !stepOrder.includes(name),
      })),
    [stepOrder],
  );

  const goToDashboard = useCallback(() => router.push("/dashboard"), [router]);

  // Walk the UI without writing when previewing without an onboarding row.
  const previewOnly = Boolean(devPreview && onboarding === null);

  const tryAdvance = useCallback(async (): Promise<boolean> => {
    setFieldError(null);
    setError(null);

    try {
      if (currentStep === "welcome") {
        return true;
      }

      if (currentStep === "profile") {
        if (!form.name.trim()) {
          setFieldError("Enter your name.");
          return false;
        }
        if (!form.phone.trim()) {
          setFieldError("Enter your phone number.");
          return false;
        }
        if (!form.stanfordPosition) {
          setFieldError("Select your student type.");
          return false;
        }
        const trimmedGradYear = form.gradYear.trim();
        if (trimmedGradYear && !/^\d{4}$/.test(trimmedGradYear)) {
          setFieldError("Enter a 4-digit graduation year.");
          return false;
        }
        const trimmedUsername = form.username.trim();
        if (trimmedUsername && !/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
          setFieldError(
            "Username must be 3–30 characters and use only letters, numbers, and underscores.",
          );
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveProfileStep({
          name: form.name.trim(),
          phone: form.phone.trim(),
          calendarInviteEmail: form.calendarInviteEmail.trim() || undefined,
          showOnPublicCrewPage: form.showOnPublicCrewPage,
          publicCrewDescription: form.publicCrewDescription.trim() || undefined,
          username: trimmedUsername,
          pronouns: form.pronouns.trim() || undefined,
          gradYear: trimmedGradYear ? Number(trimmedGradYear) : undefined,
          stanfordPosition: form.stanfordPosition || undefined,
        });
        return true;
      }

      if (currentStep === "whatsapp") {
        if (!form.whatsappAcknowledged) {
          setFieldError("Confirm you've joined the WhatsApp group to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({ whatsappAcknowledged: true });
        return true;
      }

      if (currentStep === "instagram") {
        if (!form.instagramAcknowledged) {
          setFieldError("Confirm you've followed both accounts to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({ instagramAcknowledged: true });
        return true;
      }

      if (currentStep === "fws") {
        if (form.hasFederalWorkStudy === null) {
          setFieldError("Select whether you have Federal Work Study.");
          return false;
        }
        if (!form.fwsAcknowledged) {
          setFieldError("Check the acknowledgement box to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({
          hasFederalWorkStudy: form.hasFederalWorkStudy,
          fwsAcknowledged: true,
        });
        return true;
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
          return false;
        }
        if (previewOnly) return true;
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
        return true;
      }

      if (currentStep === "gettingPaid") {
        const studentId = form.studentId.trim();
        if (!/^\d{8}$/.test(studentId)) {
          setFieldError("Enter your 8-digit student ID.");
          return false;
        }
        if (!form.employmentStartDate) {
          setFieldError("Pick your start date.");
          return false;
        }
        const startDateMs = pacificDateAndTimeToMs(form.employmentStartDate, "12:00");
        if (startDateMs == null) {
          setFieldError("Pick a valid start date.");
          return false;
        }
        if (form.hasOtherCampusEmployment === null) {
          setFieldError("Select whether you have other campus employment.");
          return false;
        }
        const otherHours = Number(form.otherCampusEmploymentHours);
        if (form.hasOtherCampusEmployment && !(otherHours > 0)) {
          setFieldError("Enter your weekly hours for your other campus employment.");
          return false;
        }
        if (!form.i9Acknowledged) {
          setFieldError("Confirm you'll complete your I-9 with HR to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({
          studentId,
          employmentStartDate: startDateMs,
          hasOtherCampusEmployment: form.hasOtherCampusEmployment,
          otherCampusEmploymentHours: form.hasOtherCampusEmployment ? otherHours : undefined,
          i9Acknowledged: true,
        });
        return true;
      }

      if (currentStep === "hours") {
        if (!form.timecardAcknowledged) {
          setFieldError("Confirm you understand the timecard process to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({ timecardAcknowledged: true });
        return true;
      }

      if (currentStep === "contractorPay") {
        if (!form.contractorPayAcknowledged) {
          setFieldError("Confirm you understand the W9 and invoice process to continue.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveOnboardingStep({ contractorPayAcknowledged: true });
        return true;
      }

      if (currentStep === "signature") {
        if (form.signatureLegalName.trim().length < 2) {
          setFieldError("Type your full legal name to sign.");
          return false;
        }
        if (!form.agreedToDoc) {
          setFieldError("Check the box to agree before signing.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await completeOnboarding({
          signatureLegalName: form.signatureLegalName.trim(),
          signatureUserAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        });
        return true;
      }

      return true;
    } catch (submitError) {
      setError(getConvexErrorMessage(submitError));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    completeOnboarding,
    currentStep,
    form,
    previewOnly,
    saveOnboardingStep,
    saveProfileStep,
  ]);

  const handleItemChange = useCallback(
    async (next: string) => {
      const enabled = QUESTION_STEPS.filter((name) => stepOrder.includes(name));
      const currentIndex = enabled.indexOf(item);
      const requestedIndex = enabled.indexOf(next as StepId);
      const goingBack = requestedIndex !== -1 && requestedIndex < currentIndex;
      if (goingBack) {
        setFieldError(null);
        setItem(next as StepId);
        return;
      }
      if (await tryAdvance()) setItem(next as StepId);
    },
    [item, stepOrder, tryAdvance],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (await tryAdvance()) setDone(true);
    },
    [tryAdvance],
  );

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
      const preparedFile = await normalizeAvatarFile(file);
      const uploadUrl = await generateAvatarUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": preparedFile.type || "application/octet-stream" },
        body: preparedFile,
      });
      if (!response.ok) throw new Error("Upload failed.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setMyAvatar({ storageId });
      setAvatarPreviewOverride(URL.createObjectURL(preparedFile));
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

  const setFormAndClearStepError: typeof setForm = (next) => {
    setFieldError(null);
    setForm(next);
  };

  return (
    <>
      {done ? null : <OnboardingSkipButton onSkip={goToDashboard} />}
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
          eyebrow={devPreview ? "Dev preview · Crew onboarding" : "Crew onboarding"}
          meta="Arbor Live"
          progress={
            <QuestionnaireWizardProgress complete={done} label="Crew onboarding progress" />
          }
          footer={
            done ? null : (
              <QuestionnaireWizardFooter
                disabled={isSubmitting}
                isSubmitting={isSubmitting}
                nextLabel={
                  currentStep === "passkey"
                    ? hasAddedPasskey
                      ? "Continue"
                      : "Add later"
                    : "Next"
                }
                submitLabel="Sign & submit"
              />
            )
          }
        >
          <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {done ? (
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  {STEP_HEADLINES.thankYou}
                </h1>
                <StepBody
                  stepId="thankYou"
                  form={form}
                  setForm={setFormAndClearStepError}
                  fieldError={null}
                  avatarBusy={avatarBusy}
                  avatarUrl={avatarUrl}
                  avatarSeedEmail={avatarSeedEmail}
                  onAvatarSelected={onAvatarSelected}
                  onGoToDashboard={goToDashboard}
                  onPasskeyAdded={() => setHasAddedPasskey(true)}
                  previewOnly={previewOnly}
                />
              </div>
            ) : (
              QUESTION_STEPS.map((stepId) => (
                <QuestionnaireItem
                  key={stepId}
                  name={stepId}
                  required
                  disabled={!stepOrder.includes(stepId)}
                >
                  <QuestionnaireTitle>
                    {STEP_HEADLINES[stepId]}
                  </QuestionnaireTitle>
                  <StepBody
                    stepId={stepId}
                    form={form}
                    setForm={setFormAndClearStepError}
                    fieldError={null}
                    avatarBusy={avatarBusy}
                    avatarUrl={avatarUrl}
                    avatarSeedEmail={avatarSeedEmail}
                    onAvatarSelected={onAvatarSelected}
                    onGoToDashboard={goToDashboard}
                    onPasskeyAdded={() => setHasAddedPasskey(true)}
                    previewOnly={previewOnly}
                  />
                  <MarkStepAnswered />
                  <QuestionnaireFieldError className="text-sm">
                    {stepId === item ? fieldError : null}
                  </QuestionnaireFieldError>
                </QuestionnaireItem>
              ))
            )}
          </div>
        </RequestWizardShell>
      </Questionnaire>
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
  onPasskeyAdded,
  previewOnly,
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
  onPasskeyAdded: () => void;
  previewOnly: boolean;
}) {
  const patch = (next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
  };

  switch (stepId) {
    case "welcome":
      return <WelcomeStep />;

    case "profile":
      return (
        <ProfileStep
          form={form}
          patch={patch}
          fieldError={fieldError}
          avatarBusy={avatarBusy}
          avatarUrl={avatarUrl}
          avatarSeedEmail={avatarSeedEmail}
          onAvatarSelected={onAvatarSelected}
          previewOnly={previewOnly}
        />
      );

    case "passkey":
      return <PasskeyStep onPasskeyAdded={onPasskeyAdded} />;

    case "whatsapp":
      return <WhatsappStep form={form} patch={patch} fieldError={fieldError} />;

    case "instagram":
      return <InstagramStep form={form} patch={patch} fieldError={fieldError} />;

    case "fws":
      return <FwsStep form={form} patch={patch} fieldError={fieldError} />;

    case "training":
      return <TrainingStep form={form} patch={patch} fieldError={fieldError} />;

    case "gettingPaid":
      return <GettingPaidStep form={form} patch={patch} fieldError={fieldError} />;

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

    case "contractorPay":
      return (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            You&apos;re set up on external payroll. Email a completed W9 to{" "}
            <a
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={`mailto:${CONTRACTOR_PAY_INFO.w9Email}`}
            >
              {CONTRACTOR_PAY_INFO.w9Email}
            </a>
            , then submit an invoice for your worked hours {CONTRACTOR_PAY_INFO.invoiceCadence} to
            the same address.
          </p>
          <ol className="list-decimal space-y-2 pl-4 text-sm text-foreground/70">
            <li>
              Complete a W9 and email it to{" "}
              <span className="font-medium text-foreground">{CONTRACTOR_PAY_INFO.w9Email}</span>.
            </li>
            <li>
              Every two weeks, email an invoice for hours worked (include dates, hours, and rate)
              to the same address.
            </li>
          </ol>
          <OnboardingAckCheckbox
            checked={form.contractorPayAcknowledged}
            onChange={(next) => patch({ contractorPayAcknowledged: next })}
            label="I understand I need to submit a W9 and invoice Arbor Live every two weeks."
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
