import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Local scratch helper. Brings an event to a clean two-band state:
 *   • one default rider on the FIRST org (the small one), 1 input
 *   • a NEW artist org with a headliner rider big enough to spill onto a
 *     second snake (17 ports), for exercising console loss warnings.
 * Removes the duplicate participations earlier runs created.
 */
export const seedTwoBands = mutation({
  args: {
    eventId: v.id("events"),
    smallOrganizationId: v.string(),
    bigOrganizationId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Drop every existing participation on the event.
    const existing = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    for (const row of existing) await ctx.db.delete(row._id);

    // Re-add one participation per org, small act first (support).
    await ctx.db.insert("eventBandParticipations", {
      eventId: args.eventId,
      organizationId: args.smallOrganizationId,
      role: "support",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventBandParticipations", {
      eventId: args.eventId,
      organizationId: args.bigOrganizationId,
      role: "headliner",
      createdAt: now,
      updatedAt: now,
    });

    // The small org keeps a single-input default rider from the original seed;
    // clear the big rider an earlier run may have left on it.
    const smallRiders = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.smallOrganizationId),
      )
      .take(50);
    for (const rider of smallRiders) await ctx.db.delete(rider._id);
    await ctx.db.insert("bandRiders", {
      organizationId: args.smallOrganizationId,
      name: "Small Band Rider",
      status: "published",
      isDefault: true,
      stage: { widthFt: 24, depthFt: 12 },
      items: [],
      inputs: [
        {
          id: `seed-small-${now}`,
          channel: 1,
          source: "Lead Vocal",
          sourceKey: "vox.lead",
          inputType: "mic" as const,
          stand: "tall_boom" as const,
          phantom: false,
          stereo: false,
          providedBy: "arbor" as const,
        },
      ],
      monitorMixes: [],
      backline: [],
      performerCount: 1,
      setLengthMinutes: 45,
      createdByUserId: "seed",
      updatedByUserId: "seed",
      createdAt: now,
      updatedAt: now,
    });

    // A profile so the big org gets a name in the UI.
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.bigOrganizationId),
      )
      .unique();
    if (!profile) {
      await ctx.db.insert("organizationProfiles", {
        organizationId: args.bigOrganizationId,
        displayName: "E2E Big Band",
        organizationType: "band",
        updatedAt: now,
      });
    }

    // Clear any riders the earlier runs left on the big org, then write one.
    const oldRiders = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.bigOrganizationId),
      )
      .take(50);
    for (const rider of oldRiders) await ctx.db.delete(rider._id);

    // 4 vox + 2 gtr + bass + 2 horns + keys ST + kick + snare + 2 toms + OH ST
    // = 17 ports, one past a single 16-port snake.
    // 20 ports: past a single 16-port snake, so the allocator opens Snake B.
    const spec: Array<[number, string, string]> = [
      [1, "Vox 1", "vox.lead"],
      [2, "Vox 2", "vox.bgv"],
      [3, "Vox 3", "vox.bgv"],
      [4, "Vox 4", "vox.choir"],
      [5, "Gtr 1", "gtr"],
      [6, "Gtr 2", "gtr"],
      [7, "Gtr 3", "gtr"],
      [8, "Bass", "bass"],
      [9, "Bass 2", "bass.synth"],
      [10, "Sax", "wind.sax.tenor"],
      [11, "Trumpet", "wind.trumpet"],
      [12, "Trombone", "wind.trombone"],
      [13, "Keys", "keys"],
      [14, "Piano", "keys.piano"],
      [15, "Kick", "drum.kick"],
      [16, "Snare", "drum.snare.top"],
      [17, "Rack Tom", "drum.tom.rack"],
      [18, "Floor Tom", "drum.tom.rack"],
      [19, "OH", "drum.oh"],
      [20, "Perc", "perc.aux"],
    ];
    const stereo = new Set([13, 14, 19]);
    const di = new Set([5, 6, 7, 8, 9, 13, 14]);

    const riderId = await ctx.db.insert("bandRiders", {
      organizationId: args.bigOrganizationId,
      name: "Big Band Rider",
      status: "published",
      isDefault: true,
      stage: { widthFt: 32, depthFt: 16 },
      items: [],
      inputs: spec.map(([channel, source, sourceKey], index) => ({
        id: `seed-in-${now}-${index}`,
        channel,
        source,
        sourceKey,
        inputType: di.has(channel) ? ("di" as const) : ("mic" as const),
        stand: "tall_boom" as const,
        phantom: channel === 15,
        stereo: stereo.has(channel),
        providedBy: "arbor" as const,
      })),
      monitorMixes: [],
      backline: [],
      performerCount: spec.length,
      setLengthMinutes: 60,
      createdByUserId: "seed",
      updatedByUserId: "seed",
      createdAt: now,
      updatedAt: now,
    });

    return riderId;
  },
});
