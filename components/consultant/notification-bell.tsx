"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CircleAlert, Loader2, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/supabase/database.types";
import { LucideIcon } from "@/components/lucide-icon";
import { tierTextClass } from "@/lib/ui/tier";

interface Props {
  consultantId: string;
}

const PAGE_SIZE = 20;

export function NotificationBell({ consultantId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click close.
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

  // Initial fetch.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("consultant_id", consultantId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!mounted) return;
      if (!error && data) setItems(data as NotificationRow[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase, consultantId]);

  // Realtime: surface new inserts as Sonner toasts and prepend to the list.
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${consultantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `consultant_id=eq.${consultantId}`,
        },
        (payload: RealtimePostgresInsertPayload<NotificationRow>) => {
          const row = payload.new;
          setItems((current) => [row, ...current].slice(0, PAGE_SIZE));
          surfaceToast(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, consultantId]);

  const unread = items.filter((n) => n.read_at === null).length;

  const markAllRead = useCallback(async () => {
    setItems((current) =>
      current.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("consultant_id", consultantId)
      .is("read_at", null);
  }, [supabase, consultantId]);

  const dismissOne = useCallback(
    async (id: string) => {
      setItems((current) =>
        current.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    },
    [supabase],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-control font-medium">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-eyebrow uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-body text-muted-foreground">All quiet on the western front.</p>
                <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                  Earn a badge to break the silence.
                </p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => dismissOne(n.id)}
                  className={
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary " +
                    (n.read_at ? "opacity-70" : "")
                  }
                >
                  <NotificationIcon notification={n} />
                  <div className="flex-1">
                    <p className="text-body">
                      <NotificationTitle notification={n} />
                    </p>
                    <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationIcon({ notification }: { notification: NotificationRow }) {
  if (notification.type === "badge_unlock") {
    const icon = String(notification.payload.badge_icon ?? "Award");
    const tier = String(notification.payload.tier ?? "bronze");
    return (
      <span
        className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md ${tierTextClass(tier)}`}
      >
        <LucideIcon name={icon} className="h-4 w-4" />
      </span>
    );
  }
  if (notification.type === "record_taken" || notification.type === "record_lost") {
    return (
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-primary">
        <Trophy className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground">
      <CircleAlert className="h-4 w-4" />
    </span>
  );
}

function NotificationTitle({ notification }: { notification: NotificationRow }) {
  const p = notification.payload;
  switch (notification.type) {
    case "badge_unlock":
      return (
        <>
          Badge unlocked —{" "}
          <span className="font-medium">
            {String(p.badge_name)} {capitalize(String(p.tier))}
          </span>
        </>
      );
    case "record_taken":
      return (
        <>
          You broke <span className="font-medium">{prettyRecord(String(p.record_key))}</span> at{" "}
          {String(p.value_label)}
        </>
      );
    case "record_lost":
      return (
        <>
          <span className="font-medium">{String(p.new_holder_name)}</span> just beat your{" "}
          {prettyRecord(String(p.record_key))} record
        </>
      );
    case "streak_milestone":
      return (
        <>
          Streak milestone — <span className="font-medium">{String(p.streak_type)}</span>
        </>
      );
    default:
      return <>Notification</>;
  }
}

function prettyRecord(key: string): string {
  return key.replaceAll("_", " ");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Sonner toast + 1-second confetti burst. Triggered by Realtime inserts —
 * meaning the user sees badges unlock at the exact moment the daily upload
 * commits.
 */
function surfaceToast(n: NotificationRow) {
  if (n.type === "badge_unlock") {
    const tier = String(n.payload.tier ?? "bronze");
    toast.success(`Badge unlocked — ${String(n.payload.badge_name)} ${capitalize(tier)}`, {
      description:
        typeof n.payload.progress_label === "string" ? String(n.payload.progress_label) : undefined,
      duration: 6000,
    });
    confetti({ particleCount: 80, spread: 60, startVelocity: 45, origin: { y: 0.2 } });
  } else if (n.type === "record_taken") {
    toast(`Record broken — ${prettyRecord(String(n.payload.record_key))}`, {
      description: `${String(n.payload.value_label)} — new hall-of-fame entry.`,
      duration: 6000,
    });
    confetti({ particleCount: 60, spread: 80, origin: { y: 0.2 } });
  } else if (n.type === "record_lost") {
    toast(`${String(n.payload.new_holder_name)} took your record`, {
      description: `${prettyRecord(String(n.payload.record_key))} now sits at ${String(
        n.payload.new_value_label,
      )}.`,
      duration: 6000,
    });
  }
}
