import { redirect } from "next/navigation";

/** Payments is now a tab of Invoices; keep old links working. */
export default function FinancialHubPaymentsPage() {
  redirect("/dashboard/ops-center/invoices/payments");
}
