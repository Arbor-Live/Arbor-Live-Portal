import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { formatDateTime } from "@arbor/format";
import {
  findAuthUsersByIds,
  getUserId,
  listAdminEmailsForVertical,
  requireAdmin,
  requireArborInternalContext,
  type AuthUser,
} from "./lib/auth";
import {
  CREW_STORAGE_CLOSET_LABEL,
  CREW_STORAGE_CLOSET_MAPS_URL,
  assertTraineeIntroReady,
  resolveTraineeEventReadiness,
  type TraineePresenceMode,
} from "./lib/crewTraineeIntro";
import {
  DISCIPLINES_BY_VERTICAL,
  assertDisciplinesMatchVerticals,
  userDisciplineValue,
  userVerticalValue,
  type UserDiscipline,
  type UserVertical,
} from "./lib/userVerticals";
import {
  crewApplicationsAdminUrl,
  EVENT_TIMEZONE,
  formatEventDateRange,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import { bumpInviteSequence } from "./email/inviteSequence";
import {
  markInvitationAccepted,
  scheduleUserInviteEmail,
} from "./email/invitations";
import { scheduleCrewScheduledEmails } from "./email/triggers";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { ensureOnboardingForOrgMembership } from "./onboarding";
import { upsertUserCompensationRate } from "./lib/crewCompensation";
import { loadTrainingEndsAt } from "./lib/crewTraineeTraining";
import { clearUserBan } from "./lib/userAccess";
import {
  ensureUserProfileDefaults,
  getAuthRecordId,
  resolveOrCreateOrganization,
  syncGlobalRoleFromMemberships,
  upsertOrgMembership,
} from "./users";
import { appError, withReportableErrors } from "./lib/errors";

const applicationStatusValue = v.union(
  v.literal("submitted"),
  v.literal("closed"),
  v.literal("trainee"),
  v.literal("converted"),
);

const outreachStageValue = v.union(
  v.literal("contacted"),
  v.literal("meeting_booked"),
  v.literal("met"),
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
  v.literal("Photography"),
  v.literal("Videography"),
  v.literal("unsure"),
);

type CrewApplicationDiscipline = UserDiscipline | "unsure";

/** Verticals whose applicants pick a specialty. */
function verticalRequiresDiscipline(vertical: UserVertical): boolean {
  return DISCIPLINES_BY_VERTICAL[vertical].length > 0;
}

const availabilityDayValue = v.union(v.literal("friday"), v.literal("saturday"));

const presenceModeValue = v.union(
  v.literal("entire_event"),
  v.literal("first_8_hours"),
  v.literal("schedule_block"),
);

/**
 * Arbor staff only. The admin role alone has been shared by band/DJ org admins
 * (see `requireAdmin`), so pair it with the Arbor-internal context, as venues do.
 */
async function requireStaffAdmin(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const admin = await requireAdmin(ctx);
  await requireArborInternalContext(ctx);
  return admin;
}

function trimRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) appError("APPLICATION_FIELD_REQUIRED", `${label} is required.`);
  return trimmed;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isStanfordEmail(email: string) {
  return /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i.test(email.trim());
}

function authUserDisplayName(
  userByKey: Map<string, { name?: string | null; email?: string | null }>,
  userId: string | undefined,
) {
  if (!userId) return undefined;
  const user = userByKey.get(userId);
  if (!user) return undefined;
  return user.name?.trim() || user.email?.trim() || undefined;
}

function hoursBetween(start: number, end: number) {
  return Number(((end - start) / 3_600_000).toFixed(2));
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
  const recipients = await listAdminEmailsForVertical(ctx, "Crew");
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
  discipline?: CrewApplicationDiscipline;
}): { verticals: UserVertical[]; disciplines: UserDiscipline[] } {
  const verticals: UserVertical[] = [application.vertical];
  const allowed = DISCIPLINES_BY_VERTICAL[application.vertical] as readonly string[];
  const disciplines: UserDiscipline[] =
    application.discipline &&
    application.discipline !== "unsure" &&
    allowed.includes(application.discipline)
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
    experience: v.string(),
    vertical: userVerticalValue,
    discipline: v.optional(crewDisciplineValue),
    crewAvailabilityDays: v.optional(v.array(availabilityDayValue)),
    stanfordPosition: stanfordPositionValue,
    gradYear: v.optional(v.number()),
  },
  returns: v.object({ applicationId: v.id("crewApplications") }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      appError("APPLICATION_SUBMIT_BLOCKED", "Unable to submit application.");
    }

    const name = trimRequired(args.name, "Name");
    const email = normalizeEmail(args.email);
    const phone = trimRequired(args.phone, "Phone");
    const heardAboutUs = trimRequired(args.heardAboutUs, "How you heard about us");
    const experience = trimRequired(args.experience, "What excites you about joining");

    if (!isStanfordEmail(email)) {
      appError("APPLICATION_STANFORD_EMAIL", "Use a @stanford.edu email address.");
    }

    const specialtyRequired = verticalRequiresDiscipline(args.vertical);
    if (specialtyRequired) {
      if (!args.discipline) {
        appError("CREW_SPECIALTY_REQUIRED", "Select a specialty, or “I’m not sure”.");
      }
      const allowed = DISCIPLINES_BY_VERTICAL[args.vertical] as readonly string[];
      if (args.discipline !== "unsure" && !allowed.includes(args.discipline)) {
        appError(
          "CREW_SPECIALTY_NOT_ALLOWED",
          `Specialty ${args.discipline} is not available for ${args.vertical}.`,
        );
      }
    } else if (args.discipline) {
      appError(
        "CREW_SPECIALTY_NOT_APPLICABLE",
        "Specialty applies only when the vertical has specialties.",
      );
    }

    if (args.vertical === "Crew") {
      const days = [...new Set(args.crewAvailabilityDays ?? [])];
      if (days.length === 0) {
        appError(
          "CREW_AVAILABILITY_REQUIRED",
          "Select at least one availability day (Friday and/or Saturday).",
        );
      }
    }

    if (args.stanfordPosition !== "other") {
      if (args.gradYear === undefined || !Number.isFinite(args.gradYear)) {
        appError("CREW_GRAD_YEAR_REQUIRED", "Graduation year is required.");
      }
    }

    // The limiter stays outside the reportable wrapper: a throttled caller is
    // not an incident. Validation above it runs first so form errors never
    // burn the submitter's small hourly cap.
    await enforceRateLimit(ctx, `crewApply:${email}`, { limit: 3, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "crewApply:global", { limit: 40, windowMs: HOUR_MS });

    return await withReportableErrors("crewApplications.submitPublic", async () => {
    const now = Date.now();
    const applicationId = await ctx.db.insert("crewApplications", {
      status: "submitted",
      name,
      email,
      phone,
      heardAboutUs,
      experience,
      vertical: args.vertical,
      discipline: specialtyRequired ? args.discipline : undefined,
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
    });
  },
});

export const listAdmin = query({
  args: {
    /** Statuses to include; omit for all of them. */
    statuses: v.optional(v.array(applicationStatusValue)),
  },
  returns: v.array(
    v.object({
      _id: v.id("crewApplications"),
      status: applicationStatusValue,
      name: v.string(),
      email: v.string(),
      phone: v.string(),
      heardAboutUs: v.string(),
      experience: v.optional(v.string()),
      vertical: userVerticalValue,
      discipline: v.optional(crewDisciplineValue),
      crewAvailabilityDays: v.optional(v.array(availabilityDayValue)),
      stanfordPosition: stanfordPositionValue,
      gradYear: v.optional(v.number()),
      submittedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      convertedUserId: v.optional(v.string()),
      assigneeUserId: v.optional(v.string()),
      assigneeName: v.optional(v.string()),
      outreachStage: v.optional(outreachStageValue),
      outreachUpdatedAt: v.optional(v.number()),
      outreachUpdatedByName: v.optional(v.string()),
      /** Trainees only: when their last training shift ends ("Decision needed" after that). */
      trainingEndsAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStaffAdmin(ctx);
    // Read each status off its own index so a busy status (hundreds of closed
    // applications) never pushes the newest submitted ones past the cap.
    const statuses = args.statuses
      ? [...new Set(args.statuses)]
      : (["submitted", "trainee", "converted", "closed"] as const);
    const rows = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("crewApplications")
            .withIndex("by_status_and_submittedAt", (q) => q.eq("status", status))
            .order("desc")
            .take(200),
        ),
      )
    )
      .flat()
      .sort((a, b) => b.submittedAt - a.submittedAt);

    const userIds = rows.flatMap((row) =>
      [row.assigneeUserId, row.outreachUpdatedByUserId].filter((id): id is string => Boolean(id)),
    );
    const userByKey = await findAuthUsersByIds(ctx, userIds);
    const trainingEndsAtById = new Map(
      await Promise.all(
        rows
          .filter((row) => row.status === "trainee")
          .map(async (row) => [row._id, await loadTrainingEndsAt(ctx, row._id)] as const),
      ),
    );

    return rows
      .map((row) => ({
        _id: row._id,
        status: row.status,
        name: row.name,
        email: row.email,
        phone: row.phone,
        heardAboutUs: row.heardAboutUs,
        experience: row.experience,
        vertical: row.vertical,
        discipline: row.discipline,
        crewAvailabilityDays: row.crewAvailabilityDays,
        stanfordPosition: row.stanfordPosition,
        gradYear: row.gradYear,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        convertedUserId: row.convertedUserId,
        assigneeUserId: row.assigneeUserId,
        assigneeName: authUserDisplayName(userByKey, row.assigneeUserId),
        outreachStage: row.outreachStage,
        outreachUpdatedAt: row.outreachUpdatedAt,
        outreachUpdatedByName: authUserDisplayName(userByKey, row.outreachUpdatedByUserId),
        trainingEndsAt: trainingEndsAtById.get(row._id),
      }));
  },
});

export const setAssignee = mutation({
  args: {
    applicationId: v.id("crewApplications"),
    assigneeUserId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireStaffAdmin(ctx);
    return await withReportableErrors("crewApplications.setAssignee", async () => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");
    const assigneeUserId = args.assigneeUserId?.trim() || undefined;
    if (assigneeUserId) {
      const users = await findAuthUsersByIds(ctx, [assigneeUserId]);
      if (!users.has(assigneeUserId)) appError("CREW_ASSIGNEE_NOT_FOUND", "Owner not found.");
    }
    await ctx.db.patch(application._id, { assigneeUserId, updatedAt: Date.now() });
    return null;
    });
  },
});

/**
 * Move a submitted application along the outreach steps (or back to "not
 * contacted" with no stage). Whoever reaches out first becomes the owner, so
 * other admins can see the applicant is already being handled.
 */
export const setOutreachStage = mutation({
  args: {
    applicationId: v.id("crewApplications"),
    stage: v.optional(outreachStageValue),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireStaffAdmin(ctx);
    return await withReportableErrors("crewApplications.setOutreachStage", async () => {
    const adminId = getUserId(admin) || undefined;
    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");
    if (application.status !== "submitted") {
      appError(
        "CREW_OUTREACH_REQUIRES_SUBMITTED",
        "Outreach applies only to submitted applications.",
      );
    }
    const now = Date.now();
    await ctx.db.patch(application._id, {
      outreachStage: args.stage,
      outreachUpdatedAt: args.stage ? now : undefined,
      outreachUpdatedByUserId: args.stage ? adminId : undefined,
      assigneeUserId: application.assigneeUserId ?? (args.stage ? adminId : undefined),
      updatedAt: now,
    });
    return null;
    });
  },
});

export const countPendingSubmitted = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireStaffAdmin(ctx);
    const rows = await ctx.db
      .query("crewApplications")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .take(200);
    return rows.filter((row) => !row.outreachStage).length;
  },
});

export const close = mutation({
  args: { applicationId: v.id("crewApplications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireStaffAdmin(ctx);
    return await withReportableErrors("crewApplications.close", async () => {
    const adminId = getUserId(admin);
    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");
    if (application.status === "converted") {
      appError("CREW_CLOSE_REQUIRES_UNCONVERTED", "Converted applications cannot be closed.");
    }
    if (application.status === "closed") {
      appError("CREW_APPLICATION_CLOSED", "Application is already closed.");
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
    });
  },
});

export const remove = mutation({
  args: { applicationId: v.id("crewApplications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireStaffAdmin(ctx);
    return await withReportableErrors("crewApplications.remove", async () => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");

    const linkedShifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_crewApplicationId", (q) => q.eq("crewApplicationId", args.applicationId))
      .take(1);
    if (linkedShifts.length > 0) {
      appError(
        "CREW_APPLICATION_HAS_SHIFTS",
        "This application is still assigned to event shifts. Remove those trainee shifts first.",
      );
    }

    await ctx.db.delete(args.applicationId);
    return null;
    });
  },
});

const traineeContactStatusValue = v.object({
  userId: v.string(),
  name: v.optional(v.string()),
  missing: v.array(v.union(v.literal("user"), v.literal("name"), v.literal("email"), v.literal("phone"))),
});

/**
 * The early warning for "Assign as trainee": what the picked event still
 * needs (a saved venue with an address, a reachable event lead or manager)
 * before the intro email can go out. Same checks the assign mutation enforces.
 */
export const traineeEventReadiness = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      eventTitle: v.string(),
      venue: v.object({
        venueId: v.optional(v.id("venues")),
        venueName: v.optional(v.string()),
        address: v.optional(v.string()),
        googleMapsUrl: v.optional(v.string()),
      }),
      eventManager: v.optional(traineeContactStatusValue),
      dayOfLead: v.optional(traineeContactStatusValue),
      eventMissing: v.array(v.string()),
      missing: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStaffAdmin(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const readiness = await resolveTraineeEventReadiness(ctx, event);
    const contactStatus = (status: typeof readiness.eventManager) =>
      status ? { userId: status.userId, name: status.name, missing: status.missing } : undefined;
    return {
      eventTitle: event.title,
      venue: readiness.venue,
      eventManager: contactStatus(readiness.eventManager),
      dayOfLead: contactStatus(readiness.dayOfLead),
      eventMissing: readiness.eventMissing,
      missing: readiness.missing,
    };
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
    const admin = await requireStaffAdmin(ctx);
    return await withReportableErrors("crewApplications.assignTraineeToEvent", async () => {
    const adminId = getUserId(admin);
    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");
    if (application.status === "closed" || application.status === "converted") {
      appError(
        "CREW_ASSIGN_REQUIRES_OPEN",
        "Only submitted or trainee applications can be assigned.",
      );
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
    const introIdempotencyKey = `crew_trainee_intro:${application._id}:${args.eventId}`;

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

    // The calendar invite goes through the crew diff like any other shift
    // change, so moving the trainee to another block cancels the old invite.
    // Diff all of the trainee's shifts on this event (they may share a run),
    // with only the edited one changed.
    const previousForEvent = existingShifts.filter((shift) => shift.eventId === args.eventId);
    const assignedShift = {
      scheduleBlockId: ready.scheduleBlockId,
      role: "Trainee",
      startsAt: ready.startsAt,
      endsAt: ready.endsAt,
      crewApplicationId: application._id,
    };
    await scheduleCrewScheduledEmails(
      ctx,
      args.eventId,
      previousForEvent,
      [
        ...previousForEvent.filter((shift) => shift._id !== existingForEvent?._id),
        assignedShift,
      ],
      await bumpInviteSequence(ctx, args.eventId),
    );

    return { shiftId };
    });
  },
});

export const convertToMember = mutation({
  args: {
    applicationId: v.id("crewApplications"),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
    rateMode: v.union(v.literal("normal"), v.literal("lead"), v.literal("custom")),
    customHourlyRateUsd: v.optional(v.number()),
    payrollMethod: v.union(v.literal("stanford"), v.literal("external")),
  },
  returns: v.object({ invitationId: v.string(), email: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireStaffAdmin(ctx);
    const adminId = getUserId(admin);

    const application = await ctx.db.get(args.applicationId);
    if (!application) appError("APPLICATION_NOT_FOUND", "Application not found.");
    if (application.status === "converted") {
      appError("CREW_APPLICATION_CONVERTED", "Application is already converted.");
    }
    if (application.status === "closed") {
      appError("CREW_CONVERT_REQUIRES_OPEN", "Closed applications cannot be converted.");
    }
    if (args.rateMode === "custom") {
      if (args.customHourlyRateUsd === undefined || args.customHourlyRateUsd < 0) {
        appError("CREW_CUSTOM_RATE_REQUIRED", "Custom hourly rate is required.");
      }
    }

    const defaults = defaultVerticalsAndDisciplines(application);
    const verticals = args.verticals ?? defaults.verticals;
    const disciplines = args.disciplines ?? defaults.disciplines;
    // `assertDisciplinesMatchVerticals` is shared with users.ts and keeps its
    // plain Error, so it runs before the reportable wrapper: a bad pick stays
    // a client error instead of an unexpected failure.
    assertDisciplinesMatchVerticals(verticals, disciplines);

    return await withReportableErrors("crewApplications.convertToMember", async () => {
    if (!adminId) throw new Error("Unable to resolve admin user.");

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
        status: "active",
        verticals,
        disciplines,
        defaultOrganizationId: arborOrg.id,
        payrollMethod: args.payrollMethod,
        gradYear: application.gradYear,
        stanfordPosition: application.stanfordPosition,
      });
      await clearUserBan(ctx, existingUserId);
      // Joining crew never demotes: an active Arbor role (an admin applying
      // as crew) is kept.
      const existingArborMembership = await ctx.db
        .query("userOrganizationMemberships")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", existingUserId).eq("organizationId", arborOrg.id),
        )
        .unique();
      await upsertOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: arborOrg.id,
        // An inactive membership's old role is not restored: reactivating
        // a removed admin through a crew application would re-grant admin.
        role: existingArborMembership?.active ? existingArborMembership.role : "member",
        active: true,
      });
      await syncGlobalRoleFromMemberships(ctx, existingUserId);
      await upsertUserCompensationRate(ctx, {
        userId: existingUserId,
        rateMode: args.rateMode,
        hourlyRateUsd: args.rateMode === "custom" ? args.customHourlyRateUsd : 0,
        updatedByUserId: adminId,
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
      rateMode: args.rateMode,
      customHourlyRateUsd: args.customHourlyRateUsd,
      payrollMethod: args.payrollMethod,
      gradYear: application.gradYear,
      stanfordPosition: application.stanfordPosition,
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
    });
  },
});
