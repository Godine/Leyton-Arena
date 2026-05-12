"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import type { ConsultantRow } from "@/lib/supabase/database.types";
import { Avatar } from "@/components/ui/avatar";

interface Props {
  consultant: ConsultantRow;
}

export function AvatarMenu({ consultant }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
    return undefined;
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-md px-1 hover:bg-secondary"
        aria-label="Account menu"
      >
        <Avatar name={consultant.display_name} email={consultant.email} size={28} />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border p-3">
            <p className="truncate text-control font-medium">{consultant.display_name}</p>
            <p className="truncate text-eyebrow uppercase tracking-wide text-muted-foreground">
              {consultant.email ?? "no email assigned"}
            </p>
          </div>
          <div className="p-1">
            <Link
              href={`/profile/${consultant.id}`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-control text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <UserRound className="h-4 w-4" />
              <span>View profile</span>
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-control text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
