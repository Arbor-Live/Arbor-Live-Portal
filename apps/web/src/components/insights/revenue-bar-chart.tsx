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

type RevenueBarChartProps = {
  months: Array<{ monthKey: string; amountUsd: number }>;
};

function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  const label = labels[index] ?? monthKey;
  return `${label} ${year?.slice(2) ?? ""}`;
}

export function RevenueBarChart({ months }: RevenueBarChartProps) {
  const data = months.map((row) => ({
    ...row,
    label: shortMonthLabel(row.monthKey),
  }));

  if (data.every((row) => row.amountUsd === 0)) {
    return <p className="text-sm text-muted-foreground">No recognized revenue in this range.</p>;
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
            formatter={(value) => formatUsd(Number(value ?? 0))}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="amountUsd" name="Revenue" fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
