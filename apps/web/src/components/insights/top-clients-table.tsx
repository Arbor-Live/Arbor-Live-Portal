"use client";

import { formatUsd } from "@/lib/format";

type TopClientsTableProps = {
  clients: Array<{
    groupId: string | null;
    name: string;
    totalUsd: number;
    invoiceCount: number;
  }>;
};

export function TopClientsTable({ clients }: TopClientsTableProps) {
  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">No paid clients in this range.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Host organization</th>
            <th className="pb-2 pr-4 font-medium text-right">Invoices</th>
            <th className="pb-2 font-medium text-right">Paid</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.groupId ?? client.name} className="border-b border-border/60">
              <td className="py-2 pr-4">{client.name}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{client.invoiceCount}</td>
              <td className="py-2 text-right tabular-nums">{formatUsd(client.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
