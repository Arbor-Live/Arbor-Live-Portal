import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * batchImport is a mutation that takes an array of orgs and either 
 * updates existing records in the database or inserts new ones. It checks 
 * for existing records based on the displayName field and updates them if 
 * found, otherwise it creates a new record with a unique organizationId. The 
 * function returns a status message and the count of processed orgs.
 * 
 * the frontend org-csv-importer.tsx file will call this function and pass 
 * in the cleaned and formatted array of orgs to be imported. The backend does 
 * NOT do any data cleaning or formatting, it just takes the array and processes it as is. 
 */
export const batchImport = mutation({
  // The 'args' block defines the format that the frontend MUST provide
  args: {
    organizations: v.array(
      /**
        * all fields other than name are optional from the perspective of 
        * the database so it doesnt crash or prevent updates if one band is 
        * wrong/incomplete. will enforce the required fields on the client 
        * side before being able to submit an org that way i dont have to deal 
        * with tracking people down or begging for tech riders :(.
        *
        * the v.object is essentially all the data from the notion org database
        *
        * bands are considered orgs and so are individual djs
        */
      v.object({
        displayName: v.string(),
        orgCreationTime: v.optional(v.number()),//will reformat from strings to 
        //numbers in the front end
        numShowsRan: v.optional(v.number()),
        demoURL: v.optional(v.string()),
        genres: v.optional(v.array(v.string())),
        mainContactName: v.optional(v.string()),
        mainContactEmail: v.optional(v.string()),
        mainContactPhone: v.optional(v.string()),
        performerHourlyRateUsd: v.optional(v.number()),
        techRiderURL: v.optional(v.string()),
        status: v.optional(v.string()), //e.g. active, disbanded, inactive, unknown
        bandMembers: v.optional(v.array(v.string())), //list of names of band members but not necessarily auth users of the website
        oneLiner: v.optional(v.string()),
        //might need to do a .toLowerCase() on this field to make sure it is consistent with the other orgs in the database
        organizationType: v.optional(
          v.union(v.literal("arbor_internal"), v.literal("band"), v.literal("dj"))),
      })
    )
  },

  handler: async (ctx, args) => {
    const now = Date.now();  //server sets the update time

    for (const org of args.organizations) {

      //check if org already exists and just needs to update fields 
      const existing = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_displayName", (q) => q.eq("displayName", org.displayName))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { //patch just updates
          /**
           * the ellipses act as a "spread" function that means we map each field 
           * defined in the v.object to an entry in the database. we are essentially 
           * getting each org and splitting it into these groups 
           */
          ...org,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("organizationProfiles", {
          ...org,
          organizationId: crypto.randomUUID(),
          organizationType: org.organizationType ?? "band", //make it a band by default
          updatedAt: now,
        });
      }

    }
    return { importorgDatabaseStatus: "success", count: args.organizations.length };
  },
});
