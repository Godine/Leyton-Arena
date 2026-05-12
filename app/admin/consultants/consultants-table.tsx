"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { patchConsultant } from "./actions";

export interface ConsultantTableRow {
  id: string;
  display_name: string;
  email: string | null;
  office: string | null;
  primary_role: "technical" | "financial" | "both";
  has_technical_data: boolean;
  has_financial_data: boolean;
  is_director: boolean;
  last_seen_in_data: string | null;
  auth_user_id: string | null;
}

interface Props {
  consultants: ConsultantTableRow[];
}

const OFFICES = ["London", "Casablanca", "Dublin", "Other"] as const;
const ROLES = ["technical", "financial", "both"] as const;

export function ConsultantsTable({ consultants }: Props) {
  const [query, setQuery] = useState("");
  const filtered = consultants.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.display_name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
  });
  const unclaimed = consultants.filter((c) => c.email === null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-section font-medium">Consultants</h1>
          <p className="text-body text-muted-foreground">
            {consultants.length} on roster · {unclaimed} placeholder
            {unclaimed === 1 ? "" : "s"} awaiting an email
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="w-full max-w-xs"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Consultant</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Director</TableHead>
              <TableHead>Last in data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No consultants match that search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => <ConsultantRowView key={c.id} consultant={c} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConsultantRowView({ consultant }: { consultant: ConsultantTableRow }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={consultant.display_name} email={consultant.email} />
          <div className="flex flex-col">
            <span className="text-control font-medium">{consultant.display_name}</span>
            <div className="flex gap-1">
              {consultant.has_technical_data ? <Badge variant="muted">Technical</Badge> : null}
              {consultant.has_financial_data ? <Badge variant="muted">Financial</Badge> : null}
              {!consultant.auth_user_id && consultant.email ? (
                <Badge variant="warning">Unlinked</Badge>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <EmailCell consultant={consultant} />
      </TableCell>
      <TableCell>
        <OfficeCell consultant={consultant} />
      </TableCell>
      <TableCell>
        <RoleCell consultant={consultant} />
      </TableCell>
      <TableCell>
        <DirectorCell consultant={consultant} />
      </TableCell>
      <TableCell className="text-body tabular-nums text-muted-foreground">
        {consultant.last_seen_in_data
          ? format(new Date(consultant.last_seen_in_data), "d MMM yyyy")
          : "—"}
      </TableCell>
    </TableRow>
  );
}

function EmailCell({ consultant }: { consultant: ConsultantTableRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(consultant.email ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        className="text-control text-muted-foreground hover:text-foreground"
        onClick={() => {
          setValue(consultant.email ?? "");
          setEditing(true);
          setError(null);
        }}
      >
        {consultant.email ?? <span className="italic">click to set</span>}
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await patchConsultant({
            id: consultant.id,
            field: "email",
            value: value.trim() === "" ? null : value.trim(),
          });
          if (!result.ok) setError(result.error);
          else setEditing(false);
        });
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="email"
        placeholder="name@leyton.com"
        className="h-8"
      />
      <Button type="submit" size="icon" variant="ghost" disabled={pending} aria-label="Save">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => setEditing(false)}
        aria-label="Cancel"
      >
        <X className="h-4 w-4" />
      </Button>
      {error ? <span className="text-body text-destructive">{error}</span> : null}
    </form>
  );
}

function OfficeCell({ consultant }: { consultant: ConsultantTableRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={consultant.office ?? ""}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value || null;
        startTransition(async () => {
          await patchConsultant({ id: consultant.id, field: "office", value });
        });
      }}
    >
      <option value="">—</option>
      {OFFICES.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </NativeSelect>
  );
}

function RoleCell({ consultant }: { consultant: ConsultantTableRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={consultant.primary_role}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as (typeof ROLES)[number];
        startTransition(async () => {
          await patchConsultant({ id: consultant.id, field: "primary_role", value });
        });
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </NativeSelect>
  );
}

function DirectorCell({ consultant }: { consultant: ConsultantTableRow }) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(consultant.is_director);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          startTransition(async () => {
            const result = await patchConsultant({
              id: consultant.id,
              field: "is_director",
              value: next,
            });
            if (!result.ok) setChecked(!next);
          });
        }}
        className="h-4 w-4 rounded border-border bg-transparent accent-primary"
      />
      <span className="text-body text-muted-foreground">{checked ? "Yes" : "No"}</span>
    </label>
  );
}
