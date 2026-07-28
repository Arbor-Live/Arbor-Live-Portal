"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/format";

type ArAgingChartProps = {
  paymentPending: { count: number; totalUsd: number };
  proofNoReceipt: { count: number; totalUsd: number };
  overdue: { count: number; totalUsd: number };
};

export function ArAgingChart({ paymentPending, proofNoReceipt, overdue }: ArAgingChartProps) {
  const data = [
    { label: "Pending", count: paymentPending.count, totalUsd: paymentPending.totalUsd },
    { label: "Proof submitted", count: proofNoReceipt.count, totalUsd: proofNoReceipt.totalUsd },
    { label: "Overdue", count: overdue.count, totalUsd: overdue.totalUsd },
  ];

  if (data.every((row) => row.count === 0)) {
    return <p className="text-sm text-muted-foreground">No open AR in the current payment window.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`
            }
            width={48}
          />
          <Tooltip
            formatter={(value, name) => {
              if (name === "totalUsd") return [formatUsd(Number(value ?? 0)), "Amount"];
              return [String(value), "Count"];
            }}
          />
          <Bar dataKey="totalUsd" name="totalUsd" fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
