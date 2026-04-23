import Link from "next/link";
import { InvoicesListClient } from "@/components/financial/invoices-list-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvoicesListPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <Button asChild>
          <Link href="/dashboard/financial-hub/invoices/new">Create Invoice</Link>
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
        <CardContent>
          <InvoicesListClient />
        </CardContent>
      </Card>
    </div>
  );
}
