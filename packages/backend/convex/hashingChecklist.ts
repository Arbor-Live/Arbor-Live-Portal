import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, requireAdminOrOperations } from "./lib/auth";
import { appError } from "./lib/errors";
import { checklistProblems } from "./lib/hashing";
import { HASHING_CHECKLIST_SEED } from "./lib/hashingChecklistSeed";
import { ensureChecklist, latestChecklist } from "./lib/hashingData";
import { checklistTreeFields, checklistTreeValue } from "./lib/hashingValues";

export const getCurrent = query({
  args: {},
  returns: v.object({ version: v.number(), tree: checklistTreeValue }),
  handler: async (ctx) => {
    await requireAdminOrOperations(ctx);
    const latest = await latestChecklist(ctx);
    if (!latest) return { version: 1, tree: HASHING_CHECKLIST_SEED };
    return { version: latest.version, tree: { kits: latest.kits, areas: latest.areas } };
  },
});

/** Versions are immutable: the next hash started picks this up, running ones keep theirs. */
export const publish = mutation({
  args: { baseVersion: v.number(), ...checklistTreeFields },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireAdminOrOperations(ctx);
    const { baseVersion, ...tree } = args;
    const problems = checklistProblems(tree);
    if (problems.length > 0) appError("HASH_CHECKLIST_INVALID", problems.join(" "));
    const latest = await ensureChecklist(ctx);
    if (latest.version !== baseVersion) {
      appError("HASH_CHECKLIST_STALE", `Someone published version ${latest.version} first. Reload and redo your edits.`);
    }
    const version = latest.version + 1;
    await ctx.db.insert("hashChecklistVersions", {
      version,
      ...tree,
      publishedAt: Date.now(),
      publishedBy: getUserId(user),
    });
    return { version };
  },
});
