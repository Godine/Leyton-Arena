"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink } from "./actions";

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <div className="space-y-1">
          <p className="text-subhead font-medium">Check your inbox</p>
          <p className="text-body text-muted-foreground">
            We sent a magic link to <span className="text-foreground">{sentTo}</span>. It expires in
            1 hour.
          </p>
        </div>
        <button
          className="mt-2 text-body text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await sendMagicLink(formData);
          if (result.ok) setSentTo(result.email);
          else setError(result.error);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@leyton.com"
            className="pl-9"
            disabled={pending}
          />
        </div>
      </div>
      {error ? <p className="text-body text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send magic link"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </Button>
      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
        No password needed. We&apos;ll email you a one-time link.
      </p>
    </form>
  );
}
