import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listAdminEmailsForVertical } from "../lib/auth";
import { damageReportUrl, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

const SCOPE_LABELS: Record<string, string> = {
  this_only: "This asset only",
  all_including_children: "This asset and everything inside",
  children_only: "Contained items only",
  some_children: "Some contained items",
};

/** Alert Operations admins when crew file a damage report batch. */
export async function scheduleDamageReportAdminEmails(
  ctx: MutationCtx,
  args: {
    report: Doc<"damageReports">;
    itemLabel: string;
    reporterName: string;
    eventTitle?: string;
  },
) {
  const subject = subjectForTemplate("damage_report_admin", args.itemLabel);
  const batchKey = args.report.batchId ?? args.report._id;

  for (const to of await listAdminEmailsForVertical(ctx, "Operations")) {
    await enqueueEmail(ctx, {
      template: "damage_report_admin",
      to,
      subject,
      eventId: args.report.eventId,
      idempotencyKey: `damage_report_admin:${batchKey}:${to}`,
      payload: {
        reporterName: args.reporterName,
        itemLabel: args.itemLabel,
        severity: args.report.severity,
        operabilityLabel:
          args.report.operability === "needs_repair" ? "Needs repair" : "Functional",
        scopeLabel: SCOPE_LABELS[args.report.scope] ?? args.report.scope,
        eventTitle: args.eventTitle,
        notes: args.report.notes,
        reportUrl: damageReportUrl(args.report._id),
      },
    });
  }
}
