"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitPin } from "./actions";

type Role = "director" | "consultant";

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!role) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <RoleButton
          icon={<Settings className="h-5 w-5" />}
          label="Director"
          description="Upload, manage, audit"
          onClick={() => setRole("director")}
        />
        <RoleButton
          icon={<UserRound className="h-5 w-5" />}
          label="Consultant"
          description="Dashboard, leaderboard"
          onClick={() => setRole("consultant")}
        />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitPin({ role, pin });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace(result.role === "director" ? "/admin" : "/dashboard");
          router.refresh();
        });
      }}
    >
      <button
        type="button"
        onClick={() => {
          setRole(null);
          setPin("");
          setError(null);
        }}
        className="-mt-1 inline-flex w-fit items-center gap-1 text-body text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Change role</span>
      </button>

      <div className="space-y-2">
        <Label htmlFor="pin">{role === "director" ? "Director" : "Consultant"} PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          maxLength={4}
          pattern="\d{4}"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="text-center text-section font-medium tracking-[0.5em]"
          disabled={pending}
        />
      </div>

      {error ? <p className="text-body text-destructive">{error}</p> : null}

      <Button type="submit" disabled={pending || pin.length !== 4} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <span>{pending ? "Signing in..." : "Continue"}</span>
      </Button>

      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
        Demo PIN. Replace with real auth before going to production.
      </p>
    </form>
  );
}

function RoleButton({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition-colors",
        "hover:border-primary/40 hover:bg-secondary",
      )}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
        {icon}
      </span>
      <p className="mt-1 text-control font-medium">{label}</p>
      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{description}</p>
    </button>
  );
}
