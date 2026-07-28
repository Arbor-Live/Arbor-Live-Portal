"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

type SparklineProps = {
  data: Array<{ monthKey: string; value: number }>;
  color?: string;
  className?: string;
};

export function Sparkline({ data, color = "var(--primary)", className }: SparklineProps) {
  if (data.length === 0) {
    return <div className={className ?? "h-10"} />;
  }

  return (
    <div className={className ?? "h-10 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
