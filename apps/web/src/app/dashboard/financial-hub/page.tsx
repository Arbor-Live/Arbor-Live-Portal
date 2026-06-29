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
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function FinancialHubPage() {
  return (
    <div className="space-y-4">
      <ArborOnlyGuard>
        <Card>
          <CardHeader>
            <CardTitle>Financial Hub</CardTitle>
            <CardDescription>
              Centralize invoices, settlements, and payments across operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard/financial-hub/invoices">Open Invoices</Link>
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
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">Coming soon.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">Coming soon.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payouts</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">Coming soon.</CardContent>
          </Card>
        </div>
        <FinancialHubSettings />
      </ArborOnlyGuard>
    </div>
  );
}
