"use client";

import { RowCell, RowList } from "@/components/list-page";
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
    <RowList joined testId="top-clients-list">
      {clients.map((client) => (
        <li
          key={client.groupId ?? client.name}
          className="flex items-center gap-3 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">{client.name}</span>
          <RowCell className="w-20" muted>
            {client.invoiceCount} invoice{client.invoiceCount === 1 ? "" : "s"}
          </RowCell>
          <RowCell className="w-24">{formatUsd(client.totalUsd)}</RowCell>
        </li>
      ))}
    </RowList>
  );
}
