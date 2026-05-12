"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/queries/leaderboard";

interface Props {
  rows: LeaderboardRow[];
}

type SortKey = "rank" | "ops_count" | "net_fees" | "avg_cycle_days";

export function LeaderboardTable({ rows }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "rank",
    dir: "asc",
  });

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? Number.POSITIVE_INFINITY;
    const bv = b[sort.key] ?? Number.POSITIVE_INFINITY;
    if (av === bv) return a.rank - b.rank;
    return sort.dir === "asc" ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
  });

  function toggle(key: SortKey) {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "rank" ? "asc" : "desc" },
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <SortLabel label="#" sortKey="rank" sort={sort} onToggle={toggle} />
          </TableHead>
          <TableHead>Consultant</TableHead>
          <TableHead>Office</TableHead>
          <TableHead className="text-right">
            <SortLabel label="Ops" sortKey="ops_count" sort={sort} onToggle={toggle} />
          </TableHead>
          <TableHead className="text-right">
            <SortLabel label="Fees" sortKey="net_fees" sort={sort} onToggle={toggle} />
          </TableHead>
          <TableHead className="text-right">
            <SortLabel label="Avg cycle" sortKey="avg_cycle_days" sort={sort} onToggle={toggle} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r) => (
          <TableRow key={r.consultant_id} className={cn(r.is_self && "bg-primary/10")}>
            <TableCell className="font-mono tabular-nums text-muted-foreground">{r.rank}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar name={r.display_name} email={r.email} size={28} />
                <Link href={`/profile/${r.consultant_id}`} className="text-control hover:underline">
                  {r.display_name}
                </Link>
                {r.is_self ? <Badge variant="default">You</Badge> : null}
              </div>
            </TableCell>
            <TableCell className="text-body text-muted-foreground">{r.office ?? "—"}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{r.ops_count}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              £{Math.round(r.net_fees).toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
              {r.avg_cycle_days === null ? "—" : `${r.avg_cycle_days}d`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SortLabel({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggle: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 text-eyebrow uppercase tracking-wide",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      {active ? (
        sort.dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}
