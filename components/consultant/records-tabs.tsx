"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  active: "technical" | "financial" | "cross_role";
}

const TABS: { id: Props["active"]; label: string }[] = [
  { id: "technical", label: "Technical" },
  { id: "financial", label: "Financial" },
  { id: "cross_role", label: "Cross-role" },
];

export function RecordsTabs({ active }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(id: Props["active"]): string {
    const next = new URLSearchParams(params.toString());
    next.set("tab", id);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div
      role="tablist"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5 text-control"
    >
      {TABS.map((t) => (
        <Link
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          scroll={false}
          href={hrefFor(t.id)}
          className={cn(
            "rounded px-3 py-1 transition-colors",
            active === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
