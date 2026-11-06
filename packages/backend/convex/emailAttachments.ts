import { v } from "convex/values";
import { formatDate } from "@arbor/format";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { inventoryR2 } from "./inventoryR2";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  parseResendAttachment,
  pickAttachmentByFilename,
  RESEND_RECEIVING_URL,
  type ResendAttachment,
} from "./lib/emailAttachments";
import { findThreadForBooking, resolveBookingRefs } from "./lib/emailThreads";
import { appError } from "./lib/errors";
import { requireEventEditAccess } from "./lib/eventAccess";
import {
  buildEventArtifactObjectKey,
  formatStoredR2Asset,
  validateEventArtifactUploadRequest,
} from "./lib/inventoryUpload";
import { releaseR2KeysIfUnreferenced } from "./lib/r2Lifecycle";

/** Files read per event; the event page's own file list uses the same bound. */
const EVENT_ARTIFACT_SCAN_LIMIT = 500;

const addResultValue = v.object({
  status: v.union(v.literal("added"), v.literal("already_added")),
  artifactId: v.id("eventArtifacts"),
});

async function findArtifactFromAttachment(
  ctx: QueryCtx,
  eventId: Id<"events">,
  messageId: Id<"emailMessages">,
  index: number,
): Promise<Doc<"eventArtifacts"> | null> {
  const artifacts = await ctx.db
    .query("eventArtifacts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(EVENT_ARTIFACT_SCAN_LIMIT);
  return (
    artifacts.find(
      (artifact) =>
        artifact.sourceEmailAttachment?.messageId === messageId &&
        artifact.sourceEmailAttachment.index === index,
    ) ?? null
  );
}

/** Runs as the caller (`ctx.runQuery` from the action), so it is the staff gate too. */
export const loadAttachmentForEvent = internalQuery({
  args: { eventId: v.id("events"), messageId: v.id("emailMessages"), index: v.number() },
  returns: v.object({
    resendEmailId: v.string(),
    attachment: v.object({
      filename: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      resendAttachmentId: v.optional(v.string()),
    }),
    /** Every stored attachment name, to tell same-named files apart. */
    filenames: v.array(v.string()),
    existingArtifactId: v.union(v.id("eventArtifacts"), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    await requireEventEditAccess(ctx, args.eventId);

    const message = await ctx.db.get(args.messageId);
    const thread = await findThreadForBooking(
      ctx,
      await resolveBookingRefs(ctx, { eventId: args.eventId }),
    );
    if (
      !message ||
      message.direction !== "inbound" ||
      !message.threadId ||
      message.threadId !== thread?._id
    ) {
      appError("EMAIL_ATTACHMENT_NOT_FOUND", "That email is not on this event's booking thread.");
    }
    const attachment = message.attachments[args.index];
    if (!attachment) appError("EMAIL_ATTACHMENT_NOT_FOUND", "That attachment no longer exists.");

    const existing = await findArtifactFromAttachment(ctx, args.eventId, args.messageId, args.index);
    return {
      resendEmailId: message.resendEmailId,
      attachment,
      filenames: message.attachments.map((entry) => entry.filename),
      existingArtifactId: existing?._id ?? null,
    };
  },
});

function unavailable(): never {
  return appError(
    "EMAIL_ATTACHMENT_UNAVAILABLE",
    "This attachment is no longer available from the mail provider.",
  );
}

async function resendGet(path: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`${RESEND_RECEIVING_URL}/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.status === 404) unavailable();
  if (!response.ok) {
    console.error(`[emailAttachments] Resend ${path} answered ${response.status}`);
    appError("EMAIL_ATTACHMENT_FETCH_FAILED", "Could not reach the mail provider. Try again.");
  }
  return await response.json();
}

async function resolveDownloadTarget(
  apiKey: string,
  loaded: { resendEmailId: string; attachment: { resendAttachmentId?: string }; filenames: string[] },
  index: number,
): Promise<ResendAttachment> {
  const emailPath = encodeURIComponent(loaded.resendEmailId);
  if (loaded.attachment.resendAttachmentId) {
    const single = parseResendAttachment(
      await resendGet(
        `${emailPath}/attachments/${encodeURIComponent(loaded.attachment.resendAttachmentId)}`,
        apiKey,
      ),
    );
    if (!single) unavailable();
    return single;
  }
  const list = (await resendGet(`${emailPath}/attachments?limit=100`, apiKey)) as {
    data?: unknown;
  };
  const listed = (Array.isArray(list.data) ? list.data : []).flatMap(
    (entry) => parseResendAttachment(entry) ?? [],
  );
  const picked = pickAttachmentByFilename(
    listed,
    loaded.filenames.map((filename) => ({ filename })),
    index,
  );
  if (!picked) unavailable();
  return picked;
}

/**
 * Copy one attachment of a client's email into the event's files. Safe to
 * repeat: an attachment already copied answers `already_added`.
 */
export const addToEventFiles = action({
  args: { eventId: v.id("events"), messageId: v.id("emailMessages"), index: v.number() },
  returns: addResultValue,
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "added" | "already_added"; artifactId: Id<"eventArtifacts"> }> => {
    const loaded = await ctx.runQuery(internal.emailAttachments.loadAttachmentForEvent, args);
    if (loaded.existingArtifactId) {
      return { status: "already_added", artifactId: loaded.existingArtifactId };
    }

    const { attachment } = loaded;
    if (attachment.size !== undefined) {
      validateEventArtifactUploadRequest({
        fileName: attachment.filename,
        contentType: attachment.contentType ?? "",
        contentLength: attachment.size,
      });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) appError("EMAIL_ATTACHMENT_FETCH_FAILED", "Email is not configured on this deployment.");

    const target = await resolveDownloadTarget(apiKey, loaded, args.index);
    const download = await fetch(target.downloadUrl);
    if (download.status === 404 || download.status === 403 || download.status === 410) {
      unavailable();
    }
    if (!download.ok) {
      console.error(`[emailAttachments] download answered ${download.status}`);
      appError("EMAIL_ATTACHMENT_FETCH_FAILED", "Could not download the attachment. Try again.");
    }
    const bytes = new Uint8Array(await download.arrayBuffer());

    const contentType = target.contentType ?? attachment.contentType ?? "application/octet-stream";
    validateEventArtifactUploadRequest({
      fileName: attachment.filename,
      contentType,
      contentLength: bytes.byteLength,
    });
    const key = buildEventArtifactObjectKey({
      eventId: args.eventId,
      fileName: attachment.filename,
      uploadId: crypto.randomUUID(),
    });
    await inventoryR2.store(ctx, bytes, { key, type: contentType });
    await inventoryR2.syncMetadata(ctx, key);

    return await ctx.runMutation(internal.emailAttachments.recordAttachmentArtifact, {
      eventId: args.eventId,
      messageId: args.messageId,
      index: args.index,
      key,
    });
  },
});

/** Re-checks for the artifact the action looked for first, since a second click may have won the race. */
export const recordAttachmentArtifact = internalMutation({
  args: {
    eventId: v.id("events"),
    messageId: v.id("emailMessages"),
    index: v.number(),
    key: v.string(),
  },
  returns: addResultValue,
  handler: async (ctx, args) => {
    const existing = await findArtifactFromAttachment(ctx, args.eventId, args.messageId, args.index);
    if (existing) {
      await releaseR2KeysIfUnreferenced(ctx, [args.key]);
      return { status: "already_added" as const, artifactId: existing._id };
    }

    const message = await ctx.db.get(args.messageId);
    const attachment = message?.attachments[args.index];
    if (!message || !attachment) {
      await releaseR2KeysIfUnreferenced(ctx, [args.key]);
      appError("EMAIL_ATTACHMENT_NOT_FOUND", "That attachment no longer exists.");
    }
    const now = Date.now();
    const artifactId = await ctx.db.insert("eventArtifacts", {
      eventId: args.eventId,
      artifactType: "document",
      title: attachment.filename,
      markdown: `Emailed by ${message.fromName?.trim() || message.fromEmail} on ${formatDate(message.receivedAt)}`,
      linkUrl: formatStoredR2Asset(args.key),
      sourceEmailAttachment: { messageId: args.messageId, index: args.index },
      version: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { status: "added" as const, artifactId };
  },
});
