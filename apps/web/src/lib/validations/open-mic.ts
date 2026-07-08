import { z } from "zod";

export const OPEN_MIC_EQUIPMENT_OPTIONS = [
  "Piano",
  "Headphone Jack",
  "Background Music",
  '3/4" Cable',
  "Music Stand",
] as const;

export type OpenMicEquipment = (typeof OPEN_MIC_EQUIPMENT_OPTIONS)[number];

export const STANFORD_EMAIL_PATTERN =
  /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i;

export function isStanfordEmail(email: string) {
  return STANFORD_EMAIL_PATTERN.test(email.trim());
}

export const openMicSignupSchema = z
  .object({
    website: z.string().max(0).optional(),
    name: z.string().trim().min(1, "Name is required"),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .refine(isStanfordEmail, "Use your @stanford.edu email address"),
    whatTheyreDoing: z
      .string()
      .trim()
      .min(1, "Tell us what you'll be doing"),
    equipment: z.array(z.enum(OPEN_MIC_EQUIPMENT_OPTIONS)),
    bgMusicLink: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.equipment.includes("Background Music")) {
      if (!data.bgMusicLink?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a background music link when selecting Background Music",
          path: ["bgMusicLink"],
        });
      } else {
        try {
          const url = new URL(data.bgMusicLink.trim());
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("invalid");
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Enter a valid http(s) link",
            path: ["bgMusicLink"],
          });
        }
      }
    }
  });

export type OpenMicSignupFormValues = z.infer<typeof openMicSignupSchema>;

export const openMicSignupDefaultValues: OpenMicSignupFormValues = {
  website: "",
  name: "",
  email: "",
  whatTheyreDoing: "",
  equipment: [],
  bgMusicLink: "",
  notes: "",
};

export type OpenMicStepId =
  | "intro"
  | "welcome"
  | "name"
  | "email"
  | "whatYoureDoing"
  | "equipment"
  | "bgMusicLink"
  | "notes"
  | "thankYou";

export type OpenMicStepConfig = {
  id: OpenMicStepId;
  headline: string;
  subheader?: string;
  fields: Array<keyof OpenMicSignupFormValues>;
  skippable?: boolean;
};

const BASE_STEPS: OpenMicStepConfig[] = [
  {
    id: "welcome",
    headline: "Open Mic sign-up",
    subheader:
      "Sign up to perform at the next Arbor Live open mic. We go down the list first-come, first-served. Add your info and we'll add you to the queue.",
    fields: [],
  },
  {
    id: "name",
    headline: "What's your name?",
    fields: ["name"],
  },
  {
    id: "email",
    headline: "What's your Stanford email?",
    subheader: "We use this only to recognize you when your slot comes up.",
    fields: ["email"],
  },
  {
    id: "whatYoureDoing",
    headline: "What will you be doing?",
    subheader: "Sing us a quick summary — a song, a comedy bit, a poem, an instrument.",
    fields: ["whatTheyreDoing"],
  },
  {
    id: "equipment",
    headline: "Any equipment required?",
    subheader: "Pick anything you need from us. If you don't need any of these, just hit Next.",
    fields: ["equipment"],
    skippable: true,
  },
  {
    id: "bgMusicLink",
    headline: "Background music link",
    subheader:
      "Drop a link to the backing track or playlist you'd like played during your set.",
    fields: ["bgMusicLink"],
  },
  {
    id: "notes",
    headline: "Anything else we should know?",
    subheader: "Optional — pronouns, set length, anything.",
    fields: ["notes"],
    skippable: true,
  },
  {
    id: "thankYou",
    headline: "You're on the list!",
    subheader: "See you at open mic. We'll call you up when it's your turn.",
    fields: [],
  },
];

export const OPEN_MIC_INTRO_STEP: OpenMicStepConfig = {
  id: "intro",
  headline: "We are Arbor Live",
  fields: [],
};

export function getActiveSteps(options: { showBgMusicLink: boolean }) {
  return BASE_STEPS.filter((step) => {
    if (step.id === "bgMusicLink" && !options.showBgMusicLink) return false;
    return true;
  });
}

export function toSubmitPayload(values: OpenMicSignupFormValues) {
  const equipment = Array.from(new Set(values.equipment));
  const needsBgMusic = equipment.includes("Background Music");
  return {
    website: values.website ?? "",
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    whatTheyreDoing: values.whatTheyreDoing.trim(),
    equipment,
    bgMusicLink: needsBgMusic ? values.bgMusicLink?.trim() || undefined : undefined,
    notes: values.notes?.trim() || undefined,
  };
}