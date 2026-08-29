"use server";

import { fetchMutation } from "convex/nextjs";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";

export type BandApplicationFormValues = {
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  bandDisplayName: string;
  oneLiner: string;
  bio: string;
  publicWebsiteUrl: string;
  publicInstagramUrl: string;
  publicYoutubeUrl: string;
  demoURL: string;
  publicHeroImageUrl: string;
  genres: string;
  isSolo: boolean;
  members: Array<{ name: string; email: string }>;
};

export type SubmitBandApplicationResult =
  | { ok: true }
  | { ok: false; message: string };

export async function submitBandApplication(
  raw: BandApplicationFormValues,
): Promise<SubmitBandApplicationResult> {
  try {
    const genres = raw.genres
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    await fetchMutation(api.bandApplications.submitPublic, {
      website: raw.website || undefined,
      contactName: raw.contactName,
      contactEmail: raw.contactEmail,
      contactPhone: raw.contactPhone || undefined,
      bandDisplayName: raw.bandDisplayName,
      oneLiner: raw.oneLiner || undefined,
      bio: raw.bio || undefined,
      publicWebsiteUrl: raw.publicWebsiteUrl || undefined,
      publicInstagramUrl: raw.publicInstagramUrl || undefined,
      publicYoutubeUrl: raw.publicYoutubeUrl || undefined,
      demoURL: raw.demoURL || undefined,
      publicHeroImageUrl: raw.publicHeroImageUrl || undefined,
      genres: genres.length ? genres : undefined,
      isSolo: raw.isSolo,
      members: raw.isSolo
        ? []
        : raw.members
            .map((member) => ({
              name: member.name.trim(),
              email: member.email.trim() || undefined,
            }))
            .filter((member) => member.name.length > 0),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: getConvexErrorMessage(
        error,
        "Unable to submit your application. Please try again.",
      ),
    };
  }
}
