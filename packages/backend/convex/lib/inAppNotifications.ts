import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { type EmailTemplate, SITE_URL } from "../email/constants";
import { isConfigurableEmailTemplate, isTemplateEnabledForChannel } from "./emailPreferences";

/**
 * In-app notifications mirror the email queue: `email/enqueue.ts` calls
 * `recordInAppNotification` for every email whose recipient has an account.
 *
 * Only templates listed here reach the notification center. Auth emails,
 * applicant/client confirmations and newsletters stay email-only — their
 * recipients usually have no account, or the email *is* the action.
 *
 * `linkFields` are payload keys tried in order; the first same-origin URL
 * becomes the row's `path`, and visiting that page marks the row read.
 */
const IN_APP_TEMPLATES: Partial<Record<EmailTemplate, { linkFields: readonly string[] }>> = {
  event_cancelled: { linkFields: ["eventUrl"] },
  schedule_published: { linkFields: ["eventUrl"] },
  crew_scheduled: { linkFields: ["eventUrl"] },
  crew_unscheduled: { linkFields: ["eventUrl"] },
  schedule_reminder: { linkFields: ["eventUrl"] },
  booking_request_admin: { linkFields: ["reviewUrl"] },
  payment_proof_submitted: { linkFields: ["portalUrl"] },
  quote_changes_requested: { linkFields: ["invoiceUrl"] },
  quote_approved: { linkFields: ["invoiceUrl"] },
  paying_party_added: { linkFields: [] },
  band_assigned: { linkFields: ["dashboardUrl"] },
  band_event_onboarding_invite: { linkFields: ["portalUrl"] },
  band_onboarding_reminder: { linkFields: ["onboardingUrl"] },
  band_payment_confirmation: { linkFields: ["signUrl"] },
  band_payment_completed: { linkFields: [] },
  band_payment_payee_required: { linkFields: ["payeeSettingsUrl"] },
  onboarding_completed: { linkFields: ["dashboardUsersUrl"] },
  onboarding_reminder: { linkFields: ["onboardingUrl"] },
  band_application_received: { linkFields: ["reviewUrl"] },
  crew_application_received: { linkFields: ["reviewUrl"] },
  rental_outbound_packed: { linkFields: ["eventUrl"] },
  rental_return_processed: { linkFields: ["eventUrl"] },
  post_event_album: { linkFields: ["eventUrl", "albumPortalUrl"] },
  event_comment_mention: { linkFields: ["eventUrl"] },
  comment_mention: { linkFields: ["url"] },
  equipment_borrow_request_admin: { linkFields: ["reviewUrl"] },
  equipment_borrow_request_decided: { linkFields: ["requestsUrl"] },
  damage_report_admin: { linkFields: ["reportUrl"] },
  artist_need_inquiry: { linkFields: ["reviewUrl"] },
};

/** Recent rows shown in the bell popover. */
export const NOTIFICATION_LIST_LIMIT = 30;
/** Unread rows read per query; the badge shows "N+" past this. */
export const UNREAD_SCAN_LIMIT = 100;

export function isInAppNotificationTemplate(template: EmailTemplate) {
  return template in IN_APP_TEMPLATES;
}

function siteOrigin() {
  try {
    return new URL(SITE_URL).origin;
  } catch {
    return null;
  }
}

/**
 * Same-origin URL → `pathname + search`. A sign-in link with `?redirect=`
 * resolves to its destination so visiting that page still marks it read.
 */
export function toNotificationPath(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const origin = siteOrigin();
  if (!origin) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return undefined;
  }
  if (parsed.origin !== origin) return undefined;
  if (parsed.pathname === "/sign-in") {
    const redirect = parsed.searchParams.get("redirect");
    return redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : undefined;
  }
  return `${parsed.pathname}${parsed.search}`;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clip(text: string, max = 140) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Second line under the subject: the comment for mentions, else when/where. */
function buildBody(payload: Record<string, unknown>) {
  const snippet = payloadString(payload, "commentSnippet");
  if (snippet) {
    const author = payloadString(payload, "authorName");
    return clip(author ? `${author}: ${snippet}` : snippet);
  }
  const when = payloadString(payload, "dateRangeLabel") ?? payloadString(payload, "eventDateLabel");
  const where = payloadString(payload, "venueName");
  const parts = [when, where].filter(Boolean);
  return parts.length ? clip(parts.join(" · ")) : undefined;
}

type RecordInAppNotificationArgs = {
  userId: string;
  template: EmailTemplate;
  subject: string;
  payload: unknown;
  eventId?: Id<"events">;
  idempotencyKey: string;
  /** Set for debounced emails: the row stays hidden until `delayMs` passes. */
  debounce?: { key: string; delayMs: number };
};

/**
 * Create or refresh the notification mirrored from one email. Replays of the
 * same idempotency key are no-ops. Debounced sends share one row per debounce
 * key: each update resets the timer, and delivery replaces the previous row.
 */
export async function recordInAppNotification(
  ctx: MutationCtx,
  args: RecordInAppNotificationArgs,
) {
  const definition = IN_APP_TEMPLATES[args.template];
  if (!definition) return null;

  const payload =
    args.payload && typeof args.payload === "object"
      ? (args.payload as Record<string, unknown>)
      : {};
  const path = definition.linkFields
    .map((field) => toNotificationPath(payload[field]))
    .find((value) => value !== undefined);
  const content = {
    title: args.subject,
    body: buildBody(payload),
    path,
    eventId: args.eventId,
  };
  const dedupeKey = args.debounce?.key ?? args.idempotencyKey;
  const now = Date.now();

  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_dedupeKey", (q) =>
      q.eq("userId", args.userId).eq("dedupeKey", dedupeKey),
    )
    .take(5);
  if (existing.some((row) => row.sourceKey === args.idempotencyKey)) return null;

  if (!args.debounce) {
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      template: args.template,
      status: "delivered",
      ...content,
      dedupeKey,
      sourceKey: args.idempotencyKey,
      generation: 1,
      createdAt: now,
    });
    await schedulePushForNotification(ctx, args.userId, notificationId, args.template);
    return notificationId;
  }

  const pending = existing.find((row) => row.status === "pending");
  const generation = (pending?.generation ?? 0) + 1;
  let notificationId: Id<"notifications">;
  if (pending) {
    await ctx.db.patch(pending._id, {
      ...content,
      sourceKey: args.idempotencyKey,
      generation,
      createdAt: now,
    });
    notificationId = pending._id;
  } else {
    notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      template: args.template,
      status: "pending",
      ...content,
      dedupeKey,
      sourceKey: args.idempotencyKey,
      generation,
      createdAt: now,
    });
  }
  await ctx.scheduler.runAfter(
    args.debounce.delayMs,
    internal.notifications.deliverPendingNotification,
    { notificationId, generation },
  );
  return notificationId;
}

/** Publish a pending row and drop the older delivered row it supersedes. */
export async function deliverPendingNotification(
  ctx: MutationCtx,
  row: Doc<"notifications">,
) {
  const siblings = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_dedupeKey", (q) =>
      q.eq("userId", row.userId).eq("dedupeKey", row.dedupeKey),
    )
    .take(5);
  for (const sibling of siblings) {
    if (sibling._id !== row._id && sibling.status === "delivered") {
      await ctx.db.delete(sibling._id);
    }
  }
  await ctx.db.patch(row._id, { status: "delivered", createdAt: Date.now() });
  await schedulePushForNotification(ctx, row.userId, row._id, row.template);
}

/** Fan a delivered row out to the user's push devices, unless they muted its push. */
export async function schedulePushForNotification(
  ctx: MutationCtx,
  userId: string,
  notificationId: Id<"notifications">,
  template: Doc<"notifications">["template"],
) {
  if (isConfigurableEmailTemplate(template)) {
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!isTemplateEnabledForChannel(profile, template, "push")) return;
  }
  const device = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (!device) return;
  await ctx.scheduler.runAfter(0, internal.pushDelivery.sendPushForNotification, {
    notificationId,
  });
}

/** Mirror of `cancelPendingDebouncedEmail`: a superseded update never shows. */
export async function cancelPendingInAppNotifications(ctx: MutationCtx, debounceKey: string) {
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", debounceKey))
    .take(10);
  for (const row of rows) {
    if (row.status === "pending") await ctx.db.delete(row._id);
  }
}
