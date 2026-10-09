"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api, type Id } from "@/lib/convex-api";
import { normalizeAvatarFile } from "@/lib/image-processing";
import { pacificDateAndTimeToMs, pacificDateKey } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";
import { EMPTY_FORM, QUESTION_STEPS, stepOrderForPayroll } from "./constants";
import type { FormState, StepId } from "./types";

export function useCrewOnboardingForm() {
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

  return {
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
  };
}
