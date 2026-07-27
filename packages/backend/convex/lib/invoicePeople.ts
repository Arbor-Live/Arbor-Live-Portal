import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function trimOptional(raw: string | undefined) {
  const out = raw?.trim();
  return out ? out : undefined;
}

/** Upsert shared person identity by normalized email; returns personId or undefined if no email. */
export async function upsertInvoicePerson(
  ctx: MutationCtx,
  args: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    now?: number;
  },
): Promise<Id<"invoicePeople"> | undefined> {
  const email = args.email?.trim().toLowerCase();
  if (!email) return undefined;
  const now = args.now ?? Date.now();
  const firstName = trimOptional(args.firstName);
  const lastName = trimOptional(args.lastName);
  const phone = trimOptional(args.phone);

  const existing = await ctx.db
    .query("invoicePeople")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      firstName: firstName ?? existing.firstName,
      lastName: lastName ?? existing.lastName,
      phone: phone ?? existing.phone,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("invoicePeople", {
    email,
    firstName,
    lastName,
    phone,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}
