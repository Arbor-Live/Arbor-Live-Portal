import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listAdminEmailsForVertical } from "../lib/auth";
import { resolveBandName } from "../lib/bandIdentity";
import { ARTIST_NEED_TYPE_LABELS } from "../lib/eventArtistNeeds";
import {
  EVENT_TIMEZONE,
  eventArtistsUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

/** Notify Operations admins that an artist wants to perform at an event. */
export async function scheduleArtistNeedInquiryEmail(
  ctx: MutationCtx,
  args: {
    need: Doc<"eventArtistNeeds">;
    event: Doc<"events">;
    organizationId: string;
    message?: string;
    /** Unique per submission so re-inquiries are not deduped away. */
    submissionId: string;
  },
) {
  const artistName = await resolveBandName(ctx, args.organizationId);
  const dateRangeLabel = formatEventDateRange(
    args.event.startAt,
    args.event.endAt,
    args.event.timezone || EVENT_TIMEZONE,
  );
  const subject = subjectForTemplate("artist_need_inquiry", args.event.title);
  const reviewUrl = eventArtistsUrl(String(args.event._id));

  for (const to of await listAdminEmailsForVertical(ctx, "Operations")) {
    await enqueueEmail(ctx, {
      template: "artist_need_inquiry",
      to,
      subject,
      eventId: args.event._id,
      idempotencyKey: `artist_need_inquiry:${args.need._id}:${args.organizationId}:${args.submissionId}:${to}`,
      payload: {
        artistName,
        eventTitle: args.event.title,
        dateRangeLabel,
        venueName: args.event.venueName,
        artistTypeLabel: ARTIST_NEED_TYPE_LABELS[args.need.artistType],
        genres: args.need.genres,
        message: args.message,
        reviewUrl,
      },
    });
  }
}
