"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConvex } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormProvider, useForm } from "react-hook-form";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitBookingRequest } from "@/app/public/request/actions";
import { BookingRequestNav } from "@/components/request/booking-request-nav";
import { EventScheduleField } from "@/components/request/fields/event-schedule-field";
import { ReturningUserField } from "@/components/request/fields/returning-user-field";
import { ServicesField } from "@/components/request/fields/services-field";
import { SingleChoiceField } from "@/components/request/fields/single-choice-field";
import { TextField } from "@/components/request/fields/text-field";
import { TextareaField } from "@/components/request/fields/textarea-field";
import { TurnoutField } from "@/components/request/fields/turnout-field";
import {
  EVENT_CATEGORY_OPTIONS,
  LIGHTING_TIER_OPTIONS,
  PRODUCTION_TIER_OPTIONS,
  SPONSOR_TYPE_OPTIONS,
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
      phone?: string;
      contactId: string;
      groups: ReturningGroup[];
    }
  | { found: false };

function StepSubheader({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
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
    resolver: zodResolver(bookingRequestSchema),
    defaultValues: bookingRequestDefaultValues,
    mode: "onTouched",
  });

  const requestContext = form.watch("requestContext");
  const servicesNeeded = form.watch("servicesNeeded");
  const skipSponsor = requestContext === "group";
  const showReturningUser = contactLookup?.found === true;
  const includeLighting = servicesNeeded.includes("Lighting");

  const activeSteps = useMemo(
    () =>
      getActiveSteps({
        showReturningUser,
        skipSponsor,
        includeLighting,
      }),
    [showReturningUser, skipSponsor, includeLighting],
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
      if (contactLookup?.found) {
        form.setValue("invoiceContactId", contactLookup.contactId, { shouldDirty: true });
      }
    },
    [contactLookup, form],
  );

  const applyPersonal = useCallback(() => {
    form.setValue("requestContext", "personal", { shouldDirty: true, shouldValidate: true });
    form.setValue("invoiceGroupId", "", { shouldDirty: true });
    form.setValue("organization", "", { shouldDirty: true });
    form.setValue("sponsorType", "Individual Stanford Affiliate", { shouldDirty: true });
  }, [form]);

  const applyNewGroup = useCallback(() => {
    form.setValue("requestContext", "new_group", { shouldDirty: true, shouldValidate: true });
    form.setValue("invoiceGroupId", "", { shouldDirty: true });
    form.setValue("organization", "", { shouldDirty: true });
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
      const lookup = await convex.query(api.eventRequests.lookupContactByEmail, { email });
      setContactLookup(lookup);
      if (lookup.found) {
        form.setValue("firstName", lookup.firstName, { shouldDirty: true });
        form.setValue("lastName", lookup.lastName, { shouldDirty: true });
        if (lookup.phone) form.setValue("phone", lookup.phone, { shouldDirty: true });
        form.setValue("invoiceContactId", lookup.contactId, { shouldDirty: true });
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
  }, [activeSteps, advance, convex, form, stepIndex]);

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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Arbor Live" width={140} height={32} className="h-8 w-auto" />
          </Link>
          <span className="text-xs text-muted-foreground">Booking request</span>
        </div>
        <div className="mx-auto mt-4 h-1 max-w-2xl overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={spring}
          />
        </div>
      </header>

      <FormProvider {...form}>
        <form
          className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8"
          onSubmit={(event) => {
            event.preventDefault();
            void goNext();
          }}
        >
          <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("website")} />

          <div className="flex flex-1 flex-col justify-center">
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
                className="space-y-6"
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

          {currentStep.id !== "thankYou" ? (
            <BookingRequestNav
              showBack={stepIndex > 0}
              showNext
              nextLabel={currentStep.id === "additionalNotes" ? "Submit" : "Next"}
              isSubmitting={isSubmitting}
              onBack={goBack}
              onNext={() => void goNext()}
            />
          ) : null}

          {currentStep.skippable ? (
            <div className="pt-2 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={skipStep}
              >
                Skip
              </button>
            </div>
          ) : null}
        </form>
      </FormProvider>
    </div>
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
      return (
        <SingleChoiceField
          name="sponsorType"
          options={SPONSOR_TYPE_OPTIONS}
          otherFieldName="sponsorTypeOther"
          otherTriggerValue="Other"
          otherPlaceholder="Who is sponsoring this event?"
        />
      );
    case "venue":
      return (
        <div className="space-y-4">
          <TextField name="venueName" label="Venue Name" placeholder="Venue Name" autoFocus />
          <TextField name="venueAddress" label="Venue Address" placeholder="Venue Address" />
        </div>
      );
    case "eventSchedule":
      return <EventScheduleField />;
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
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>We will get back to you soon!</p>
          {trackingInfo ? (
            <div className="rounded-md border bg-muted/20 p-4 text-foreground">
              <p className="font-medium">Request {trackingInfo.requestNumber}</p>
              <p className="mt-1">Save this link to track your request status:</p>
              <Button asChild className="mt-3" variant="outline">
                <Link href={`/public/request/track/${trackingInfo.publicToken}`}>Open request tracker</Link>
              </Button>
            </div>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}
