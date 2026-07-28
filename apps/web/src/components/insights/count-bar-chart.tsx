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

type CountBarChartProps = {
  data: Array<{ key: string; count: number }>;
  emptyLabel?: string;
  valueLabel?: string;
};

export function CountBarChart({
  data,
  emptyLabel = "No data in this range.",
  valueLabel = "Count",
}: CountBarChartProps) {
  if (data.length === 0 || data.every((row) => row.count === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="key"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={data.length > 6 ? -30 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 60 : 30}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
          <Tooltip formatter={(value) => [Number(value ?? 0), valueLabel]} />
          <Bar dataKey="count" name={valueLabel} fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
