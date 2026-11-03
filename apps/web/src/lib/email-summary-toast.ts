/** What the Email card's "Add summary to notes" result says, by how many events it actually wrote. */
export function emailSummaryToast(outcome: {
  result: "written" | "nothing" | "no_invoice";
  events: number;
}): { kind: "success" | "info"; message: string } {
  if (outcome.result === "nothing") return { kind: "info", message: "Nothing operational to add" };
  if (outcome.result === "no_invoice") return { kind: "info", message: "No quote to key the summary to" };
  if (outcome.events === 0) return { kind: "info", message: "No linked event to update" };
  return { kind: "success", message: "Summary added" };
}
