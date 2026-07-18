"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestWizardNav } from "@/components/request/request-wizard-nav";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { UserSelect } from "@/components/users/user-select";
import {
  OnboardingAckCheckbox,
  OnboardingSkipButton,
  OnboardingTextarea,
} from "@/components/onboarding/onboarding-ui";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useDevPreviewReady } from "@/hooks/use-dev-preview";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

type StepId =
  | "welcome"
  | "identity"
  | "hero"
  | "socials"
  | "members"
  | "rates"
  | "payment"
  | "thankYou";

const STEP_ORDER: StepId[] = [
  "welcome",
  "identity",
  "hero",
  "socials",
  "members",
  "rates",
  "payment",
  "thankYou",
];

const PROGRESS_STEPS: StepId[] = STEP_ORDER.filter(
  (id) => id !== "welcome" && id !== "thankYou",
);

const STEP_HEADLINES: Record<StepId, string> = {
  welcome: "Welcome to Arbor Live",
  identity: "Tell us about your band",
  hero: "Add a hero photo",
  socials: "Where can people find you?",
  members: "Who's in the band?",
  rates: "Rates & payout details",
  payment: "How payouts work",
  thankYou: "You're all set!",
};

type FormState = {
  displayName: string;
  bio: string;
  publicHeroImageUrl: string;
  publicWebsiteUrl: string;
  publicInstagramUrl: string;
  publicYoutubeUrl: string;
  demoURL: string;
  publicListing: boolean;
  publicSlug: string;
  performerHourlyRateUsd: number;
  designatedPayeeUserId: string;
  designatedPayeeName: string;
  designatedPayeeEmail: string;
  designatedPayeeMailingAddress: string;
  inviteDraft: string;
  inviteEmails: string[];
  isSolo: boolean;
  paymentExplainedAck: boolean;
};

const EMPTY_FORM: FormState = {
  displayName: "",
  bio: "",
  publicHeroImageUrl: "",
  publicWebsiteUrl: "",
  publicInstagramUrl: "",
  publicYoutubeUrl: "",
  demoURL: "",
  publicListing: false,
  publicSlug: "",
  performerHourlyRateUsd: 0,
  designatedPayeeUserId: "",
  designatedPayeeName: "",
  designatedPayeeEmail: "",
  designatedPayeeMailingAddress: "",
  inviteDraft: "",
  inviteEmails: [],
  isSolo: false,
  paymentExplainedAck: false,
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const PENDING_PAYEE_PREFIX = "pending:";


function firstIncompleteStepIndex(onboarding: {
  identityCompletedAt?: number;
  heroCompletedAt?: number;
  socialsCompletedAt?: number;
  membersCompletedAt?: number;
  soloAcknowledgedAt?: number;
  ratesPayeeCompletedAt?: number;
  paymentExplainedAt?: number;
}): number {
  const done = {
    identity: Boolean(onboarding.identityCompletedAt),
    hero: Boolean(onboarding.heroCompletedAt),
    socials: Boolean(onboarding.socialsCompletedAt),
    members: Boolean(onboarding.membersCompletedAt || onboarding.soloAcknowledgedAt),
    rates: Boolean(onboarding.ratesPayeeCompletedAt),
    payment: Boolean(onboarding.paymentExplainedAt),
  };
  const hasProgress = Object.values(done).some(Boolean);
  for (let i = 0; i < STEP_ORDER.length; i += 1) {
    const id = STEP_ORDER[i]!;
    if (id === "welcome") {
      if (hasProgress) continue;
      return i;
    }
    if (id === "thankYou") return i;
    if (id === "identity" && done.identity) continue;
    if (id === "hero" && done.hero) continue;
    if (id === "socials" && done.socials) continue;
    if (id === "members" && done.members) continue;
    if (id === "rates" && done.rates) continue;
    if (id === "payment" && done.payment) continue;
    return i;
  }
  return 0;
}


export function BandOnboardingWizard() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { ready: previewReady, devPreview } = useDevPreviewReady();
  const onboarding = useQuery(api.onboarding.getMyBandOnboarding, {});
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const pendingInvites = useQuery(api.users.listPendingInvitesForActiveOrganization, {});
  const updateActiveBandProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);
  const saveBandOnboardingStep = useMutation(api.onboarding.saveBandOnboardingStep);
  const completeBandOnboarding = useMutation(api.onboarding.completeBandOnboarding);

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteConfirmation, setInviteConfirmation] = useState<string | null>(null);
  /** Emails invited this session (beyond server pending invites). */
  const [sessionSentEmails, setSessionSentEmails] = useState<string[]>([]);
  const hydratedRef = useRef(false);
  const stepHydratedRef = useRef(false);

  useEffect(() => {
    if (!profile || hydratedRef.current) return;
    hydratedRef.current = true;
    setForm((prev) => ({
      ...prev,
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
      publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
      demoURL: profile.demoURL ?? "",
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
      designatedPayeeName: profile.designatedPayeeName ?? "",
      designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
      designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
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
    () => Array.from(new Set([...form.inviteEmails, ...pendingEmails])),
    [form.inviteEmails, pendingEmails],
  );

  useEffect(() => {
    if (!onboarding || stepHydratedRef.current) return;
    stepHydratedRef.current = true;
    setStepIndex(firstIncompleteStepIndex(onboarding));
  }, [onboarding]);

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

  // Walk the UI without writing when previewing without a band onboarding row.
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

      if (currentStep === "identity") {
        if (!form.displayName.trim()) {
          setFieldError("Enter your band's display name.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await updateActiveBandProfile({
          displayName: form.displayName.trim(),
          bio: form.bio.trim() || undefined,
        });
        await saveBandOnboardingStep({ identityCompleted: true });
        advance();
        return;
      }

      if (currentStep === "hero") {
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        if (form.publicHeroImageUrl) {
          await updateActiveBandProfile({ publicHeroImageUrl: form.publicHeroImageUrl });
        }
        await saveBandOnboardingStep({ heroCompleted: true });
        advance();
        return;
      }

      if (currentStep === "socials") {
        if (form.publicListing && !form.publicSlug.trim()) {
          setFieldError("Add a public URL slug to enable the public listing.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await updateActiveBandProfile({
          publicWebsiteUrl: form.publicWebsiteUrl.trim() || undefined,
          publicInstagramUrl: form.publicInstagramUrl.trim() || undefined,
          publicYoutubeUrl: form.publicYoutubeUrl.trim() || undefined,
          demoURL: form.demoURL.trim() || undefined,
          publicListing: form.publicListing,
          publicSlug: form.publicSlug.trim() || undefined,
        });
        await saveBandOnboardingStep({ socialsCompleted: true });
        advance();
        return;
      }

      if (currentStep === "members") {
        const queued = Array.from(
          new Set([
            ...form.inviteEmails.map(normalizeEmail).filter(Boolean),
            ...pendingEmails,
          ]),
        );
        const sentSet = new Set(sentInviteEmails);
        const hasPendingOrSent = queued.length > 0 || sentSet.size > 0;
        if (!form.isSolo && !hasPendingOrSent) {
          setFieldError("Add at least one bandmate email, or confirm you're performing solo.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        if (form.isSolo) {
          await saveBandOnboardingStep({ soloAcknowledged: true });
          setInviteConfirmation(null);
        } else {
          const toSend = queued.filter((email) => !sentSet.has(email));
          for (const email of toSend) {
            await inviteMember({ email, role: "org_member" });
          }
          if (toSend.length > 0) {
            setSessionSentEmails((prev) => Array.from(new Set([...prev, ...toSend])));
          }
          await saveBandOnboardingStep({ membersCompleted: true });
          if (toSend.length > 0) {
            setInviteConfirmation(
              toSend.length === 1
                ? `Invitation sent to ${toSend[0]}.`
                : `Invitations sent to ${toSend.length} bandmates.`,
            );
          } else if (queued.length > 0) {
            setInviteConfirmation("Invitations already sent — no new emails were notified.");
          }
        }
        advance();
        return;
      }

      if (currentStep === "rates") {
        if (form.performerHourlyRateUsd < 0) {
          setFieldError("Hourly rate must be 0 or greater.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await updateActiveBandProfile({
          performerHourlyRateUsd: form.performerHourlyRateUsd,
          designatedPayeeUserId: form.designatedPayeeUserId.trim() || undefined,
          designatedPayeeName: form.designatedPayeeName.trim() || undefined,
          designatedPayeeEmail: form.designatedPayeeEmail.trim() || undefined,
          designatedPayeeMailingAddress: form.designatedPayeeMailingAddress.trim() || undefined,
        });
        await saveBandOnboardingStep({ ratesPayeeCompleted: true });
        advance();
        return;
      }

      if (currentStep === "payment") {
        if (!form.paymentExplainedAck) {
          setFieldError("Check the box to confirm you understand how payouts work.");
          return;
        }
        if (previewOnly) {
          advance();
          return;
        }
        setIsSubmitting(true);
        await saveBandOnboardingStep({ paymentExplained: true });
        await completeBandOnboarding({});
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") return;
      if (target?.id === "band-invite-email") return;
      if (currentStep === "thankYou") return;
      event.preventDefault();
      void goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStep, goNext]);

  const payeeOptions = useMemo(() => {
    const memberOptions = (members ?? []).map((user) => ({
      value: user.userId,
      label: user.name,
      email: user.email,
      description: user.email,
    }));
    const memberEmails = new Set(
      memberOptions.map((option) => normalizeEmail(option.email ?? "")).filter(Boolean),
    );

    const pendingEmails = new Set<string>();
    for (const invite of pendingInvites ?? []) {
      const email = normalizeEmail(invite.email);
      if (email) pendingEmails.add(email);
    }
    for (const email of form.inviteEmails) {
      const normalized = normalizeEmail(email);
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
        <p className="text-sm text-muted-foreground">Loading your band onboarding…</p>
      </div>
    );
  }

  if (!onboarding && !devPreview) {
    return null;
  }

  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }));

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
    if (form.inviteEmails.includes(email)) {
      setFieldError("That email is already on the invite list.");
      return;
    }
    setFieldError(null);
    patch({
      inviteEmails: [...form.inviteEmails, email],
      inviteDraft: "",
    });
  };

  return (
    <>
      {currentStep !== "thankYou" ? <OnboardingSkipButton onSkip={goToDashboard} /> : null}
      <RequestWizardShell
        eyebrow={devPreview ? "Dev preview · Band onboarding" : "Band onboarding"}
        meta="Arbor Live"
        progressPercent={progressPercent}
        footer={
          currentStep !== "thankYou" ? (
            <RequestWizardNav
              showBack={stepIndex > 0}
              showNext
              nextLabel={currentStep === "payment" ? "Finish setup" : "Next"}
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

              {currentStep === "welcome" ? (
                <div className="space-y-3 text-sm text-foreground/70">
                  <p>
                    Welcome! Before you get booked, let&apos;s set up your band&apos;s profile:
                    who you are, where to find you, your bandmates, rates, and who gets paid.
                  </p>
                  <p>
                    Arbor Live pays bands directly through a designated payee — no promoter or
                    middleman needed.
                  </p>
                </div>
              ) : null}

              {currentStep === "identity" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="band-display-name">Band name</Label>
                    <Input
                      id="band-display-name"
                      value={form.displayName}
                      onChange={(event) => patch({ displayName: event.target.value })}
                      placeholder="Your band's name"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="band-bio">Bio</Label>
                    <OnboardingTextarea
                      id="band-bio"
                      value={form.bio}
                      onChange={(event) => patch({ bio: event.target.value })}
                      placeholder="A short description of your sound and style…"
                    />
                  </div>
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "hero" ? (
                <div className="space-y-4">
                  <p className="text-sm text-foreground/70">
                    Add a hero photo for your public artist page. You can skip this and add one
                    later.
                  </p>
                  {profile ? (
                    <BandHeroUploadField
                      organizationId={profile.organizationId}
                      currentUrl={form.publicHeroImageUrl}
                      urlValue={form.publicHeroImageUrl}
                      onUploaded={(url) => patch({ publicHeroImageUrl: url })}
                      onUrlChange={(url) => patch({ publicHeroImageUrl: url })}
                      onClear={() => patch({ publicHeroImageUrl: "" })}
                    />
                  ) : (
                    <p className="rounded-md border border-dashed border-border/80 px-3 py-6 text-center text-sm text-muted-foreground">
                      Hero upload needs an active band org — paste a URL below for UI preview.
                    </p>
                  )}
                  {!profile ? (
                    <div className="space-y-2">
                      <Label htmlFor="band-hero-url">Hero image URL</Label>
                      <Input
                        id="band-hero-url"
                        value={form.publicHeroImageUrl}
                        onChange={(event) => patch({ publicHeroImageUrl: event.target.value })}
                        placeholder="https://…"
                      />
                    </div>
                  ) : null}
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "socials" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="band-website">Website</Label>
                    <Input
                      id="band-website"
                      value={form.publicWebsiteUrl}
                      onChange={(event) => patch({ publicWebsiteUrl: event.target.value })}
                      placeholder="https://…"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="band-instagram">Instagram URL</Label>
                    <Input
                      id="band-instagram"
                      value={form.publicInstagramUrl}
                      onChange={(event) => patch({ publicInstagramUrl: event.target.value })}
                      placeholder="https://instagram.com/…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="band-youtube">YouTube URL</Label>
                    <Input
                      id="band-youtube"
                      value={form.publicYoutubeUrl}
                      onChange={(event) => patch({ publicYoutubeUrl: event.target.value })}
                      placeholder="https://youtube.com/…"
                    />
                  </div>
                  
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="band-demo">Demo / listening link</Label>
                    <Input
                      id="band-demo"
                      value={form.demoURL}
                      onChange={(event) => patch({ demoURL: event.target.value })}
                      placeholder="Spotify, SoundCloud, Drive…"
                    />
                  </div>
<OnboardingAckCheckbox
                    checked={form.publicListing}
                    onChange={(next) => patch({ publicListing: next })}
                    label="List us on the public artists page."
                  />
                  {form.publicListing ? (
                    <div className="space-y-2">
                      <Label htmlFor="band-slug">Public URL slug</Label>
                      <Input
                        id="band-slug"
                        value={form.publicSlug}
                        onChange={(event) => patch({ publicSlug: event.target.value })}
                        placeholder="my-band-name"
                      />
                    </div>
                  ) : null}
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "members" ? (
                <div className="space-y-4">
                  <p className="text-sm text-foreground/70">
                    Invite bandmates now so you can designate one of them as the payee on the next
                    step. You can invite multiple people.
                  </p>
                  <OnboardingAckCheckbox
                    checked={form.isSolo}
                    onChange={(next) =>
                      patch({
                        isSolo: next,
                        inviteDraft: next ? "" : form.inviteDraft,
                        inviteEmails: next ? [] : form.inviteEmails,
                      })
                    }
                    label="I'm performing solo — no other members to invite."
                  />
                  {!form.isSolo ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Label htmlFor="band-invite-email">Bandmate email</Label>
                          <Input
                            id="band-invite-email"
                            type="email"
                            value={form.inviteDraft}
                            onChange={(event) => patch({ inviteDraft: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              event.stopPropagation();
                              addInviteEmail();
                            }}
                            placeholder="name@example.com"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="mt-7 shrink-0 gap-1.5"
                          onClick={addInviteEmail}
                        >
                          <PlusIcon className="size-4" weight="bold" />
                          Add
                        </Button>
                      </div>

                      {displayedInviteEmails.length > 0 ? (
                        <ul className="space-y-2">
                          {displayedInviteEmails.map((email) => {
                            const alreadySent = sentInviteEmails.includes(email);
                            return (
                              <li
                                key={email}
                                className="flex items-center justify-between gap-2 border border-border/50 bg-background/50 px-3 py-2 text-sm"
                              >
                                <span className="min-w-0 truncate">
                                  {email}
                                  {alreadySent ? (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      invited
                                    </span>
                                  ) : null}
                                </span>
                                {!alreadySent ? (
                                  <button
                                    type="button"
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                      patch({
                                        inviteEmails: form.inviteEmails.filter((row) => row !== email),
                                      })
                                    }
                                    aria-label={`Remove ${email}`}
                                  >
                                    <XIcon className="size-4" weight="bold" />
                                  </button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Add each bandmate&apos;s email, then continue. Invites send when you click
                          Next.
                        </p>
                      )}
                    </div>
                  ) : null}
                  {inviteConfirmation ? (
                    <Alert>
                      <AlertDescription>{inviteConfirmation}</AlertDescription>
                    </Alert>
                  ) : null}
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "rates" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="band-rate">Performer hourly rate (USD)</Label>
                    <Input
                      id="band-rate"
                      type="number"
                      min={0}
                      value={form.performerHourlyRateUsd}
                      onChange={(event) =>
                        patch({ performerHourlyRateUsd: Number(event.target.value) || 0 })
                      }
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2 border-t border-border/50 pt-4">
                    <p className="text-sm font-medium text-foreground">Designated payee</p>
                    <p className="text-xs text-muted-foreground">
                      One person who receives and distributes payment on behalf of the band. You can
                      pick a current member or a pending invite — fill in their name and mailing
                      address below if needed.
                    </p>
                    <UserSelect
                      value={payeeSelectValue}
                      onChange={(value) => {
                        if (value.startsWith(PENDING_PAYEE_PREFIX)) {
                          const email = normalizeEmail(value.slice(PENDING_PAYEE_PREFIX.length));
                          const localPart = email.split("@")[0] ?? email;
                          patch({
                            designatedPayeeUserId: "",
                            designatedPayeeEmail: email,
                            designatedPayeeName:
                              form.designatedPayeeName.trim() || localPart || email,
                          });
                          return;
                        }
                        const user = (members ?? []).find((row) => row.userId === value);
                        patch({
                          designatedPayeeUserId: value,
                          designatedPayeeName: user?.name ?? form.designatedPayeeName,
                          designatedPayeeEmail: user?.email ?? form.designatedPayeeEmail,
                        });
                      }}
                      options={payeeOptions}
                      placeholder="Select member or pending invite…"
                      emptyLabel="Select payee"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={form.designatedPayeeName}
                        onChange={(event) => patch({ designatedPayeeName: event.target.value })}
                        placeholder="Payee name"
                      />
                      <Input
                        type="email"
                        value={form.designatedPayeeEmail}
                        onChange={(event) => patch({ designatedPayeeEmail: event.target.value })}
                        placeholder="Payee email"
                      />
                    </div>
                    <OnboardingTextarea
                      value={form.designatedPayeeMailingAddress}
                      onChange={(event) =>
                        patch({ designatedPayeeMailingAddress: event.target.value })
                      }
                      placeholder={"Mailing address\n123 Example St\nStanford, CA 94305"}
                    />
                  </div>
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "payment" ? (
                <div className="space-y-4">
                  <div className="space-y-3 text-sm text-foreground/70">
                    <p>
                      After your event, Arbor Live pays your designated payee directly by the
                      performer hourly rate on file, multiplied by the hours your band performed.
                    </p>
                    <p>
                      Your payee is responsible for distributing payment to the rest of the band.
                      You can update your payee or rate anytime from your band settings.
                    </p>
                  </div>
                  <OnboardingAckCheckbox
                    checked={form.paymentExplainedAck}
                    onChange={(next) => patch({ paymentExplainedAck: next })}
                    label="I understand how payouts work for this band."
                  />
                  {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
                </div>
              ) : null}

              {currentStep === "thankYou" ? (
                <div className="space-y-4 text-sm text-foreground/70">
                  <p>Your band profile is ready. We&apos;ll be in touch about booking!</p>
                  <Button onClick={goToDashboard}>Go to dashboard</Button>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </RequestWizardShell>
    </>
  );
}
