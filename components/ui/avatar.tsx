import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  email: string | null;
  size?: number;
  className?: string;
}

/**
 * Initials avatar with a colour derived from a hash of the consultant's
 * email. Same input -> same colour, so a person always looks the same
 * everywhere. Falls back to name-based hashing for email-less placeholders.
 */
export function Avatar({ name, email, size = 32, className }: AvatarProps) {
  const initials = computeInitials(name);
  const hue = hashHue(email ?? name);
  const bg = `hsl(${hue}, 55%, 32%)`;
  const fg = `hsl(${hue}, 70%, 86%)`;
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </span>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 360;
  }
  return h;
}
