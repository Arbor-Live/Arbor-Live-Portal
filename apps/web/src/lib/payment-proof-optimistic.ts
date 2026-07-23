import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";

type PaymentQueueRow = FunctionReturnType<typeof api.paymentProof.listByQueue>[number];
type PaymentQueue = "payment_pending" | "proof_no_receipt" | "payment_received" | "overdue";

function findRow(
  localStore: OptimisticLocalStore,
  invoiceId: Id<"invoices">,
): PaymentQueueRow | null {
  for (const entry of localStore.getAllQueries(api.paymentProof.listByQueue)) {
    if (!entry.value) continue;
    const found = entry.value.find((row) => row.invoiceId === invoiceId);
    if (found) return found;
  }
  return null;
}

export function optimisticMarkPaymentReceived(
  localStore: OptimisticLocalStore,
  args: { invoiceId: Id<"invoices"> },
) {
  const now = Date.now();
  const existing = findRow(localStore, args.invoiceId);

  if (existing) {
    const received: PaymentQueueRow = {
      ...existing,
      paymentReceivedAt: now,
      isOverdue: false,
    };

    for (const entry of localStore.getAllQueries(api.paymentProof.listByQueue)) {
      if (entry.value === undefined) continue;
      const queue = entry.args.queue as PaymentQueue;
      const without = entry.value.filter((row) => row.invoiceId !== args.invoiceId);

      if (queue === "payment_received") {
        localStore.setQuery(api.paymentProof.listByQueue, entry.args, [received, ...without]);
      } else {
        localStore.setQuery(api.paymentProof.listByQueue, entry.args, without);
      }
    }
  }

  const details = localStore.getQuery(api.paymentProof.getByInvoiceId, {
    invoiceId: args.invoiceId,
  });
  if (details) {
    localStore.setQuery(
      api.paymentProof.getByInvoiceId,
      { invoiceId: args.invoiceId },
      {
        ...details,
        status: "payment_received",
        paymentReceivedAt: now,
        isOverdue: false,
        canRecordProof: false,
      },
    );
  }
}
