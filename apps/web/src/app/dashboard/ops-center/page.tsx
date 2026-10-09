import Link from "next/link";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr";
import { AdminOnlyContent, ArborOnlyGuard, OperationsOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FinancialHubAttention } from "@/components/financial/financial-hub-attention";
import {
  FinancialHubExpensesCard,
  FinancialHubRevenueCard,
} from "@/components/insights/financial-hub-kpi-cards";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ops Center",
};

export default function FinancialHubPage() {
  return (
    <div className="space-y-4">
      <ArborOnlyGuard>
        <OperationsOrAdminGuard>
          <PageHeader
            title="Ops Center"
            description="What needs attention across booking requests, quotes, invoices, and artist payouts."
            actions={
              <AdminOnlyContent>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/ops-center/settings">
                    <SlidersHorizontalIcon />
                    Settings
                  </Link>
                </Button>
              </AdminOnlyContent>
            }
          />
          <FinancialHubAttention />
          <div className="grid gap-4 lg:grid-cols-2">
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
          </div>
        </OperationsOrAdminGuard>
      </ArborOnlyGuard>
    </div>
  );
}
