"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { OnboardingSkipButton } from "@/components/onboarding/onboarding-ui";
import { QUESTION_STEPS, STEP_HEADLINES } from "./crew/constants";
import type { FormState, StepId } from "./crew/types";
import { useCrewOnboardingForm } from "./crew/use-crew-onboarding-form";
import { WelcomeStep } from "./crew/steps/welcome-step";
import { ProfileStep } from "./crew/steps/profile-step";
import { PasskeyStep } from "./crew/steps/passkey-step";
import { WhatsappStep } from "./crew/steps/whatsapp-step";
import { InstagramStep } from "./crew/steps/instagram-step";
import { FwsStep } from "./crew/steps/fws-step";
import { TrainingStep } from "./crew/steps/training-step";
import { GettingPaidStep } from "./crew/steps/getting-paid-step";
import { HoursStep } from "./crew/steps/hours-step";
import { ContractorPayStep } from "./crew/steps/contractor-pay-step";
import { SignatureStep } from "./crew/steps/signature-step";
import { ThankYouStep } from "./crew/steps/thank-you-step";

export function CrewOnboardingWizard() {
  const {
    onboarding,
    devPreview,
    item,
    done,
    form,
    setForm,
    fieldError,
    setFieldError,
    error,
    isSubmitting,
    avatarBusy,
    hasAddedPasskey,
    setHasAddedPasskey,
    avatarUrl,
    avatarSeedEmail,
    currentStep,
    stepOrder,
    items,
    goToDashboard,
    previewOnly,
    handleItemChange,
    handleSubmit,
    onAvatarSelected,
  } = useCrewOnboardingForm();

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
      return <HoursStep form={form} patch={patch} fieldError={fieldError} />;

    case "contractorPay":
      return <ContractorPayStep form={form} patch={patch} fieldError={fieldError} />;

    case "signature":
      return <SignatureStep form={form} patch={patch} fieldError={fieldError} />;

    case "thankYou":
      return <ThankYouStep onGoToDashboard={onGoToDashboard} />;

    default:
      return null;
  }
}
