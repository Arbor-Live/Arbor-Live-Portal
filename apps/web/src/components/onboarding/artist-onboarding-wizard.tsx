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
import { STEP_HEADLINES, isValidEmail, normalizeEmail } from "./artist/constants";
import type { FormState } from "./artist/types";
import { useArtistOnboardingForm } from "./artist/use-artist-onboarding-form";
import { WelcomeStep } from "./artist/steps/welcome-step";
import { IdentityStep } from "./artist/steps/identity-step";
import { PasskeyStep } from "./artist/steps/passkey-step";
import { HeroStep } from "./artist/steps/hero-step";
import { SocialsStep } from "./artist/steps/socials-step";
import { MembersStep } from "./artist/steps/members-step";
import { RatesStep } from "./artist/steps/rates-step";
import { PaymentStep } from "./artist/steps/payment-step";
import { ThankYouStep } from "./artist/steps/thank-you-step";

export function BandOnboardingWizard() {
  const {
    onboarding,
    profile,
    members,
    devPreview,
    form,
    setForm,
    fieldError,
    setFieldError,
    error,
    isSubmitting,
    inviteConfirmation,
    hasAddedPasskey,
    setHasAddedPasskey,
    currentStep,
    finished,
    items,
    goToDashboard,
    handleItemChange,
    handleSubmit,
    payeeOptions,
    payeeSelectValue,
    displayedInviteEmails,
    sentInviteEmails,
  } = useArtistOnboardingForm();

  if (onboarding === undefined || profile === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your artist onboarding…</p>
      </div>
    );
  }

  if (!onboarding && !devPreview) {
    return null;
  }

  const patch = (next: Partial<FormState>) => {
    setFieldError(null);
    setForm((prev) => ({ ...prev, ...next }));
  };

  const addInviteEmail = () => {
    const email = normalizeEmail(form.inviteDraft);
    if (!email) {
      setFieldError("Enter an email address to add.");
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (form.inviteEmails.some((row) => row.email === email)) {
      setFieldError("That email is already on the invite list.");
      return;
    }
    setFieldError(null);
    patch({
      inviteEmails: [
        ...form.inviteEmails,
        { email, bandRole: form.inviteRoleDraft.trim() },
      ],
      inviteDraft: "",
      inviteRoleDraft: "",
    });
  };

  return (
    <>
      {finished ? null : <OnboardingSkipButton onSkip={goToDashboard} />}
      <Questionnaire
        className="flex min-h-0 w-full flex-1 flex-col gap-0"
        items={items}
        item={currentStep}
        shortcuts="letters"
        onItemChange={(next) => void handleItemChange(next)}
        onSubmit={(event) => void handleSubmit(event)}
        onKeyDown={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            (target.id === "band-invite-email" || target.id === "band-invite-role")
          ) {
            return;
          }
          handleQuestionnaireEnter(event);
        }}
      >
        <RequestWizardShell
          eyebrow={devPreview ? "Dev preview · Artist onboarding" : "Artist onboarding"}
          meta="Arbor Live"
          progress={
            <QuestionnaireWizardProgress complete={finished} label="Artist onboarding progress" />
          }
          footer={
            finished ? null : (
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
                submitLabel="Finish setup"
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

            {finished ? (
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  {STEP_HEADLINES.thankYou}
                </h1>
                <ThankYouStep onGoToDashboard={goToDashboard} />
              </div>
            ) : (
              <>
              <QuestionnaireItem
                name="welcome"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.welcome}
                </QuestionnaireTitle>
                <WelcomeStep />
                <MarkStepAnswered />
              </QuestionnaireItem>

              <QuestionnaireItem
                name="identity"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.identity}
                </QuestionnaireTitle>
                <IdentityStep form={form} patch={patch} />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "identity" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>

              <QuestionnaireItem
                name="passkey"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.passkey}
                </QuestionnaireTitle>
                <PasskeyStep onPasskeyAdded={() => setHasAddedPasskey(true)} />
                <MarkStepAnswered />
              </QuestionnaireItem>

              <QuestionnaireItem
                name="hero"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.hero}
                </QuestionnaireTitle>
                <HeroStep form={form} patch={patch} profile={profile} />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "hero" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>

              <QuestionnaireItem
                name="socials"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.socials}
                </QuestionnaireTitle>
                <SocialsStep form={form} patch={patch} />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "socials" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>

              <QuestionnaireItem
                name="members"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.members}
                </QuestionnaireTitle>
                <MembersStep
                  form={form}
                  patch={patch}
                  addInviteEmail={addInviteEmail}
                  displayedInviteEmails={displayedInviteEmails}
                  sentInviteEmails={sentInviteEmails}
                  inviteConfirmation={inviteConfirmation}
                />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "members" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>

              <QuestionnaireItem
                name="rates"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.rates}
                </QuestionnaireTitle>
                <RatesStep
                  form={form}
                  patch={patch}
                  members={members}
                  payeeOptions={payeeOptions}
                  payeeSelectValue={payeeSelectValue}
                />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "rates" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>

              <QuestionnaireItem
                name="payment"
                required
              >
                <QuestionnaireTitle>
                  {STEP_HEADLINES.payment}
                </QuestionnaireTitle>
                <PaymentStep form={form} patch={patch} />
                <MarkStepAnswered />
                <QuestionnaireFieldError className="text-sm">
                  {currentStep === "payment" ? fieldError : null}
                </QuestionnaireFieldError>
              </QuestionnaireItem>
              </>
            )}
          </div>
        </RequestWizardShell>
      </Questionnaire>
    </>
  );
}
