import { readEmailSummaryBlock, upsertEmailSummaryBlock } from "@arbor/format";

/**
 * The portal writes the client-email summary into `events.notes` on the server.
 * The workspace saves notes as one whole string, so a draft the user started
 * before that write would later overwrite the block. When the server's block
 * differs from the one the draft was based on, carry it into the draft and
 * rebase onto the server text; the user's own edits stay unsaved and intact.
 * Returns null when there is nothing to carry.
 */
export function carryServerSummaryBlock(args: {
  draft: string;
  baseline: string;
  server: string;
}): { draft: string; baseline: string } | null {
  const block = readEmailSummaryBlock(args.server);
  if (!block || block === readEmailSummaryBlock(args.baseline)) return null;
  return { draft: upsertEmailSummaryBlock(args.draft, block), baseline: args.server };
}
