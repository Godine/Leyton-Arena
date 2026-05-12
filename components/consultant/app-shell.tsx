import Link from "next/link";
import { Award, BarChart3, LayoutDashboard, Settings, Trophy, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/badges", label: "Badges", icon: <Award className="h-4 w-4" /> },
  { href: "/records", label: "Records", icon: <Trophy className="h-4 w-4" /> },
];

interface AppShellProps {
  consultant: { id: string; display_name: string; email: string | null; is_director: boolean };
  active?: string;
  children: React.ReactNode;
}

export function AppShell({ consultant, active, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-eyebrow uppercase tracking-wider text-muted-foreground">
              Leyton
            </span>
            <span className="text-subhead font-medium">Arena</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  active === item.href && "bg-secondary text-foreground",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {consultant.is_director ? (
              <Link
                href="/admin/upload"
                className="hidden items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-control text-muted-foreground hover:bg-secondary hover:text-foreground md:flex"
              >
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Link>
            ) : null}
            <Link
              href={`/profile/${consultant.id}`}
              className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-secondary"
            >
              <Avatar name={consultant.display_name} email={consultant.email} size={28} />
              <span className="hidden text-body text-muted-foreground sm:inline">
                {consultant.display_name}
              </span>
            </Link>
            <form action="/auth/sign-out" method="post">
              <Button variant="ghost" size="sm" type="submit" aria-label="Sign out">
                <UserRound className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
        <nav className="container flex items-center gap-1 overflow-x-auto pb-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                active === item.href && "bg-secondary text-foreground",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          {consultant.is_director ? (
            <Link
              href="/admin/upload"
              className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-control text-muted-foreground"
            >
              <Settings className="h-4 w-4" />
              <span>Admin</span>
            </Link>
          ) : null}
        </nav>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}

export function RolePill({ role }: { role: "technical" | "financial" }) {
  return (
    <Badge variant="muted" className="uppercase">
      {role}
    </Badge>
  );
}
