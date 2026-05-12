"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

interface Props {
  current: Role;
  available: Role[];
}

const LS_KEY = "leyton-arena.role";

export function RoleToggle({ current, available }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  // Persist the active choice so a return visit defaults to it.
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, current);
    } catch {
      // localStorage may be unavailable (private mode); not critical.
    }
  }, [current]);

  if (available.length <= 1) return null;

  function hrefFor(role: Role): string {
    const next = new URLSearchParams(params.toString());
    next.set("role", role);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div
      role="tablist"
      aria-label="Role"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5 text-control"
    >
      {available.map((role) => {
        const active = role === current;
        return (
          <Link
            key={role}
            role="tab"
            aria-selected={active}
            scroll={false}
            href={hrefFor(role)}
            className={cn(
              "rounded px-3 py-1 capitalize transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {role}
          </Link>
        );
      })}
    </div>
  );
}
