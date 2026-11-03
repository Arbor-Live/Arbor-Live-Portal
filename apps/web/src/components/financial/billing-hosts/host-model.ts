import type { FunctionReturnType } from "convex/server";
import type { Tone } from "@/components/page-header";
import type { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

export type HostRow = FunctionReturnType<typeof api.invoiceGroups.listForAdmin>[number];
export type HostContact = FunctionReturnType<typeof api.invoiceContacts.listForAdmin>[number];
export type HostAlias = FunctionReturnType<typeof api.invoiceGroups.listAliases>[number];

export type HostStatus = "active" | "archived";

export const HOST_STATUS: Record<HostStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "emerald" },
  archived: { label: "Archived", tone: "neutral" },
};

export function hostStatus(host: { active: boolean }): HostStatus {
  return host.active ? "active" : "archived";
}

export const ALIAS_SOURCE_LABELS: Record<HostAlias["source"], string> = {
  manual: "Added by hand",
  merge: "From a merge",
  rename: "Old name",
};

export function plural(count: number, noun: string, nouns = `${noun}s`) {
  return `${count.toLocaleString()} ${count === 1 ? noun : nouns}`;
}

export function contactName(contact: { firstName: string; lastName: string }) {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

/** Runs a mutation and reports it; resolves whether it succeeded. */
export async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}
