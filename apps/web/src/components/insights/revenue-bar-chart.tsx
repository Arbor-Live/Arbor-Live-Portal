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

export type RevenueMetric = "revenue" | "profit";

type RevenueBarChartProps = {
  months: Array<{ monthKey: string; amountUsd: number; profitUsd?: number }>;
  emptyLabel?: string;
  valueLabel?: string;
  metric?: RevenueMetric;
};

function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  const label = labels[index] ?? monthKey;
  return `${label} ${year?.slice(2) ?? ""}`;
}

export function RevenueBarChart({
  months,
  emptyLabel = "No recognized revenue in this range.",
  valueLabel = "Revenue",
  metric = "revenue",
}: RevenueBarChartProps) {
  const dataKey = metric === "profit" ? "profitUsd" : "amountUsd";
  const data = months.map((row) => ({
    ...row,
    label: shortMonthLabel(row.monthKey),
  }));

  if (data.every((row) => (row[dataKey] ?? 0) === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
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
          <Bar dataKey={dataKey} name={valueLabel} fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
