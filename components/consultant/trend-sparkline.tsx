"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Props {
  trend: Array<{ year_month: string; ops_count: number; net_fees: number }>;
}

export function TrendSparkline({ trend }: Props) {
  if (trend.length === 0) {
    return (
      <p className="py-6 text-center text-body text-muted-foreground">
        No ops yet this year. Time to change that.
      </p>
    );
  }
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="year_month"
            stroke="currentColor"
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickFormatter={(ym: string) => ym.slice(5)}
            className="text-muted-foreground"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="currentColor"
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelClassName="text-muted-foreground"
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, opacity: 0.4 }}
            formatter={(value: number, _name, item) => {
              if (item.dataKey === "ops_count") return [value, "Ops"];
              return [`£${Math.round(value).toLocaleString()}`, "Fees"];
            }}
          />
          <Line
            type="monotone"
            dataKey="ops_count"
            stroke="#F26122"
            strokeWidth={2}
            dot={{ r: 2, fill: "#F26122" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
