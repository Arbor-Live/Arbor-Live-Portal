import type { EmailTemplate } from "../email/constants";
import type { UserInviteKind } from "./userParticipation";

/**
 * Per-user email notification preferences.
 *
 * Every configurable transactional template lists the audience that can receive
 * it. Account settings only shows a toggle when the viewer matches the audience
 * (a person may belong to several orgs, so the applicable set is the union of
 * their roles). Enforcement is centralized in `email/enqueue.ts`, which looks up
 * the recipient's profile and drops sends for templates they turned off.
 */
export type EmailPreferenceAudience =
  | "everyone"
  | "crew"
  | "arbor_member"
  | "staff"
  | "operations"
  | "crew_vertical"
  | "artist";

export type EmailPreferenceGroup =
  | "General"
  | "Events & crew"
  | "Mentions"
  | "Staff alerts"
  | "Financials"
  | "Artist payouts";

export type EmailPreferenceDefinition = {
  template: EmailTemplate;
  label: string;
  audience: EmailPreferenceAudience;
  group: EmailPreferenceGroup;
};

export const EMAIL_PREFERENCE_DEFINITIONS: readonly EmailPreferenceDefinition[] = [
  {
    template: "weekly_digest",
    label: "Weekly digest",
    audience: "everyone",
    group: "General",
  },
  {
    template: "event_cancelled",
    label: "Event cancellations",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "schedule_published",
    label: "Run of show published",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "crew_scheduled",
    label: "Event assignments",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "crew_unscheduled",
    label: "Assignment removals",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "schedule_reminder",
    label: "Schedule reminders",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "onboarding_reminder",
    label: "Onboarding reminders",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "post_event_album",
    label: "Post-event photo albums",
    audience: "crew",
    group: "Events & crew",
  },
  {
    template: "comment_mention",
    label: "Comment mentions",
    audience: "arbor_member",
    group: "Mentions",
  },
  {
    template: "event_comment_mention",
    label: "Event comment mentions",
    audience: "arbor_member",
    group: "Mentions",
  },
  {
    template: "artist_need_inquiry",
    label: "Artist performance requests",
    audience: "operations",
    group: "Staff alerts",
  },
  {
    template: "damage_report_admin",
    label: "Damage reports",
    audience: "operations",
    group: "Staff alerts",
  },
  {
    template: "booking_request_admin",
    label: "New booking requests",
    audience: "crew_vertical",
    group: "Staff alerts",
  },
  {
    template: "band_application_received",
    label: "New artist applications",
    audience: "crew_vertical",
    group: "Staff alerts",
  },
  {
    template: "crew_application_received",
    label: "New crew applications",
    audience: "crew_vertical",
    group: "Staff alerts",
  },
  {
    template: "equipment_borrow_request_admin",
    label: "Equipment borrow requests",
    audience: "crew_vertical",
    group: "Staff alerts",
  },
  {
    template: "onboarding_completed",
    label: "Crew onboarding completions",
    audience: "staff",
    group: "Staff alerts",
  },
  {
    template: "equipment_borrow_request_decided",
    label: "Borrow request decisions",
    audience: "staff",
    group: "Staff alerts",
  },
  {
    template: "quote_changes_requested",
    label: "Quote change requests",
    audience: "staff",
    group: "Financials",
  },
  {
    template: "quote_approved",
    label: "Quote approvals",
    audience: "staff",
    group: "Financials",
  },
  {
    template: "payment_proof_submitted",
    label: "Payment proof submissions",
    audience: "staff",
    group: "Financials",
  },
  {
    template: "band_assigned",
    label: "Band assignments",
    audience: "artist",
    group: "Artist payouts",
  },
  {
    template: "band_payment_completed",
    label: "Payments submitted",
    audience: "artist",
    group: "Artist payouts",
  },
  {
    template: "band_payment_payee_required",
    label: "Payee info needed",
    audience: "artist",
    group: "Artist payouts",
  },
  {
    template: "band_onboarding_reminder",
    label: "Onboarding reminders",
    audience: "artist",
    group: "Artist payouts",
  },
];

const CONFIGURABLE_TEMPLATES = new Set<string>(
  EMAIL_PREFERENCE_DEFINITIONS.map((definition) => definition.template),
);

export function isConfigurableEmailTemplate(template: string): template is EmailTemplate {
  return CONFIGURABLE_TEMPLATES.has(template);
}

/** The only field needed to resolve a user's opt-outs. */
export type EmailPreferenceSource = {
  emailOptOuts?: readonly string[];
};

/**
 * Advisors historically received no Operations damage-report email. Seed that
 * opt-out when a profile is first created from an invite.
 */
export function emailOptOutsForInviteKind(kind: UserInviteKind | undefined): string[] {
  return kind === "advisor" ? ["damage_report_admin"] : [];
}

/** The set of templates a user has turned off. */
export function resolveDisabledEmailTemplates(
  profile: EmailPreferenceSource | null | undefined,
): Set<string> {
  return new Set(profile?.emailOptOuts ?? []);
}

export function isEmailTemplateEnabled(
  profile: EmailPreferenceSource | null | undefined,
  template: EmailTemplate,
): boolean {
  return !resolveDisabledEmailTemplates(profile).has(template);
}

export type EmailPreferenceApplicability = {
  isPortalAdmin: boolean;
  verticals: readonly string[];
  assignableAsCrew: boolean;
  isArtistMember: boolean;
};

export function isEmailPreferenceApplicable(
  audience: EmailPreferenceAudience,
  viewer: EmailPreferenceApplicability,
): boolean {
  switch (audience) {
    case "everyone":
      return true;
    case "crew":
      return viewer.assignableAsCrew;
    case "arbor_member":
      return viewer.isPortalAdmin || viewer.assignableAsCrew;
    case "staff":
      return viewer.isPortalAdmin;
    case "operations":
      return viewer.isPortalAdmin && viewer.verticals.includes("Operations");
    case "crew_vertical":
      return viewer.isPortalAdmin && viewer.verticals.includes("Crew");
    case "artist":
      return viewer.isArtistMember;
  }
}

export function listApplicableEmailPreferences(
  viewer: EmailPreferenceApplicability,
): EmailPreferenceDefinition[] {
  return EMAIL_PREFERENCE_DEFINITIONS.filter((definition) =>
    isEmailPreferenceApplicable(definition.audience, viewer),
  );
}
