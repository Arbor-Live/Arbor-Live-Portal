/**
 * Better Auth component schema.
 *
 * Base table definitions live in `generatedSchema.ts` (CLI-regenerable).
 * Custom indexes that survive regeneration are applied here — see
 * https://labs.convex.dev/better-auth/features/local-install#adding-custom-indexes
 */
import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  // Adapter membership checks use organizationId + userId together.
  member: tables.member.index("organizationId_userId", ["organizationId", "userId"]),
  invitation: tables.invitation.index("email_organizationId", ["email", "organizationId"]),
});

export default schema;
