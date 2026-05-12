"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "@/components/lucide-icon";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  MYTHIC_GRADIENT,
  TIER_HEX,
  TIER_LABEL,
  tierBorderClass,
  tierTextClass,
} from "@/lib/ui/tier";
import type { Role, BadgeTier } from "@/lib/types";

export interface SharePayload {
  displayName: string;
  email: string | null;
  office: string | null;
  ranks: Array<{ role: Role; rank: number | null; total: number | null }>;
  lifetimeOps: number;
  lifetimeFees: number;
  bestStreak: number;
  topBadges: Array<{ key: string; name: string; icon: string; tier: BadgeTier }>;
}

interface Props {
  payload: SharePayload;
}

export function ShareCardButton({ payload }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 1, // already a 1080px-wide element
        backgroundColor: "#0B1828",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slugify(payload.displayName)}-leyton-arena.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={download} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        <span>Download card</span>
      </Button>
      {/* Off-screen render of the card. We position it so it never affects layout. */}
      <div aria-hidden className="pointer-events-none fixed left-[-99999px] top-0">
        <ShareCard ref={ref} payload={payload} />
      </div>
    </>
  );
}

const ShareCard = ({
  ref,
  payload,
}: {
  ref: React.RefObject<HTMLDivElement>;
  payload: SharePayload;
}) => {
  return (
    <div
      ref={ref}
      className="dark flex h-[1080px] w-[1080px] flex-col gap-10 bg-[#0B1828] p-20 text-white"
      style={{ fontFamily: "var(--font-geist-sans, system-ui)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[24px] uppercase tracking-[0.15em] text-[#94a3b8]">Leyton</p>
          <p className="text-[56px] font-medium leading-none">Arena</p>
        </div>
        <p className="text-[24px] uppercase tracking-[0.15em] text-[#94a3b8]">
          {payload.office ?? "—"}
        </p>
      </div>

      <div className="flex items-center gap-8">
        <Avatar name={payload.displayName} email={payload.email} size={120} />
        <div>
          <p className="text-[72px] font-medium leading-tight">{payload.displayName}</p>
          <div className="mt-2 flex gap-4 text-[28px] text-[#cbd5e1]">
            {payload.ranks.map((r) => (
              <span key={r.role} className="rounded-md border border-white/15 px-3 py-1">
                <span className="uppercase tracking-wider text-[#94a3b8]">{r.role}</span>{" "}
                <span className="tabular-nums text-white">{r.rank ? `#${r.rank}` : "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <CardStat label="Lifetime ops" value={payload.lifetimeOps.toString()} />
        <CardStat
          label="Lifetime fees"
          value={`£${Math.round(payload.lifetimeFees).toLocaleString()}`}
        />
        <CardStat label="Best streak" value={`${payload.bestStreak} mo`} />
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <p className="text-[20px] uppercase tracking-wider text-[#94a3b8]">Top badges</p>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {payload.topBadges.length === 0 ? (
            <p className="col-span-3 text-[24px] text-[#94a3b8]">
              No badges yet. Watch this space.
            </p>
          ) : (
            payload.topBadges.map((b) => (
              <div
                key={`${b.key}-${b.tier}`}
                className={cn(
                  "flex items-center gap-4 rounded-xl border bg-white/[0.04] p-5",
                  tierBorderClass(b.tier),
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]",
                    tierTextClass(b.tier),
                    b.tier === "mythic" && MYTHIC_GRADIENT,
                  )}
                  style={{ color: TIER_HEX[b.tier] }}
                >
                  <LucideIcon name={b.icon} className="h-8 w-8" />
                </span>
                <div>
                  <p className="text-[24px] font-medium">{b.name}</p>
                  <p className="text-[20px] uppercase tracking-wider text-[#94a3b8]">
                    {TIER_LABEL[b.tier]}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[20px] text-[#94a3b8]">
        <span>leyton-arena.internal</span>
        <span>
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
    </div>
  );
};

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8">
      <p className="text-[20px] uppercase tracking-wider text-[#94a3b8]">{label}</p>
      <p className="mt-3 text-[64px] font-medium tabular-nums leading-none">{value}</p>
    </div>
  );
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
