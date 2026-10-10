"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api } from "@/lib/convex-api";
import { toUserSelectOption } from "@/lib/user-select-description";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { DEFAULT_BAND_PAYEE_PAYOUT_METHOD } from "@/lib/band-payout-copy";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";
import { trimOptional } from "@/lib/band-profile-lists";
import { slugifyBandName } from "@/lib/validations/bands";
import {
  EMPTY_FORM,
  PENDING_PAYEE_PREFIX,
  QUESTION_STEPS,
  STEP_ORDER,
  firstIncompleteStepIndex,
  normalizeEmail,
} from "./constants";
import type { FormState, StepId } from "./types";

export function useArtistOnboardingForm() {
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

  return {
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
  };
}
