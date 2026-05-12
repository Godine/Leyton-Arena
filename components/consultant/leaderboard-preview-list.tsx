import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { LeaderboardEntry } from "@/lib/queries/dashboard";

interface Props {
  entries: LeaderboardEntry[];
}

export function LeaderboardPreviewList({ entries }: Props) {
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li
          key={e.consultant_id}
          className={cn(
            "flex items-center gap-3 py-2",
            e.is_self && "rounded-md bg-primary/10 px-2",
          )}
        >
          <span className="w-7 text-right font-mono text-control tabular-nums text-muted-foreground">
            {e.rank}
          </span>
          <Avatar name={e.display_name} email={e.email} size={28} />
          <Link
            href={`/profile/${e.consultant_id}`}
            className="flex-1 truncate text-control hover:underline"
          >
            {e.display_name}
          </Link>
          <span className="font-mono text-control tabular-nums">{e.ops_count}</span>
        </li>
      ))}
    </ul>
  );
}
