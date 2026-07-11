import { z } from "zod";

export const STANFORD_EMAIL_PATTERN =
  /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i;

export function isStanfordEmail(email: string) {
  return STANFORD_EMAIL_PATTERN.test(email.trim());
}

export const INDIVIDUAL_SPONSOR_TYPE = "Individual Stanford Affiliate" as const;

export function requiresOrganizationName(
  sponsorType: string,
  invoiceGroupId?: string,
) {
  if (invoiceGroupId?.trim()) return false;
  return sponsorType !== INDIVIDUAL_SPONSOR_TYPE;
}

export const SPONSOR_TYPE_OPTIONS = [
  "Stanford Department",
  "Large Voulunteer Student Organization",
  "Small Voulunteer Student Organization",
  "Stanford House / Greek Life",
  "Individual Stanford Affiliate",
  "Other",
] as const;

export const EVENT_CATEGORY_OPTIONS = [
  "Live Bands",
  "DJ",
  "Speaker Event",
  "Other",
] as const;

export const CREW_OR_RENTAL_OPTIONS = ["Crewed", "Rental"] as const;

export const ADDON_SERVICE_OPTIONS = [
  "Sound",
  "Lighting",
  "Staging",
  "Collaboration",
  "Scheduling",
] as const;

export const PRODUCTION_TIER_OPTIONS = [
  'Premium / High-Impact: A fully bespoke experience with custom lighting design, high-fidelity sound reinforcement, and dedicated technical planning to create a "wow" factor.',
  "Professional / Polished: A high-standard setup focused on clarity and atmosphere. Ideal for events that need to look and sound seamless, reliable, and professional.",
  "Essential / Functional: A clean, straightforward setup providing high-quality basics (clear audio and standard lighting) to ensure the event's core needs are met.",
] as const;

export const LIGHTING_TIER_OPTIONS = [
  "Basic Lighting - Making sure people can see where they are going",
  "Standard Lighting - Some more lighting that is themed to your event, with a more reactive experience to the music",
  "Professional Lighting - Involves more fancy lighting, such as moving heads and light bars, but is more expensive",
] as const;

export const STANDARD_LIGHTING =
  "Standard Lighting - Some more lighting that is themed to your event, with a more reactive experience to the music";

export const REQUEST_CONTEXT_OPTIONS = [
  "group",
  "personal",
  "new_group",
] as const;

export function sponsorTypeOptionsForContext(
  requestContext?: (typeof REQUEST_CONTEXT_OPTIONS)[number],
) {
  if (requestContext === "personal") {
    return SPONSOR_TYPE_OPTIONS.filter((option) => option !== INDIVIDUAL_SPONSOR_TYPE);
  }
  return SPONSOR_TYPE_OPTIONS;
}

import {
  combineDateAndTime,
  createDefaultShowSlot,
  deriveLegacyTimeTexts,
  formatDisplayTime,
  formatShowDatesFromSlots,
  formatShowScheduleText,
  getEarliestShowSlot,
  getEarliestShowStartMs,
  getLatestShowEndMs,
  resolveShowSlot,
} from "@/lib/event-schedule";

const showSlotSchema = z.object({
  date: z.string().trim().min(1, "Date is required"),
  startTime: z.string().trim().min(1, "Start time is required"),
  endTime: z.string().trim().min(1, "End time is required"),
});

export function getTurnoutTier(count: number) {
  if (count < 50) {
    return {
      label: "Cozy crew",
      description: "Under 50, intimate and sweet",
      people: Math.min(Math.max(count, 8), 12),
    };
  }
  if (count < 100) {
    return {
      label: "Party's picking up",
      description: "50 to 100 guests, the energy's building",
      people: 18,
    };
  }
  if (count < 200) {
    return {
      label: "Packed house",
      description: "100 to 200 guests, the room is alive",
      people: 28,
    };
  }
  return {
    label: "Campus sensation",
    description: "200+ guests, we'll follow up with extra planning",
    people: 40,
  };
}

export const bookingRequestSchema = z
  .object({
    website: z.string().max(0).optional(),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .refine(isStanfordEmail, "Use your @stanford.edu email address"),
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    phone: z.string().trim().min(1, "Phone is required"),
    organization: z.string().trim().optional(),
    requestContext: z.enum(REQUEST_CONTEXT_OPTIONS).optional(),
    invoiceGroupId: z.string().trim().optional(),
    sponsorType: z.enum(SPONSOR_TYPE_OPTIONS, {
      message: "Select a sponsor type",
    }),
    sponsorTypeOther: z.string().trim().optional(),
    venueName: z.string().trim().optional(),
    venueAddress: z.string().trim().optional(),
    showSlots: z.array(showSlotSchema).min(1, "Add at least one show"),
    setupTime: z.string().trim().optional(),
    flexibleSetupTime: z.boolean(),
    eventName: z.string().trim().min(1, "Event name is required"),
    eventCategory: z.enum(EVENT_CATEGORY_OPTIONS, {
      message: "Select an event type",
    }),
    eventCategoryOther: z.string().trim().optional(),
    crewOrRental: z.enum(CREW_OR_RENTAL_OPTIONS, {
      message: "Select crewed or rental",
    }),
    servicesNeeded: z.array(z.enum(ADDON_SERVICE_OPTIONS)),
    productionTier: z.enum(PRODUCTION_TIER_OPTIONS).optional(),
    eventDescription: z.string().trim().optional(),
    expectedTurnout: z
      .number({ message: "Enter expected turnout" })
      .int("Turnout must be a whole number")
      .positive("Turnout must be greater than zero"),
    existingEquipment: z.string().trim().optional(),
    lightingPreference: z.enum(LIGHTING_TIER_OPTIONS).optional(),
    additionalNotes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (requiresOrganizationName(data.sponsorType, data.invoiceGroupId) && !data.organization?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter your organization or group name",
        path: ["organization"],
      });
    }
    if (data.sponsorType === "Other" && !data.sponsorTypeOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe who is sponsoring this event",
        path: ["sponsorTypeOther"],
      });
    }
    if (data.eventCategory === "Other" && !data.eventCategoryOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe your event type",
        path: ["eventCategoryOther"],
      });
    }
    if (!data.flexibleSetupTime && !data.setupTime?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setup time is required unless flexible",
        path: ["setupTime"],
      });
    }

    const showSlots = data.showSlots.map((slot) => ({
      date: slot.date.trim(),
      startTime: slot.startTime.trim(),
      endTime: slot.endTime.trim(),
    }));

    if (showSlots.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one show",
        path: ["showSlots"],
      });
    }

    for (let index = 0; index < showSlots.length; index += 1) {
      const slot = showSlots[index];
      const resolved = resolveShowSlot(slot);
      if (!resolved) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid show time",
          path: ["showSlots", index, slot.date ? "startTime" : "date"],
        });
        continue;
      }
      if (slot.startTime === slot.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time",
          path: ["showSlots", index, "endTime"],
        });
      }
    }

    const earliestShow = getEarliestShowSlot(showSlots);
    const earliestStartMs = getEarliestShowStartMs(showSlots);
    const setupMs =
      !data.flexibleSetupTime && data.setupTime?.trim() && earliestShow
        ? combineDateAndTime(earliestShow.date, data.setupTime)
        : null;

    if (!data.flexibleSetupTime && setupMs && earliestStartMs && setupMs >= earliestStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setup must be before the first show start",
        path: ["setupTime"],
      });
    }

    if (data.servicesNeeded.includes("Lighting") && !data.lightingPreference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a lighting tier",
        path: ["lightingPreference"],
      });
    }
  });

export type BookingRequestFormValues = z.infer<typeof bookingRequestSchema>;

export const bookingRequestDefaultValues: BookingRequestFormValues = {
  website: "",
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  organization: "",
  requestContext: undefined,
  invoiceGroupId: "",
  sponsorType: "Stanford Department",
  sponsorTypeOther: "",
  venueName: "",
  venueAddress: "",
  showSlots: [createDefaultShowSlot()],
  setupTime: "15:00",
  flexibleSetupTime: false,
  eventName: "",
  eventCategory: "Live Bands",
  eventCategoryOther: "",
  crewOrRental: "Crewed",
  servicesNeeded: [],
  productionTier: undefined,
  eventDescription: "",
  expectedTurnout: 100,
  existingEquipment: "",
  lightingPreference: STANDARD_LIGHTING,
  additionalNotes: "",
};

export type BookingRequestStepId =
  | "welcome"
  | "email"
  | "returningUser"
  | "contact"
  | "sponsorType"
  | "venue"
  | "eventSchedule"
  | "eventName"
  | "eventCategory"
  | "services"
  | "productionTier"
  | "lighting"
  | "eventDescription"
  | "expectedTurnout"
  | "existingEquipment"
  | "additionalNotes"
  | "thankYou";

export type BookingRequestStepConfig = {
  id: BookingRequestStepId;
  headline: string;
  subheader?: string;
  fields: Array<keyof BookingRequestFormValues>;
  skippable?: boolean;
};

const BASE_STEPS: BookingRequestStepConfig[] = [
  {
    id: "welcome",
    headline: "Welcome!",
    subheader:
      "Thank you for your interest in booking Arbor Live for your event! This form will provide us with all the information we need to ensure your event's success. Once you have completed this form, a member of our team will contact you with the next steps.\n\nEst. response time: 1-5 days\n\nIf you need a response ASAP, please email us at arborlive@stanford.edu",
    fields: [],
  },
  {
    id: "email",
    headline: "What's your Stanford email?",
    subheader:
      "We'll use this to look up your contact info and send updates about your request.",
    fields: ["email"],
  },
  {
    id: "returningUser",
    headline: "Welcome back!",
    subheader: "Who are you filling out this request for?",
    fields: ["requestContext", "invoiceGroupId"],
  },
  {
    id: "contact",
    headline: "Let's get started!",
    subheader: "Let us know the best way to reach you.",
    fields: ["firstName", "lastName", "phone"],
  },
  {
    id: "sponsorType",
    headline: "What best describes who is running/sponsoring this event?",
    fields: ["sponsorType", "sponsorTypeOther", "organization"],
  },
  {
    id: "venue",
    headline: "Where is the event happening?",
    subheader:
      "If you do not know yet, leave empty. Off-campus events may have additional fees.",
    fields: ["venueName", "venueAddress"],
  },
  {
    id: "eventSchedule",
    headline: "When is your event?",
    subheader:
      "Pick your show date on the calendar — dots show how busy we already are (green is best). Add times on the right, and use “Add another show” for multiple performances or different days. Events requested with less than seven days' notice may have limited availability and overtime rates.",
    fields: ["showSlots", "setupTime", "flexibleSetupTime"],
  },
  {
    id: "eventName",
    headline: "What is the name for your event?",
    fields: ["eventName"],
  },
  {
    id: "eventCategory",
    headline: "What type of event are you running?",
    subheader: "This will help us dial in your necessities",
    fields: ["eventCategory", "eventCategoryOther"],
  },
  {
    id: "services",
    headline: "What services do you need from us?",
    subheader:
      "Start with crewed or rental, then choose the production areas you need.",
    fields: ["crewOrRental", "servicesNeeded"],
  },
  {
    id: "productionTier",
    headline:
      "Please select the option that best describes your ideal event production value",
    fields: ["productionTier"],
    skippable: true,
  },
  {
    id: "lighting",
    headline: "What lighting tier do you want?",
    subheader: "If your event happens at night we strongly recommend lighting.",
    fields: ["lightingPreference"],
  },
  {
    id: "eventDescription",
    headline: "Describe your event",
    subheader:
      "Tell us a little about your event! What kind of vibe are you looking for? What will be happening during the event?",
    fields: ["eventDescription"],
    skippable: true,
  },
  {
    id: "expectedTurnout",
    headline: "Expected turnout",
    subheader:
      "How many people are you expecting? This helps us gauge what we need to bring.",
    fields: ["expectedTurnout"],
  },
  {
    id: "existingEquipment",
    headline: "What equipment do you already have?",
    subheader:
      "If you already have equipment, please let us know here so we can exclude it from the quote.",
    fields: ["existingEquipment"],
    skippable: true,
  },
  {
    id: "additionalNotes",
    headline: "Any other notes?",
    subheader:
      "Have we missed anything or do you want to let us know about something?",
    fields: ["additionalNotes"],
    skippable: true,
  },
  {
    id: "thankYou",
    headline: "Thank you!",
    subheader: "We will get back to you soon!",
    fields: [],
  },
];

export function getActiveSteps(options: {
  showReturningUser: boolean;
  skipSponsor: boolean;
  includeLighting: boolean;
}) {
  return BASE_STEPS.filter((step) => {
    if (step.id === "returningUser" && !options.showReturningUser) return false;
    if (step.id === "sponsorType" && options.skipSponsor) return false;
    if (step.id === "lighting" && !options.includeLighting) return false;
    return true;
  });
}

export function toSubmitPayload(values: BookingRequestFormValues) {
  const sponsorType =
    values.sponsorType === "Other" && values.sponsorTypeOther?.trim()
      ? `Other: ${values.sponsorTypeOther.trim()}`
      : values.sponsorType;
  const eventCategory =
    values.eventCategory === "Other" && values.eventCategoryOther?.trim()
      ? `Other: ${values.eventCategoryOther.trim()}`
      : values.eventCategory;

  const showSlots = values.showSlots.map((slot) => ({
    date: slot.date.trim(),
    startTime: slot.startTime.trim(),
    endTime: slot.endTime.trim(),
  }));

  const eventDateText = formatShowDatesFromSlots(showSlots);
  const { eventStartTimeText, eventEndTimeText } = deriveLegacyTimeTexts(showSlots);
  const eventScheduleText =
    showSlots.length > 1 ? formatShowScheduleText(showSlots) : undefined;
  const earliestShow = getEarliestShowSlot(showSlots);
  const earliestSetupText = values.flexibleSetupTime
    ? "Flexible setup time"
    : formatDisplayTime(values.setupTime ?? "");

  const eventStartAtMs = getEarliestShowStartMs(showSlots) ?? undefined;
  const eventEndAtMs = getLatestShowEndMs(showSlots) ?? undefined;
  const setupAtMs =
    !values.flexibleSetupTime && values.setupTime?.trim() && earliestShow
      ? combineDateAndTime(earliestShow.date, values.setupTime) ?? undefined
      : undefined;

  const resolvedShowSlots = showSlots
    .map(resolveShowSlot)
    .filter((slot): slot is NonNullable<ReturnType<typeof resolveShowSlot>> => slot !== null)
    .map((slot) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      startAtMs: slot.startAtMs,
      endAtMs: slot.endAtMs,
      endsNextDay: slot.endsNextDay,
    }));

  const servicesNeeded = [values.crewOrRental, ...values.servicesNeeded];

  return {
    website: values.website ?? "",
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    organization: values.organization || undefined,
    sponsorType,
    invoiceGroupId: values.invoiceGroupId || undefined,
    requestContext: values.requestContext,
    venueName: values.venueName || undefined,
    venueAddress: values.venueAddress || undefined,
    eventDateText,
    eventStartTimeText,
    eventEndTimeText,
    earliestSetupText,
    eventStartAtMs,
    eventEndAtMs,
    setupAtMs,
    flexibleSetupTime: values.flexibleSetupTime,
    showSlots: resolvedShowSlots,
    eventScheduleText,
    endsNextDay: resolvedShowSlots.some((slot) => slot.endsNextDay),
    eventName: values.eventName.trim(),
    eventCategory,
    crewOrRental: values.crewOrRental,
    servicesNeeded,
    productionTier: values.productionTier,
    eventDescription: values.eventDescription || undefined,
    expectedTurnout: values.expectedTurnout,
    existingEquipment: values.existingEquipment || undefined,
    lightingPreference: values.servicesNeeded.includes("Lighting")
      ? values.lightingPreference
      : undefined,
    additionalNotes: values.additionalNotes || undefined,
  };
}
