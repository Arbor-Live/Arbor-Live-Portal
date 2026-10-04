import type { Tone } from "@/components/page-header";
import { ARTIST_TYPE_LABELS, isArtistOrganizationType, type ArtistType } from "@/lib/artist-types";

export type BandApplicationStatus = "submitted" | "approved" | "declined";

/** Workflow order: the order groups appear on the page. */
export const BAND_APPLICATION_STATUSES: BandApplicationStatus[] = ["submitted", "approved", "declined"];

export const BAND_APPLICATION_STATUS_LABELS: Record<BandApplicationStatus, string> = {
  submitted: "Pending",
  approved: "Approved",
  declined: "Declined",
};

export const BAND_APPLICATION_STATUS_TONES: Record<BandApplicationStatus, Tone> = {
  submitted: "amber",
  approved: "emerald",
  declined: "neutral",
};

/** One line under each group header. */
export const BAND_APPLICATION_STATUS_DESCRIPTIONS: Record<BandApplicationStatus, string> = {
  submitted: "Waiting on a decision. Open one to read it, then approve or decline.",
  approved: "Artist org created and the contact invited to finish onboarding.",
  declined: "Declined, with an email to the contact.",
};

/** The page starts on pending applications. */
export const DEFAULT_BAND_APPLICATION_STATUSES: BandApplicationStatus[] = ["submitted"];

/**
 * The `listAdmin` args for a Status filter chip. The query takes one status at
 * most, so one status loads just that (newest first, by index) and anything
 * else loads every application and filters in place.
 */
export function bandApplicationListArgs(
  filter: { operator: "is" | "is_not"; values: string[] } | undefined,
): { status?: BandApplicationStatus } {
  if (!filter || filter.values.length === 0) return {};
  const included = BAND_APPLICATION_STATUSES.filter((status) =>
    filter.operator === "is" ? filter.values.includes(status) : !filter.values.includes(status),
  );
  return included.length === 1 ? { status: included[0] } : {};
}

export function artistTypeOf(value: string | undefined): ArtistType {
  return isArtistOrganizationType(value) ? (value as ArtistType) : "other";
}

/** The row's context label: "Band · Indie, Folk". */
export function bandApplicationContext(application: { organizationType?: string; genres?: string[] }) {
  const type = ARTIST_TYPE_LABELS[artistTypeOf(application.organizationType)];
  const genres = (application.genres ?? []).slice(0, 2).join(", ");
  return genres ? `${type} · ${genres}` : type;
}

/** Everyone approving invites: the contact, plus each listed member with an email (deduplicated). */
export function bandApplicationInviteCount(application: {
  contactEmail: string;
  isSolo: boolean;
  members: Array<{ email?: string }>;
}) {
  const emails = new Set([application.contactEmail.trim().toLowerCase()]);
  if (!application.isSolo) {
    for (const member of application.members) {
      const email = member.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }
  }
  return emails.size;
}

/** "Solo" or "4 people", counting the contact. */
export function bandApplicationLineup(application: { isSolo: boolean; members: unknown[] }) {
  if (application.isSolo) return "Solo";
  const count = application.members.length + 1;
  return `${count} ${count === 1 ? "person" : "people"}`;
}
