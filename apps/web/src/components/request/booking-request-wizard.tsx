"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConvex } from "convex/react";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
  type Resolver,
} from "react-hook-form";
import type {
  QuestionnaireChoiceDefinition,
  QuestionnaireItemDefinition,
} from "@shadcn/react/questionnaire";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  QUESTIONNAIRE_CHOICE_CLASSNAME,
  QUESTIONNAIRE_ITEM_CLASSNAME,
  QUESTIONNAIRE_TITLE_CLASSNAME,
  handleQuestionnaireEnter,
  MarkStepAnswered,
  QuestionnaireWizardFooter,
  QuestionnaireWizardProgress,
} from "@/components/ui/questionnaire-wizard";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { submitBookingRequest } from "@/app/(site)/request/actions";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { EventScheduleField } from "@/components/request/fields/event-schedule-field";
import { OrganizationSearchField } from "@/components/request/fields/organization-search-field";
import { ServicesField } from "@/components/request/fields/services-field";
import { TextField } from "@/components/request/fields/text-field";
import { TextareaField } from "@/components/request/fields/textarea-field";
import { TurnoutField } from "@/components/request/fields/turnout-field";
import {
  EVENT_CATEGORY_OPTIONS,
  INDIVIDUAL_SPONSOR_TYPE,
  LIGHTING_TIER_OPTIONS,
  PRODUCTION_TIER_OPTIONS,
  bookingRequestDefaultValues,
  bookingRequestSchema,
  getActiveSteps,
  requiresOrganizationName,
  sponsorTypeOptionsForContext,
  type BookingRequestFormValues,
  type BookingRequestStepId,
} from "@/lib/validations/booking-request";

import { BOOKING_REQUEST_STEP_WATCH_FIELDS, buildStepFieldValuesFromWatch } from "@/lib/booking-request-wizard-subscriptions";

const QUESTION_STEPS = [
  "welcome",
  "email",
  "returningUser",
  "contact",
  "sponsorType",
  "venue",
  "eventSchedule",
  "eventName",
  "eventCategory",
  "services",
  "productionTier",
  "lighting",
  "eventDescription",
  "expectedTurnout",
  "existingEquipment",
  "additionalNotes",
] as const satisfies readonly BookingRequestStepId[];

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

const choiceClassName = QUESTIONNAIRE_CHOICE_CLASSNAME;

function itemChoices(
  name: BookingRequestStepId,
  contactLookup: ContactLookup | null,
  requestContext: BookingRequestFormValues["requestContext"],
): QuestionnaireChoiceDefinition[] | undefined {
  switch (name) {
    case "eventCategory":
      return EVENT_CATEGORY_OPTIONS.map((value) => ({ value }));
    case "productionTier":
      return PRODUCTION_TIER_OPTIONS.map((value) => ({ value }));
    case "lighting":
      return LIGHTING_TIER_OPTIONS.map((value) => ({ value }));
    case "sponsorType":
      return sponsorTypeOptionsForContext(requestContext).map((value) => ({ value }));
    case "returningUser":
      if (contactLookup?.found !== true) return undefined;
      return [
        ...contactLookup.groups.map((group) => ({ value: `group:${group.groupId}` })),
        { value: "personal" },
        { value: "new_group" },
      ];
    default:
      return undefined;
  }
}

export function BookingRequestWizard() {
  const convex = useConvex();
  const [item, setItem] = useState<BookingRequestStepId>("welcome");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [contactLookup, setContactLookup] = useState<ContactLookup | null>(null);
  const [trackingInfo, setTrackingInfo] = useState<{ publicToken: string; requestNumber: string } | null>(
    null,
  );

  const form = useForm<BookingRequestFormValues>({
    resolver: zodResolver(bookingRequestSchema as never) as Resolver<BookingRequestFormValues>,
    defaultValues: bookingRequestDefaultValues,
    mode: "onTouched",
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is intentionally used for step routing
  const requestContext = form.watch("requestContext");
  const servicesNeeded = form.watch("servicesNeeded");
  const skipSponsor = requestContext === "group" || requestContext === "personal";
  const showReturningUser = contactLookup?.found === true;
  const skipContact = contactLookup?.found === true && contactDetailsComplete(contactLookup);
  const includeLighting = servicesNeeded.includes("Lighting");

  const activeSteps = useMemo(
    () =>
      getActiveSteps({
        showReturningUser,
        skipContact,
        skipSponsor,
        includeLighting,
      }).filter((step) => step.id !== "thankYou"),
    [showReturningUser, skipContact, skipSponsor, includeLighting],
  );

  const items = useMemo<QuestionnaireItemDefinition[]>(
    () =>
      QUESTION_STEPS.map((name) => {
        const step = activeSteps.find((entry) => entry.id === name);
        return {
          name,
          required:
            name === "additionalNotes" ||
            Boolean(step && !step.skippable && name !== "welcome" && name !== "venue"),
          disabled: !step,
          choices: itemChoices(name, contactLookup, requestContext),
        };
      }),
    [activeSteps, contactLookup, requestContext],
  );

  const currentStep = activeSteps.find((step) => step.id === item) ?? activeSteps[0]!;
  const didFocusActiveItem = useRef(false);

  useEffect(() => {
    if (didFocusActiveItem.current) return;
    const active = document.querySelector<HTMLElement>(
      "[data-slot=questionnaire-item][data-active]",
    );
    if (!active) return;
    active.focus();
    didFocusActiveItem.current = true;
  }, [item]);

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

  const lookupEmail = useCallback(async () => {
    const email = form.getValues("email").trim().toLowerCase();
    let lookup: ContactLookup = { found: false };
    try {
      lookup = await convex.query(api.eventRequests.lookupContactByEmail, { email });
    } catch {
      lookup = { found: false };
    }
    setContactLookup(lookup);
    if (lookup.found) {
      form.setValue("firstName", lookup.firstName, { shouldDirty: true });
      form.setValue("lastName", lookup.lastName, { shouldDirty: true });
      form.setValue("phone", lookup.phone, { shouldDirty: true });
    } else if (contactLookup?.found) {
      form.setValue("firstName", "", { shouldDirty: true });
      form.setValue("lastName", "", { shouldDirty: true });
      form.setValue("phone", "", { shouldDirty: true });
    }
    return lookup;
  }, [contactLookup, convex, form]);

  const handleItemChange = useCallback(
    async (next: string) => {
      setSubmitError(null);
      const currentIndex = activeSteps.findIndex((step) => step.id === item);
      const requestedIndex = activeSteps.findIndex((step) => step.id === next);
      const goingBack = requestedIndex !== -1 && requestedIndex < currentIndex;

      if (goingBack) {
        setItem(next as BookingRequestStepId);
        return;
      }

      const step = activeSteps[currentIndex];
      if (!step) return;

      if (step.id === "email") {
        const valid = await form.trigger(["email"]);
        if (!valid) return;
        setIsAdvancing(true);
        try {
          const lookup = await lookupEmail();
          const nextSteps = getActiveSteps({
            showReturningUser: lookup.found,
            skipContact: lookup.found && contactDetailsComplete(lookup),
            skipSponsor,
            includeLighting,
          }).filter((entry) => entry.id !== "thankYou");
          const following = nextSteps[nextSteps.findIndex((entry) => entry.id === "email") + 1];
          if (following) setItem(following.id);
        } finally {
          setIsAdvancing(false);
        }
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
      } else if (step.fields.length > 0 && !step.skippable) {
        const valid = await form.trigger(step.fields);
        if (!valid) return;
      }

      setItem(next as BookingRequestStepId);
    },
    [activeSteps, form, includeLighting, item, lookupEmail, skipSponsor],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      const valid = await form.trigger();
      if (!valid) return;
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
    },
    [form],
  );

  const returningHeadline =
    contactLookup?.found === true ? `Welcome back, ${contactLookup.firstName}!` : currentStep.headline;

  const renderedStep = trackingInfo ? null : activeSteps.find((entry) => entry.id === item);
  const renderedFieldError = trackingInfo ? undefined : stepFieldError(form, item);
  const renderedHeadline =
    item === "returningUser" ? returningHeadline : (renderedStep?.headline ?? "");
  const renderedRequired =
    item === "additionalNotes" ||
    Boolean(renderedStep && !renderedStep.skippable && item !== "welcome" && item !== "venue");

  return (
    <PublicMarketingLayout hideFooter>
      <FormProvider {...form}>
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
            eyebrow="Booking request"
            progress={
              <QuestionnaireWizardProgress
                complete={Boolean(trackingInfo)}
                label="Booking request progress"
              />
            }
            footer={
              trackingInfo ? null : (
                <QuestionnaireWizardFooter
                  disabled={isSubmitting || isAdvancing}
                  isSubmitting={isSubmitting}
                />
              )
            }
          >
            <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("website")} />

            <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              {submitError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}

              {trackingInfo ? (
                <div className="space-y-6 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-6">
                  <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Thank you!</h1>
                  <div className="space-y-4 text-sm text-foreground/70">
                    <p>We will get back to you soon!</p>
                    <div className="border border-border/50 bg-background/50 p-4 text-foreground">
                      <p className="font-medium">Request {trackingInfo.requestNumber}</p>
                      <p className="mt-1">Save this link to track your request status:</p>
                      <Button asChild className="mt-3" variant="outline">
                        <Link href={`/request/track/${trackingInfo.publicToken}`}>Open request tracker</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <QuestionnaireItem
                  key={item}
                  name={item}
                  required={renderedRequired}
                  disabled={!renderedStep}
                  invalid={Boolean(renderedFieldError)}
                  className={QUESTIONNAIRE_ITEM_CLASSNAME}
                >
                  <div className="space-y-3">
                    <QuestionnaireTitle className={QUESTIONNAIRE_TITLE_CLASSNAME}>
                      {renderedHeadline}
                    </QuestionnaireTitle>
                    {renderedStep?.subheader ? (
                      <QuestionnaireDescription className="text-sm/relaxed text-foreground/70 whitespace-pre-line">
                        {renderedStep.subheader}
                      </QuestionnaireDescription>
                    ) : null}
                  </div>
                  <StepFields
                    stepId={item}
                    contactLookup={contactLookup}
                    onApplyGroup={applyGroup}
                    onApplyPersonal={applyPersonal}
                    onApplyNewGroup={applyNewGroup}
                  />
                  <QuestionnaireError className="text-sm">{renderedFieldError}</QuestionnaireError>
                </QuestionnaireItem>
              )}
            </div>
          </RequestWizardShell>
        </Questionnaire>
      </FormProvider>
    </PublicMarketingLayout>
  );
}

function stepFieldError(
  form: ReturnType<typeof useForm<BookingRequestFormValues>>,
  stepId: BookingRequestStepId,
) {
  const errors = form.formState.errors;
  switch (stepId) {
    case "email":
      return errors.email?.message;
    case "returningUser":
      return errors.requestContext?.message;
    case "contact":
      return errors.firstName?.message ?? errors.lastName?.message ?? errors.phone?.message;
    case "sponsorType":
      return errors.sponsorType?.message ?? errors.sponsorTypeOther?.message ?? errors.organization?.message;
    case "venue":
      return errors.venueName?.message ?? errors.venueAddress?.message;
    case "eventSchedule":
      return errors.showSlots?.message ?? errors.setupTime?.message;
    case "eventName":
      return errors.eventName?.message;
    case "eventCategory":
      return errors.eventCategory?.message ?? errors.eventCategoryOther?.message;
    case "services":
      return errors.crewOrRental?.message ?? errors.servicesNeeded?.message;
    case "productionTier":
      return errors.productionTier?.message;
    case "lighting":
      return errors.lightingPreference?.message;
    case "eventDescription":
      return errors.eventDescription?.message;
    case "expectedTurnout":
      return errors.expectedTurnout?.message;
    case "existingEquipment":
      return errors.existingEquipment?.message;
    case "additionalNotes":
      return errors.additionalNotes?.message;
    default:
      return undefined;
  }
}

function useStepFieldValues(stepId: BookingRequestStepId) {
  const form = useFormContext<BookingRequestFormValues>();
  const fieldNames = BOOKING_REQUEST_STEP_WATCH_FIELDS[stepId];
  const watched = useWatch({
    control: form.control,
    disabled: fieldNames.length === 0,
    name:
      fieldNames.length === 1
        ? fieldNames[0]
        : fieldNames.length > 1
          ? fieldNames
          : undefined,
  });

  return useMemo(
    () => buildStepFieldValuesFromWatch<BookingRequestFormValues>(fieldNames, watched),
    [fieldNames, watched],
  );
}

function StepFields({
  stepId,
  contactLookup,
  onApplyGroup,
  onApplyPersonal,
  onApplyNewGroup,
}: {
  stepId: BookingRequestStepId;
  contactLookup: ContactLookup | null;
  onApplyGroup: (group: ReturningGroup) => void;
  onApplyPersonal: () => void;
  onApplyNewGroup: () => void;
}) {
  const form = useFormContext<BookingRequestFormValues>();
  const values = useStepFieldValues(stepId);

  switch (stepId) {
    case "welcome":
      return <MarkStepAnswered />;
    case "email":
      return (
        <div className="space-y-2">
          <Label htmlFor="email">Stanford email</Label>
          <QuestionnaireInput
            id="email"
            type="email"
            autoFocus
            className="h-9 text-sm"
            placeholder="you@stanford.edu"
            value={values.email}
            onChange={(event) =>
              form.setValue("email", event.currentTarget.value, { shouldDirty: true })
            }
          />
        </div>
      );
    case "returningUser":
      return contactLookup?.found ? (
        <ReturningUserChoices
          groups={contactLookup.groups}
          requestContext={values.requestContext}
          selectedGroupId={values.invoiceGroupId}
          onApplyGroup={onApplyGroup}
          onApplyPersonal={onApplyPersonal}
          onApplyNewGroup={onApplyNewGroup}
        />
      ) : (
        <MarkStepAnswered />
      );
    case "contact":
      return (
        <>
          <MarkStepAnswered />
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="firstName" label="First Name" placeholder="First Name" autoFocus />
              <TextField name="lastName" label="Last Name" placeholder="Last Name" />
            </div>
            <TextField name="phone" label="Phone" placeholder="Phone" type="tel" />
          </div>
        </>
      );
    case "sponsorType":
      return <SponsorTypeChoices form={form} />;
    case "venue":
      return (
        <>
          <MarkStepAnswered />
          <div className="space-y-4">
            <TextField name="venueName" label="Venue Name" placeholder="Venue Name" autoFocus />
            <TextField name="venueAddress" label="Venue Address" placeholder="Venue Address" />
          </div>
        </>
      );
    case "eventSchedule":
      return (
        <>
          <MarkStepAnswered />
          <EventScheduleField />
        </>
      );
    case "eventName":
      return (
        <div className="space-y-2">
          <Label htmlFor="eventName">What is the name for your event?</Label>
          <QuestionnaireInput
            id="eventName"
            autoFocus
            className="h-9 text-sm"
            placeholder="Spring Concert 2026"
            value={values.eventName}
            onChange={(event) =>
              form.setValue("eventName", event.currentTarget.value, { shouldDirty: true })
            }
          />
        </div>
      );
    case "eventCategory":
      return (
        <QuestionnaireChoices>
          {EVENT_CATEGORY_OPTIONS.map((option) => (
            <QuestionnaireChoice
              key={option}
              value={option}
              className={choiceClassName}
              checked={values.eventCategory === option}
              onChange={() =>
                form.setValue("eventCategory", option, { shouldDirty: true, shouldValidate: true })
              }
            >
              {option}
            </QuestionnaireChoice>
          ))}
          {values.eventCategory === "Other" ? (
            <input
              type="text"
              placeholder="What type of event are you running?"
              aria-label="Other event type"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={values.eventCategoryOther ?? ""}
              onChange={(event) =>
                form.setValue("eventCategoryOther", event.currentTarget.value, { shouldDirty: true })
              }
            />
          ) : null}
        </QuestionnaireChoices>
      );
    case "services":
      return (
        <>
          <MarkStepAnswered />
          <ServicesField />
        </>
      );
    case "productionTier":
      return (
        <QuestionnaireChoices>
          {PRODUCTION_TIER_OPTIONS.map((option) => (
            <QuestionnaireChoice
              key={option}
              value={option}
              className={choiceClassName}
              checked={values.productionTier === option}
              onChange={() =>
                form.setValue("productionTier", option, { shouldDirty: true, shouldValidate: true })
              }
            >
              {option}
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
      );
    case "lighting":
      return (
        <QuestionnaireChoices>
          {LIGHTING_TIER_OPTIONS.map((option) => (
            <QuestionnaireChoice
              key={option}
              value={option}
              className={choiceClassName}
              checked={values.lightingPreference === option}
              onChange={() =>
                form.setValue("lightingPreference", option, { shouldDirty: true, shouldValidate: true })
              }
            >
              {option}
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
      );
    case "eventDescription":
      return (
        <>
          <MarkStepAnswered />
          <TextareaField
            name="eventDescription"
            label="Your answer"
            placeholder="I am running a small party with three bands..."
            autoFocus
          />
        </>
      );
    case "expectedTurnout":
      return (
        <>
          <MarkStepAnswered />
          <TurnoutField />
        </>
      );
    case "existingEquipment":
      return (
        <>
          <MarkStepAnswered />
          <TextareaField
            name="existingEquipment"
            label="Your answer"
            placeholder="Type your answer here…"
            autoFocus
          />
        </>
      );
    case "additionalNotes":
      return (
        <>
          <MarkStepAnswered />
          <TextareaField
            name="additionalNotes"
            label="Your answer"
            placeholder="Type your answer here..."
            autoFocus
          />
        </>
      );
    default:
      return null;
  }
}

function ReturningUserChoices({
  groups,
  requestContext,
  selectedGroupId,
  onApplyGroup,
  onApplyPersonal,
  onApplyNewGroup,
}: {
  groups: ReturningGroup[];
  requestContext: BookingRequestFormValues["requestContext"];
  selectedGroupId?: string;
  onApplyGroup: (group: ReturningGroup) => void;
  onApplyPersonal: () => void;
  onApplyNewGroup: () => void;
}) {
  return (
    <QuestionnaireChoices>
      {groups.map((group) => (
        <QuestionnaireChoice
          key={group.groupId}
          value={`group:${group.groupId}`}
          className={choiceClassName}
          checked={requestContext === "group" && selectedGroupId === group.groupId}
          onChange={() => onApplyGroup(group)}
        >
          <span className="font-medium">{group.groupName}</span>
          <QuestionnaireChoiceDescription>Group request</QuestionnaireChoiceDescription>
        </QuestionnaireChoice>
      ))}
      <QuestionnaireChoice
        value="personal"
        className={choiceClassName}
        checked={requestContext === "personal"}
        onChange={onApplyPersonal}
      >
        <span className="font-medium">Personal / individual request</span>
      </QuestionnaireChoice>
      <QuestionnaireChoice
        value="new_group"
        className={choiceClassName}
        checked={requestContext === "new_group"}
        onChange={onApplyNewGroup}
      >
        <span className="font-medium">New organization / group</span>
      </QuestionnaireChoice>
    </QuestionnaireChoices>
  );
}

function SponsorTypeChoices({
  form,
}: {
  form: ReturnType<typeof useForm<BookingRequestFormValues>>;
}) {
  const requestContext = form.watch("requestContext");
  const sponsorType = form.watch("sponsorType");
  const invoiceGroupId = form.watch("invoiceGroupId");
  const sponsorTypeOther = form.watch("sponsorTypeOther");
  const sponsorOptions = sponsorTypeOptionsForContext(requestContext);
  const showOrganization = requiresOrganizationName(sponsorType, invoiceGroupId);

  return (
    <div className="space-y-4">
      <QuestionnaireChoices>
        {sponsorOptions.map((option) => (
          <QuestionnaireChoice
            key={option}
            value={option}
            className={choiceClassName}
            checked={sponsorType === option}
            onChange={() => {
              form.setValue("sponsorType", option, { shouldDirty: true, shouldValidate: true });
              if (option !== "Other") {
                form.setValue("sponsorTypeOther", "", { shouldDirty: true });
              }
              if (!requiresOrganizationName(option, invoiceGroupId)) {
                form.setValue("organization", "", { shouldDirty: true, shouldValidate: true });
                form.setValue("invoiceGroupId", "", { shouldDirty: true });
              }
            }}
          >
            {option}
          </QuestionnaireChoice>
        ))}
        {sponsorType === "Other" ? (
          <input
            type="text"
            placeholder="Who is sponsoring this event?"
            aria-label="Other sponsor type"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={sponsorTypeOther ?? ""}
            onChange={(event) =>
              form.setValue("sponsorTypeOther", event.currentTarget.value, { shouldDirty: true })
            }
          />
        ) : null}
      </QuestionnaireChoices>
      {showOrganization ? <OrganizationSearchField /> : null}
      {sponsorType === INDIVIDUAL_SPONSOR_TYPE ? (
        <p className="text-xs text-muted-foreground">Personal requests do not need an organization name.</p>
      ) : null}
    </div>
  );
}
