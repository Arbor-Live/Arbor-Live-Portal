import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { formatDateTime } from "@arbor/format";
import {
  getUserId,
  requireAdmin,
  type AuthUser,
} from "./lib/auth";
import {
  CREW_STORAGE_CLOSET_LABEL,
  CREW_STORAGE_CLOSET_MAPS_URL,
  assertTraineeIntroReady,
  type TraineePresenceMode,
} from "./lib/crewTraineeIntro";
import {
  userDisciplineValue,
  userVerticalValue,
  type UserDiscipline,
  type UserVertical,
} from "./lib/userVerticals";
import { ONBOARDING_LEADERSHIP_EMAILS } from "./lib/onboardingLinks";
import {
  crewApplicationsAdminUrl,
  EVENT_TIMEZONE,
  formatEventDateRange,
  SITE_URL,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import {
  markInvitationAccepted,
  scheduleUserInviteEmail,
} from "./email/invitations";
import { buildSingleIcsEventForUserShifts } from "./email/scheduleEmailData";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { ensureOnboardingForOrgMembership } from "./onboarding";
import {
  ensureUserProfileDefaults,
  getAuthRecordId,
  resolveOrCreateOrganization,
  upsertOrgMembership,
} from "./users";

const applicationStatusValue = v.union(
  v.literal("submitted"),
  v.literal("closed"),
  v.literal("trainee"),
  v.literal("converted"),
);

const stanfordPositionValue = v.union(
  v.literal("undergrad"),
  v.literal("coterm"),
  v.literal("masters"),
  v.literal("phd"),
  v.literal("postdoc"),
  v.literal("other"),
);

const crewDisciplineValue = v.union(
  v.literal("Sound"),
  v.literal("Lights"),
  v.literal("Design"),
  v.literal("unsure"),
);

const availabilityDayValue = v.union(v.literal("friday"), v.literal("saturday"));

const presenceModeValue = v.union(
  v.literal("entire_event"),
  v.literal("first_8_hours"),
  v.literal("schedule_block"),
);

function trimRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isStanfordEmail(email: string) {
  return /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i.test(email.trim());
}

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
}

async function listAdminAuthUsers(ctx: QueryCtx | MutationCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: { cursor: null, numItems: 500 },
  });
  const users = (result?.page ?? []) as AuthUser[];
  return users.filter((user) => user.role === "admin" && user.email);
}

async function scheduleApplicationReceivedEmails(
  ctx: MutationCtx,
  args: {
    applicationId: string;
    applicantName: string;
    applicantEmail: string;
    vertical: string;
  },
) {
  const admins = await listAdminAuthUsers(ctx);
  const recipients = new Set<string>();
  for (const admin of admins) {
    if (admin.email) recipients.add(admin.email.trim().toLowerCase());
  }
  for (const email of ONBOARDING_LEADERSHIP_EMAILS) {
    recipients.add(email.toLowerCase());
  }

  const reviewUrl = crewApplicationsAdminUrl();
  for (const to of recipients) {
    await enqueueEmail(ctx, {
      template: "crew_application_received",
      to,
      subject: subjectForTemplate("crew_application_received", args.applicantName),
      idempotencyKey: `crew_application_received:${args.applicationId}:${to}`,
      payload: {
        applicantName: args.applicantName,
        applicantEmail: args.applicantEmail,
        vertical: args.vertical,
        reviewUrl,
      },
    });
  }
}

function defaultVerticalsAndDisciplines(application: {
  vertical: UserVertical;
  discipline?: "Sound" | "Lights" | "Design" | "unsure";
}): { verticals: UserVertical[]; disciplines: UserDiscipline[] } {
  const verticals: UserVertical[] = [application.vertical];
  const disciplines: UserDiscipline[] =
    application.discipline && application.discipline !== "unsure"
      ? [application.discipline]
      : [];
  return { verticals, disciplines };
}

export const submitPublic = mutation({
  args: {
    website: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    heardAboutUs: v.string(),
    vertical: userVerticalValue,
    discipline: v.optional(crewDisciplineValue),
    crewAvailabilityDays: v.optional(v.array(availabilityDayValue)),
    stanfordPosition: stanfordPositionValue,
    gradYear: v.optional(v.number()),
  },
  returns: v.object({ applicationId: v.id("crewApplications") }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      throw new Error("Unable to submit application.");
    }

    const name = trimRequired(args.name, "Name");
    const email = normalizeEmail(args.email);
    const phone = trimRequired(args.phone, "Phone");
    const heardAboutUs = trimRequired(args.heardAboutUs, "How you heard about us");

    if (!isStanfordEmail(email)) {
      throw new Error("Use a @stanford.edu email address.");
    }

    if (args.vertical === "Crew") {
      if (!args.discipline) {
        throw new Error("Select a crew specialty, or “I’m not sure”.");
      }
      const days = [...new Set(args.crewAvailabilityDays ?? [])];
      if (days.length === 0) {
        throw new Error("Select at least one availability day (Friday and/or Saturday).");
      }
    } else if (args.discipline) {
      throw new Error("Specialty applies only when vertical is Crew.");
    }

    if (args.stanfordPosition !== "other") {
      if (args.gradYear === undefined || !Number.isFinite(args.gradYear)) {
        throw new Error("Graduation year is required.");
      }
    }

    await enforceRateLimit(ctx, `crewApply:${email}`, { limit: 3, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "crewApply:global", { limit: 40, windowMs: HOUR_MS });

    const now = Date.now();
    const applicationId = await ctx.db.insert("crewApplications", {
      status: "submitted",
      name,
      email,
      phone,
      heardAboutUs,
      vertical: args.vertical,
      discipline: args.vertical === "Crew" ? args.discipline : undefined,
      crewAvailabilityDays:
        args.vertical === "Crew"
          ? [...new Set(args.crewAvailabilityDays ?? [])]
          : undefined,
      stanfordPosition: args.stanfordPosition,
      gradYear: args.stanfordPosition === "other" ? undefined : args.gradYear,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await scheduleApplicationReceivedEmails(ctx, {
      applicationId,
      applicantName: name,
      applicantEmail: email,
      vertical: args.vertical,
    });

    await enqueueEmail(ctx, {
      template: "crew_application_confirmation",
      to: email,
      subject: subjectForTemplate("crew_application_confirmation", name),
      idempotencyKey: `crew_application_confirmation:${applicationId}`,
      payload: {
        recipientName: name.split(" ")[0] ?? name,
        vertical: args.vertical,
      },
    });

    return { applicationId };
  },
});

export const listAdmin = query({
  args: {
    status: v.optional(applicationStatusValue),
  },
  returns: v.array(
    v.object({
      _id: v.id("crewApplications"),
      status: applicationStatusValue,
      name: v.string(),
      email: v.string(),
      phone: v.string(),
      heardAboutUs: v.string(),
      vertical: userVerticalValue,
      discipline: v.optional(crewDisciplineValue),
      crewAvailabilityDays: v.optional(v.array(availabilityDayValue)),
      stanfordPosition: stanfordPositionValue,
      gradYear: v.optional(v.number()),
      submittedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      convertedUserId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = args.status
      ? await ctx.db
          .query("crewApplications")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .take(200)
      : await ctx.db.query("crewApplications").withIndex("by_submittedAt").order("desc").take(200);

    return rows
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((row) => ({
        _id: row._id,
        status: row.status,
        name: row.name,
        email: row.email,
        phone: row.phone,
        heardAboutUs: row.heardAboutUs,
        vertical: row.vertical,
        discipline: row.discipline,
        crewAvailabilityDays: row.crewAvailabilityDays,
        stanfordPosition: row.stanfordPosition,
        gradYear: row.gradYear,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        convertedUserId: row.convertedUserId,
      }));
  },
});

export const countPendingSubmitted = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("crewApplications")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .take(200);
    return rows.length;
  },
});

export const close = mutation({
  args: { applicationId: v.id("crewApplications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status === "converted") {
      throw new Error("Converted applications cannot be closed.");
    }
    if (application.status === "closed") {
      throw new Error("Application is already closed.");
    }

    const now = Date.now();
    await ctx.db.patch(application._id, {
      status: "closed",
      reviewedAt: now,
      reviewedByUserId: adminId || undefined,
      updatedAt: now,
    });

    await enqueueEmail(ctx, {
      template: "crew_application_closed",
      to: application.email,
      subject: subjectForTemplate("crew_application_closed", application.name),
      idempotencyKey: `crew_application_closed:${application._id}`,
      payload: {
        recipientName: application.name.split(" ")[0] ?? application.name,
      },
    });

    return null;
  },
});

export const remove = mutation({
  args: { applicationId: v.id("crewApplications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");

    const linkedShifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_crewApplicationId", (q) => q.eq("crewApplicationId", args.applicationId))
      .take(1);
    if (linkedShifts.length > 0) {
      throw new Error(
        "This application is still assigned to event shifts. Remove those trainee shifts first.",
      );
    }

    await ctx.db.delete(args.applicationId);
    return null;
  },
});

export const assignTraineeToEvent = mutation({
  args: {
    applicationId: v.id("crewApplications"),
    eventId: v.id("events"),
    presenceMode: presenceModeValue,
    callTime: v.number(),
    scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  returns: v.object({ shiftId: v.id("eventCrewShifts") }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status === "closed" || application.status === "converted") {
      throw new Error("Only submitted or trainee applications can be assigned.");
    }

    const ready = await assertTraineeIntroReady(ctx, {
      eventId: args.eventId,
      callTime: args.callTime,
      presenceMode: args.presenceMode as TraineePresenceMode,
      scheduleBlockId: args.scheduleBlockId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    });

    const now = Date.now();
    const existingShifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_crewApplicationId", (q) => q.eq("crewApplicationId", args.applicationId))
      .take(50);
    const existingForEvent = existingShifts.find((shift) => shift.eventId === args.eventId);

    const hours = hoursBetween(ready.startsAt, ready.endsAt);
    let shiftId: Id<"eventCrewShifts">;
    if (existingForEvent) {
      await ctx.db.patch(existingForEvent._id, {
        scheduleBlockId: ready.scheduleBlockId,
        role: "Trainee",
        personName: application.name,
        userId: undefined,
        crewApplicationId: application._id,
        callTime: ready.callTime,
        startsAt: ready.startsAt,
        endsAt: ready.endsAt,
        hours,
        postedToExpense: false,
        updatedAt: now,
      });
      shiftId = existingForEvent._id;
    } else {
      shiftId = await ctx.db.insert("eventCrewShifts", {
        eventId: args.eventId,
        scheduleBlockId: ready.scheduleBlockId,
        role: "Trainee",
        personName: application.name,
        crewApplicationId: application._id,
        callTime: ready.callTime,
        startsAt: ready.startsAt,
        endsAt: ready.endsAt,
        hours,
        postedToExpense: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(application._id, {
      status: "trainee",
      reviewedAt: now,
      reviewedByUserId: adminId || undefined,
      updatedAt: now,
    });

    const timezone = EVENT_TIMEZONE;
    const callTimeLabel = formatDateTime(ready.callTime, "long", timezone);
    const dateRangeLabel = formatEventDateRange(ready.startAt, ready.endAt, timezone);
    const icsEvents = [
      buildSingleIcsEventForUserShifts({
        eventId: args.eventId,
        userId: `application:${application._id}`,
        eventTitle: ready.eventTitle,
        venueName: ready.venueName,
        shifts: [
          {
            role: "Trainee",
            startsAt: ready.startsAt,
            endsAt: ready.endsAt,
            crewApplicationId: application._id,
          },
        ],
        blockLabelById: new Map(),
        timezone,
      }),
    ];

    const introIdempotencyKey = `crew_trainee_intro:${application._id}:${args.eventId}`;
    const icsIdempotencyKey = `crew_scheduled:application:${application._id}:${args.eventId}:${ready.startsAt}:${ready.endsAt}`;

    await enqueueEmail(ctx, {
      template: "crew_trainee_intro",
      to: application.email,
      subject: subjectForTemplate("crew_trainee_intro", ready.eventTitle),
      eventId: args.eventId,
      idempotencyKey: introIdempotencyKey,
      payload: {
        recipientName: application.name.split(" ")[0] ?? application.name,
        eventTitle: ready.eventTitle,
        dateRangeLabel,
        venueName: ready.venueName,
        venueAddress: ready.venueAddress,
        venueGoogleMapsUrl: ready.venueGoogleMapsUrl,
        storageClosetLabel: CREW_STORAGE_CLOSET_LABEL,
        storageClosetMapsUrl: CREW_STORAGE_CLOSET_MAPS_URL,
        callTimeLabel,
        contacts: ready.contacts.map((contact) => ({
          role: contact.role,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
        })),
        contactsCollapsed: ready.contactsCollapsed,
        arborContactEmail: "arborlive@stanford.edu",
      },
    });

    await enqueueEmail(ctx, {
      template: "crew_scheduled",
      to: application.email,
      subject: subjectForTemplate("crew_scheduled", ready.eventTitle),
      eventId: args.eventId,
      idempotencyKey: icsIdempotencyKey,
      payload: {
        eventTitle: ready.eventTitle,
        venueName: ready.venueName,
        dateRangeLabel,
        eventUrl: `${SITE_URL}/`,
        recipientName: application.name.split(" ")[0] ?? application.name,
        assignmentSummaries: [
          `Trainee • ${formatDateTime(ready.startsAt, "long", timezone)} – ${formatDateTime(ready.endsAt, "timeOnly", timezone)}`,
        ],
        fullScheduleSummaries: [],
        coversEntireEvent: args.presenceMode === "entire_event",
        icsEvents,
        timezone,
      },
    });

    return { shiftId };
  },
});

export const convertToMember = mutation({
  args: {
    applicationId: v.id("crewApplications"),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
  },
  returns: v.object({ invitationId: v.string(), email: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    if (!adminId) throw new Error("Unable to resolve admin user.");

    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status === "converted") {
      throw new Error("Application is already converted.");
    }
    if (application.status === "closed") {
      throw new Error("Closed applications cannot be converted.");
    }

    const defaults = defaultVerticalsAndDisciplines(application);
    const verticals = args.verticals ?? defaults.verticals;
    const disciplines = args.disciplines ?? defaults.disciplines;

    const arborOrg = await resolveOrCreateOrganization(ctx, "Arbor Live");
    const email = normalizeEmail(application.email);
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;

    const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "invitation",
        data: {
          organizationId: arborOrg.id,
          email,
          role: "member",
          status: "pending",
          expiresAt,
          createdAt: now,
          inviterId: adminId,
        },
      },
    })) as { id?: string; _id?: string };

    const invitationId = getAuthRecordId(created);
    const existingUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as AuthUser | null;
    const existingUserId = existingUser ? getUserId(existingUser) : "";

    if (existingUserId) {
      await ensureUserProfileDefaults(ctx, existingUserId, {
        active: true,
        verticals,
        disciplines,
        defaultOrganizationId: arborOrg.id,
      });
      await upsertOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: arborOrg.id,
        role: "member",
        active: true,
      });
      await ensureOnboardingForOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: arborOrg.id,
      });
      await markInvitationAccepted(ctx, invitationId);
    }

    await scheduleUserInviteEmail(ctx, {
      invitationId,
      email,
      organizationId: arborOrg.id,
      role: "member",
      inviterId: adminId,
      expiresAt,
      verticals,
      disciplines,
      isExistingUser: Boolean(existingUserId),
    });

    await ctx.db.patch(application._id, {
      status: "converted",
      reviewedAt: now,
      reviewedByUserId: adminId,
      convertedUserId: existingUserId || undefined,
      updatedAt: now,
    });

    return { invitationId, email };
  },
});
