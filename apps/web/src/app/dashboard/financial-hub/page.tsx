import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FinancialHubSettings } from "@/components/financial/financial-hub-settings";
import { BandPayoutsSummary } from "@/components/financial/band-payouts-summary";
import {
  FinancialHubExpensesCard,
  FinancialHubRevenueCard,
} from "@/components/insights/financial-hub-kpi-cards";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";

export default function FinancialHubPage() {
  return (
    <div className="space-y-4">
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <Card>
            <CardHeader>
              <CardTitle>Finances</CardTitle>
              <CardDescription>
                Centralize invoices, settlements, and payments across operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/financial-hub/invoices">Open Invoices</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/insights">Insights</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/organizations">Host Organizations</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/managers">Managers</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/invoices/new">Create Invoice</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/payments">Client Payments</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/financial-hub/band-payouts">Band Payouts</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/timecards">Crew Timecards</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/timecards/mine">My Timecards</Link>
              </Button>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Revenue</CardTitle>
                <CardDescription>Trailing 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <FinancialHubRevenueCard />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Expenses</CardTitle>
                <CardDescription>Trailing 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <FinancialHubExpensesCard />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Payouts</CardTitle>
              </CardHeader>
              <CardContent>
                <BandPayoutsSummary />
              </CardContent>
            </Card>
          </div>
          <FinancialHubSettings />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}
