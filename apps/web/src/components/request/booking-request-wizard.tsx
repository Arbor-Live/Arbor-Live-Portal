"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConvex } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { submitBookingRequest } from "@/app/(site)/request/actions";
import { RequestWizardNav } from "@/components/request/request-wizard-nav";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { EventScheduleField } from "@/components/request/fields/event-schedule-field";
import { ReturningUserField } from "@/components/request/fields/returning-user-field";
import { ServicesField } from "@/components/request/fields/services-field";
import { SponsorTypeField } from "@/components/request/fields/sponsor-type-field";
import { SingleChoiceField } from "@/components/request/fields/single-choice-field";
import { TextField } from "@/components/request/fields/text-field";
import { TextareaField } from "@/components/request/fields/textarea-field";
import { TurnoutField } from "@/components/request/fields/turnout-field";
import {
  EVENT_CATEGORY_OPTIONS,
  LIGHTING_TIER_OPTIONS,
  PRODUCTION_TIER_OPTIONS,
  INDIVIDUAL_SPONSOR_TYPE,
  bookingRequestDefaultValues,
  bookingRequestSchema,
  getActiveSteps,
  type BookingRequestFormValues,
  type BookingRequestStepId,
} from "@/lib/validations/booking-request";

const spring = { type: "spring" as const, stiffness: 380, damping: 36 };

type ReturningGroup = {
  groupId: string;
  groupName: string;
  sponsorType: string;
};

type ContactLookup =
  | {
      found: true;
      firstName: string;
      lastName: string;
      phone: string;
      groups: ReturningGroup[];
    }
  | { found: false };

function contactDetailsComplete(lookup: Extract<ContactLookup, { found: true }>) {
  return Boolean(lookup.firstName.trim() && lookup.lastName.trim() && lookup.phone.trim());
}

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

export function BookingRequestWizard() {
  const prefersReducedMotion = useReducedMotion();
  const convex = useConvex();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactLookup, setContactLookup] = useState<ContactLookup | null>(null);
  const [trackingInfo, setTrackingInfo] = useState<{ publicToken: string; requestNumber: string } | null>(
    null,
  );
  const directionRef = useRef(1);

  const form = useForm<BookingRequestFormValues>({
    resolver: zodResolver(bookingRequestSchema as never) as Resolver<BookingRequestFormValues>,
    defaultValues: bookingRequestDefaultValues,
    mode: "onTouched",
  });

  const requestContext = form.watch("requestContext");
  const servicesNeeded = form.watch("servicesNeeded");
  const skipSponsor = requestContext === "group" || requestContext === "personal";
  const showReturningUser = contactLookup?.found === true;
  const skipContact =
    contactLookup?.found === true && contactDetailsComplete(contactLookup);
  const includeLighting = servicesNeeded.includes("Lighting");

  const activeSteps = useMemo(
    () =>
      getActiveSteps({
        showReturningUser,
        skipContact,
        skipSponsor,
        includeLighting,
      }),
    [showReturningUser, skipContact, skipSponsor, includeLighting],
  );

  const currentStep = activeSteps[stepIndex] ?? activeSteps[0]!;
  const progressSteps = activeSteps.filter((step) => step.id !== "welcome" && step.id !== "thankYou");
  const progressIndex = Math.max(
    0,
    progressSteps.findIndex((step) => step.id === currentStep.id),
  );
  const progressPercent =
    currentStep.id === "welcome"
      ? 0
      : currentStep.id === "thankYou"
        ? 100
        : ((progressIndex + 1) / progressSteps.length) * 100;

  const slideVariants = useMemo(
    () => ({
      enter: (dir: number) =>
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, x: dir > 0 ? 40 : -40, scale: 0.98 },
      center: prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 },
      exit: (dir: number) =>
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, x: dir > 0 ? -40 : 40, scale: 0.98 },
    }),
    [prefersReducedMotion],
  );

  const applyGroup = useCallback(
    (group: ReturningGroup) => {
      form.setValue("requestContext", "group", { shouldDirty: true, shouldValidate: true });
      form.setValue("invoiceGroupId", group.groupId, { shouldDirty: true });
      form.setValue("organization", group.groupName, { shouldDirty: true });
      form.setValue(
        "sponsorType",
        group.sponsorType as BookingRequestFormValues["sponsorType"],
        { shouldDirty: true },
      );
    },
    [form],
  );

  const applyPersonal = useCallback(() => {
    form.setValue("requestContext", "personal", { shouldDirty: true, shouldValidate: true });
    form.setValue("invoiceGroupId", "", { shouldDirty: true });
    form.setValue("organization", "", { shouldDirty: true });
    form.setValue("sponsorType", INDIVIDUAL_SPONSOR_TYPE, { shouldDirty: true });
  }, [form]);

  const applyNewGroup = useCallback(() => {
    form.setValue("requestContext", "new_group", { shouldDirty: true, shouldValidate: true });
    form.setValue("invoiceGroupId", "", { shouldDirty: true });
    form.setValue("organization", "", { shouldDirty: true });
    form.setValue("sponsorType", "Stanford Department", { shouldDirty: true });
  }, [form]);

  const advance = useCallback(() => {
    directionRef.current = 1;
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, activeSteps.length - 1));
  }, [activeSteps.length]);

  const goNext = useCallback(async () => {
    setSubmitError(null);
    const step = activeSteps[stepIndex]!;

    if (step.id === "welcome") {
      advance();
      return;
    }

    if (step.id === "email") {
      const valid = await form.trigger(["email"]);
      if (!valid) return;
      const email = form.getValues("email").trim().toLowerCase();
      let lookup: ContactLookup = { found: false };
      try {
        lookup = await convex.query(api.eventRequests.lookupContactByEmail, { email });
      } catch {
        // Public lookup should never require auth; treat failures as new contact.
        lookup = { found: false };
      }
      setContactLookup(lookup);
      if (lookup.found) {
        form.setValue("firstName", lookup.firstName, { shouldDirty: true });
        form.setValue("lastName", lookup.lastName, { shouldDirty: true });
        form.setValue("phone", lookup.phone, { shouldDirty: true });
      } else if (contactLookup?.found) {
        // Drop autofilled details when switching from a known contact to a new email.
        form.setValue("firstName", "", { shouldDirty: true });
        form.setValue("lastName", "", { shouldDirty: true });
        form.setValue("phone", "", { shouldDirty: true });
      }
      advance();
      return;
    }

    if (step.id === "returningUser") {
      const context = form.getValues("requestContext");
      if (!context) {
        form.setError("requestContext", { message: "Select who this request is for" });
        return;
      }
      if (context === "group" && !form.getValues("invoiceGroupId")) {
        form.setError("requestContext", { message: "Select one of your groups" });
        return;
      }
      advance();
      return;
    }

    if (step.fields.length > 0 && !step.skippable) {
      const valid = await form.trigger(step.fields);
      if (!valid) return;
    }

    if (step.id === "additionalNotes") {
      setIsSubmitting(true);
      const result = await submitBookingRequest(form.getValues());
      setIsSubmitting(false);
      if (!result.ok) {
        setSubmitError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof BookingRequestFormValues, { message });
          }
        }
        return;
      }
      setTrackingInfo({ publicToken: result.publicToken, requestNumber: result.requestNumber });
    }

    advance();
  }, [activeSteps, advance, contactLookup, convex, form, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex === 0 || currentStep.id === "thankYou") return;
    directionRef.current = -1;
    setDirection(-1);
    setStepIndex((index) => Math.max(index - 1, 0));
  }, [currentStep.id, stepIndex]);

  const skipStep = useCallback(() => {
    directionRef.current = 1;
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, activeSteps.length - 1));
  }, [activeSteps.length]);

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

  const headline =
    currentStep.id === "returningUser" && contactLookup?.found
      ? `Welcome back, ${contactLookup.firstName}!`
      : currentStep.headline;

  return (
    <PublicMarketingLayout hideFooter>
      <RequestWizardShell
        eyebrow="Booking request"
        progressPercent={progressPercent}
        footer={
          currentStep.id !== "thankYou" ? (
            <RequestWizardNav
              showBack={stepIndex > 0}
              showNext
              nextLabel={currentStep.id === "additionalNotes" ? "Submit" : "Next"}
              isSubmitting={isSubmitting}
              skippable={currentStep.skippable}
              onBack={goBack}
              onNext={() => void goNext()}
              onSkip={skipStep}
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
                  <div className="space-y-3">
                    <motion.h1
                      className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05, ...spring }}
                    >
                      {headline}
                    </motion.h1>
                    {currentStep.subheader ? <StepSubheader text={currentStep.subheader} /> : null}
                  </div>

                  <StepBody
                    stepId={currentStep.id}
                    contactLookup={contactLookup}
                    trackingInfo={trackingInfo}
                    onApplyGroup={applyGroup}
                    onApplyPersonal={applyPersonal}
                    onApplyNewGroup={applyNewGroup}
                  />
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
  contactLookup,
  trackingInfo,
  onApplyGroup,
  onApplyPersonal,
  onApplyNewGroup,
}: {
  stepId: BookingRequestStepId;
  contactLookup: ContactLookup | null;
  trackingInfo: { publicToken: string; requestNumber: string } | null;
  onApplyGroup: (group: ReturningGroup) => void;
  onApplyPersonal: () => void;
  onApplyNewGroup: () => void;
}) {
  switch (stepId) {
    case "email":
      return <TextField name="email" label="Stanford email" placeholder="you@stanford.edu" type="email" autoFocus />;
    case "returningUser":
      return contactLookup?.found ? (
        <ReturningUserField
          firstName={contactLookup.firstName}
          groups={contactLookup.groups}
          onApplyGroup={onApplyGroup}
          onApplyPersonal={onApplyPersonal}
          onApplyNewGroup={onApplyNewGroup}
        />
      ) : null;
    case "contact":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="firstName" label="First Name" placeholder="First Name" autoFocus />
            <TextField name="lastName" label="Last Name" placeholder="Last Name" />
          </div>
          <TextField name="phone" label="Phone" placeholder="Phone" type="tel" />
        </div>
      );
    case "sponsorType":
      return <SponsorTypeField />;
    case "venue":
      return (
        <div className="space-y-4">
          <TextField name="venueName" label="Venue Name" placeholder="Venue Name" autoFocus />
          <TextField name="venueAddress" label="Venue Address" placeholder="Venue Address" />
        </div>
      );
    case "eventSchedule":
      return <EventScheduleField />;
    case "eventName":
      return (
        <TextField
          name="eventName"
          label="What is the name for your event?"
          placeholder="Spring Concert 2026"
          autoFocus
        />
      );
    case "eventCategory":
      return (
        <SingleChoiceField
          name="eventCategory"
          options={EVENT_CATEGORY_OPTIONS}
          otherFieldName="eventCategoryOther"
          otherTriggerValue="Other"
          otherPlaceholder="What type of event are you running?"
        />
      );
    case "services":
      return <ServicesField />;
    case "productionTier":
      return <SingleChoiceField name="productionTier" options={PRODUCTION_TIER_OPTIONS} />;
    case "lighting":
      return <SingleChoiceField name="lightingPreference" options={LIGHTING_TIER_OPTIONS} />;
    case "eventDescription":
      return (
        <TextareaField
          name="eventDescription"
          label="Your answer"
          placeholder="I am running a small party with three bands..."
          autoFocus
        />
      );
    case "expectedTurnout":
      return <TurnoutField />;
    case "existingEquipment":
      return (
        <TextareaField
          name="existingEquipment"
          label="Your answer"
          placeholder="Type your answer here…"
          autoFocus
        />
      );
    case "additionalNotes":
      return (
        <TextareaField
          name="additionalNotes"
          label="Your answer"
          placeholder="Type your answer here..."
          autoFocus
        />
      );
    case "thankYou":
      return (
        <div className="space-y-4 text-sm text-foreground/70">
          <p>We will get back to you soon!</p>
          {trackingInfo ? (
            <div className="border border-border/50 bg-background/50 p-4 text-foreground">
              <p className="font-medium">Request {trackingInfo.requestNumber}</p>
              <p className="mt-1">Save this link to track your request status:</p>
              <Button asChild className="mt-3" variant="outline">
                <Link href={`/request/track/${trackingInfo.publicToken}`}>Open request tracker</Link>
              </Button>
            </div>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}
