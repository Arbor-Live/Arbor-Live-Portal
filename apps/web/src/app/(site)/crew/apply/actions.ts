"use server";

import { fetchMutation } from "convex/nextjs";
import { api } from "@/lib/convex-api";

export type CrewApplicationFormValues = {
  website: string;
  name: string;
  email: string;
  phone: string;
  heardAboutUs: string;
  vertical: "Operations" | "Crew" | "Trivia" | "Marketing";
  discipline: "" | "Sound" | "Lights" | "Design" | "unsure";
  friday: boolean;
  saturday: boolean;
  stanfordPosition: "undergrad" | "coterm" | "masters" | "phd" | "postdoc" | "other";
  gradYear: string;
};

export type SubmitCrewApplicationResult =
  | { ok: true }
  | { ok: false; message: string };

export async function submitCrewApplication(
  raw: CrewApplicationFormValues,
): Promise<SubmitCrewApplicationResult> {
  try {
    const crewAvailabilityDays: Array<"friday" | "saturday"> = [];
    if (raw.friday) crewAvailabilityDays.push("friday");
    if (raw.saturday) crewAvailabilityDays.push("saturday");

    const gradYear = raw.gradYear.trim() ? Number(raw.gradYear) : undefined;

    await fetchMutation(api.crewApplications.submitPublic, {
      website: raw.website || undefined,
      name: raw.name,
      email: raw.email,
      phone: raw.phone,
      heardAboutUs: raw.heardAboutUs,
      vertical: raw.vertical,
      discipline: raw.vertical === "Crew" && raw.discipline ? raw.discipline : undefined,
      crewAvailabilityDays: raw.vertical === "Crew" ? crewAvailabilityDays : undefined,
      stanfordPosition: raw.stanfordPosition,
      gradYear: raw.stanfordPosition === "other" ? undefined : gradYear,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to submit your application. Please try again.",
    };
  }
}
