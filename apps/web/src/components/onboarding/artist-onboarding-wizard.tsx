"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toUserSelectOption } from "@/lib/user-select-description";
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
import { getConvexErrorMessage } from "@/lib/convex-error";
import { DEFAULT_BAND_PAYEE_PAYOUT_METHOD } from "@/lib/band-payout-copy";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";
import { trimOptional } from "@/lib/band-profile-lists";
import { slugifyBandName } from "@/lib/validations/bands";
import {
  EMPTY_FORM,
  PENDING_PAYEE_PREFIX,
  QUESTION_STEPS,
  STEP_HEADLINES,
  STEP_ORDER,
  firstIncompleteStepIndex,
  isValidEmail,
  normalizeEmail,
} from "./artist/constants";
import type { FormState, StepId } from "./artist/types";
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
  const router = useRouter();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const onboarding = useQuery(api.onboarding.getMyBandOnboarding, {});
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const pendingInvites = useQuery(api.users.listPendingInvitesForActiveOrganization, {});
  const updateActiveBandProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);
  const saveBandOnboardingStep = useMutation(api.onboarding.saveBandOnboardingStep);
  const completeBandOnboarding = useMutation(api.onboarding.completeBandOnboarding);

  const [item, setItem] = useState<StepId | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteConfirmation, setInviteConfirmation] = useState<string | null>(null);
  const [hasAddedPasskey, setHasAddedPasskey] = useState(false);
  /** Emails invited this session (beyond server pending invites). */
  const [sessionSentEmails, setSessionSentEmails] = useState<string[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!profile || hydratedRef.current) return;
    hydratedRef.current = true;
    setForm((prev) => ({
      ...prev,
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
      artistLinks: profile.artistLinks ?? [],
      organizationType: profile.organizationType ?? "",
      demoURL: profile.demoURL ?? "",
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
      designatedPayeeName: profile.designatedPayeeName ?? "",
      designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
      designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
      designatedPayeePayoutMethod:
        profile.designatedPayeePayoutMethod === "pickup" ||
        profile.designatedPayeePayoutMethod === "delivery"
          ? profile.designatedPayeePayoutMethod
          : DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
    }));
  }, [profile]);

  const pendingEmails = useMemo(
    () =>
      (pendingInvites ?? [])
        .map((invite) => normalizeEmail(invite.email))
        .filter(Boolean),
    [pendingInvites],
  );
  const sentInviteEmails = useMemo(
    () => Array.from(new Set([...pendingEmails, ...sessionSentEmails])),
    [pendingEmails, sessionSentEmails],
  );
  const displayedInviteEmails = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...form.inviteEmails.map((row) => ({
              email: normalizeEmail(row.email),
              bandRole: row.bandRole,
              pending: false,
            })),
            ...pendingEmails.map((email) => ({
              email,
              bandRole:
                pendingInvites?.find((invite) => normalizeEmail(invite.email) === email)?.bandRole ??
                "",
              pending: true,
            })),
          ].map((row) => [row.email, row]),
        ).values(),
      ),
    [form.inviteEmails, pendingEmails, pendingInvites],
  );

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

  const resumeStep: StepId = onboarding
    ? (STEP_ORDER[firstIncompleteStepIndex(onboarding)] ?? "welcome")
    : "welcome";
  const currentStep: StepId =
    item ?? (resumeStep === "thankYou" ? "payment" : resumeStep);
  const finished = done || (item === null && resumeStep === "thankYou");
  const items = useMemo<QuestionnaireItemDefinition[]>(
    () => QUESTION_STEPS.map((name) => ({ name, required: true })),
    [],
  );

  const goToDashboard = useCallback(() => router.push("/dashboard"), [router]);

  // Walk the UI without writing when previewing without a band onboarding row.
  const previewOnly = Boolean(devPreview && onboarding === null);

  const tryAdvance = useCallback(async (): Promise<boolean> => {
    setFieldError(null);
    setError(null);

    try {
      if (currentStep === "welcome") {
        return true;
      }

      if (currentStep === "identity") {
        if (!form.displayName.trim()) {
          setFieldError("Enter your display name.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await updateActiveBandProfile({
          displayName: form.displayName.trim(),
          bio: trimOptional(form.bio),
        });
        await saveBandOnboardingStep({ identityCompleted: true });
        return true;
      }

      if (currentStep === "hero") {
        if (previewOnly) return true;
        setIsSubmitting(true);
        await updateActiveBandProfile({
          publicHeroImageUrl: trimOptional(form.publicHeroImageUrl),
        });
        await saveBandOnboardingStep({ heroCompleted: true });
        return true;
      }

      if (currentStep === "socials") {
        let publicSlug = form.publicSlug.trim();
        if (form.publicListing && !publicSlug) {
          publicSlug = slugifyBandName(form.displayName);
          if (!publicSlug) {
            setFieldError("Add a public URL slug to list on the artists page.");
            return false;
          }
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await updateActiveBandProfile({
          artistLinks: form.artistLinks
            .map((link) => ({
              label: link.label.trim(),
              url: link.url.trim(),
              icon: link.icon,
            }))
            .filter((link) => link.label && link.url),
          demoURL: trimOptional(form.demoURL),
          organizationType: form.organizationType
            ? (form.organizationType as "band" | "dj" | "singer_songwriter" | "other")
            : undefined,
          publicListing: form.publicListing,
          publicSlug: trimOptional(publicSlug),
        });
        await saveBandOnboardingStep({ socialsCompleted: true });
        return true;
      }

      if (currentStep === "members") {
        const queued = Array.from(
          new Map(
            [
              ...form.inviteEmails.map((row) => ({
                email: normalizeEmail(row.email),
                bandRole: row.bandRole.trim(),
              })),
              ...pendingEmails.map((email) => ({ email, bandRole: "" })),
            ]
              .filter((row) => row.email)
              .map((row) => [row.email, row]),
          ).values(),
        );
        const sentSet = new Set(sentInviteEmails);
        const hasPendingOrSent = queued.length > 0 || sentSet.size > 0;
        if (!form.isSolo && !hasPendingOrSent) {
          setFieldError("Add at least one member email, or confirm you're performing solo.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        if (form.isSolo) {
          await saveBandOnboardingStep({ soloAcknowledged: true });
          setInviteConfirmation(null);
        } else {
          const toSend = queued.filter((row) => !sentSet.has(row.email));
          for (const row of toSend) {
            await inviteMember({
              email: row.email,
              role: "org_member",
              bandRole: row.bandRole || undefined,
            });
          }
          if (toSend.length > 0) {
            setSessionSentEmails((prev) => [
              ...prev,
              ...toSend.map((row) => row.email),
            ]);
            setInviteConfirmation(
              toSend.length === 1
                ? `Invitation sent to ${toSend[0]!.email}.`
                : `Invitations sent to ${toSend.length} members.`,
            );
          }
          await saveBandOnboardingStep({ membersCompleted: true });
        }
        return true;
      }

      if (currentStep === "rates") {
        if (form.performerHourlyRateUsd < 0) {
          setFieldError("Hourly rate must be 0 or greater.");
          return false;
        }
        if (!form.designatedPayeeName.trim() || !form.designatedPayeeEmail.trim()) {
          setFieldError("Choose or enter a designated payee name and email.");
          return false;
        }
        if (!form.designatedPayeeMailingAddress.trim()) {
          setFieldError("Enter a mailing address (required for Stanford / GrantEd).");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await updateActiveBandProfile({
          performerHourlyRateUsd: form.performerHourlyRateUsd,
          designatedPayeeUserId: trimOptional(form.designatedPayeeUserId),
          designatedPayeeName: trimOptional(form.designatedPayeeName),
          designatedPayeeEmail: trimOptional(form.designatedPayeeEmail),
          designatedPayeeMailingAddress: trimOptional(form.designatedPayeeMailingAddress),
          designatedPayeePayoutMethod: form.designatedPayeePayoutMethod,
        });
        await saveBandOnboardingStep({ ratesPayeeCompleted: true });
        return true;
      }

      if (currentStep === "payment") {
        if (!form.paymentExplainedAck) {
          setFieldError("Check the box to confirm you understand how payouts work.");
          return false;
        }
        if (previewOnly) return true;
        setIsSubmitting(true);
        await saveBandOnboardingStep({ paymentExplained: true });
        await completeBandOnboarding({});
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
    completeBandOnboarding,
    currentStep,
    form,
    inviteMember,
    pendingEmails,
    previewOnly,
    saveBandOnboardingStep,
    sentInviteEmails,
    updateActiveBandProfile,
  ]);

  const handleItemChange = useCallback(
    async (next: string) => {
      const currentIndex = QUESTION_STEPS.indexOf(currentStep);
      const requestedIndex = QUESTION_STEPS.indexOf(next as StepId);
      const goingBack = requestedIndex !== -1 && requestedIndex < currentIndex;
      if (goingBack) {
        setFieldError(null);
        setItem(next as StepId);
        return;
      }
      if (await tryAdvance()) setItem(next as StepId);
    },
    [currentStep, tryAdvance],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (await tryAdvance()) setDone(true);
    },
    [tryAdvance],
  );

  const payeeOptions = useMemo(() => {
    const memberOptions = (members ?? []).map((user) =>
      toUserSelectOption({
        id: user.userId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        image: user.image,
      }),
    );
    const memberEmails = new Set(
      memberOptions.map((option) => normalizeEmail(option.email ?? "")).filter(Boolean),
    );

    const pendingEmails = new Set<string>();
    for (const invite of pendingInvites ?? []) {
      const email = normalizeEmail(invite.email);
      if (email) pendingEmails.add(email);
    }
    for (const row of form.inviteEmails) {
      const normalized = normalizeEmail(row.email);
      if (normalized) pendingEmails.add(normalized);
    }
    for (const email of sentInviteEmails) {
      if (email) pendingEmails.add(email);
    }

    const pendingOptions = Array.from(pendingEmails)
      .filter((email) => !memberEmails.has(email))
      .sort((a, b) => a.localeCompare(b))
      .map((email) => ({
        value: `${PENDING_PAYEE_PREFIX}${email}`,
        label: email,
        email,
        description: "Pending invite",
      }));

    return [...memberOptions, ...pendingOptions];
  }, [form.inviteEmails, members, pendingInvites, sentInviteEmails]);

  const payeeSelectValue = form.designatedPayeeUserId
    ? form.designatedPayeeUserId
    : form.designatedPayeeEmail
      ? `${PENDING_PAYEE_PREFIX}${normalizeEmail(form.designatedPayeeEmail)}`
      : "";

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
