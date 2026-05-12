"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { LeaderboardPeriod } from "@/lib/queries/leaderboard";

interface Props {
  period: LeaderboardPeriod;
  office: string | null;
  search: string;
}

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "all_time", label: "All time" },
];
const OFFICES = ["London", "Casablanca", "Dublin", "Other"];

export function LeaderboardFilters({ period, office, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(name: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        value={period}
        onChange={(e) => update("period", e.target.value)}
        className="max-w-44"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        value={office ?? ""}
        onChange={(e) => update("office", e.target.value || null)}
        className="max-w-44"
      >
        <option value="">All offices</option>
        {OFFICES.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={search}
          placeholder="Search name"
          className="h-8 w-48 pl-8"
          onChange={(e) => update("q", e.target.value)}
        />
      </div>
    </div>
  );
}
