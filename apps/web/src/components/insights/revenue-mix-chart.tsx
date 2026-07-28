"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatUsd } from "@/lib/format";

type RevenueMixChartProps = {
  equipmentUsd: number;
  crewUsd: number;
  artistsUsd: number;
  feesUsd: number;
  externalRentalsUsd: number;
};

const COLORS = [
  "var(--primary)",
  "var(--chart-2, #64748b)",
  "var(--chart-3, #94a3b8)",
  "var(--chart-4, #475569)",
  "var(--chart-5, #cbd5e1)",
];

export function RevenueMixChart(props: RevenueMixChartProps) {
  const data = [
    { name: "Equipment", value: props.equipmentUsd },
    { name: "Crew", value: props.crewUsd },
    { name: "Artists", value: props.artistsUsd },
    { name: "Fees", value: props.feesUsd },
    { name: "External rentals", value: props.externalRentalsUsd },
  ].filter((row) => row.value > 0);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No paid invoice mix in this range.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatUsd(Number(value ?? 0))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
