import Link from "next/link";
import { Award, BarChart3, LayoutDashboard, Settings, Trophy, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";
import type { ConsultantRow } from "@/lib/supabase/database.types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { AvatarMenu } from "./avatar-menu";

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
  consultant: ConsultantRow;
  pathname: string;
  theme: Theme;
  children: React.ReactNode;
}

export function AppShell({ consultant, pathname, theme, children }: AppShellProps) {
  const profileHref = `/profile/${consultant.id}`;
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-eyebrow uppercase tracking-wider text-muted-foreground">
              Leyton
            </span>
            <span className="text-subhead font-medium">Arena</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <SidebarLink
            item={{ href: profileHref, label: "Profile", icon: <UserRound className="h-4 w-4" /> }}
            active={pathname.startsWith("/profile/")}
          />
          {consultant.is_director ? (
            <SidebarLink
              item={{
                href: "/admin/upload",
                label: "Admin",
                icon: <Settings className="h-4 w-4" />,
              }}
              active={pathname.startsWith("/admin/")}
              variant="muted"
            />
          ) : null}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href={profileHref}
            className="flex items-center gap-2 rounded-md p-2 hover:bg-secondary"
          >
            <Avatar name={consultant.display_name} email={consultant.email} size={32} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-control font-medium">{consultant.display_name}</span>
              <span className="truncate text-eyebrow uppercase tracking-wide text-muted-foreground">
                {consultant.office ?? "Unassigned"}
              </span>
            </div>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center justify-between gap-3">
            {/* Mobile logo (sidebar collapses on small screens) */}
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <span className="text-eyebrow uppercase tracking-wider text-muted-foreground">
                Leyton
              </span>
              <span className="text-subhead font-medium">Arena</span>
            </Link>
            <div className="hidden flex-1 items-center gap-2 lg:flex">
              {/* Page-level header content slot — pages render their own title in main */}
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle current={theme} redirectTo={pathname} />
              <NotificationBell consultantId={consultant.id} />
              <AvatarMenu consultant={consultant} />
            </div>
          </div>
        </header>

        <main className="container py-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="flex items-stretch">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-eyebrow uppercase tracking-wide text-muted-foreground",
                isActive(pathname, item.href) && "text-primary",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  variant,
}: {
  item: NavItem;
  active: boolean;
  variant?: "muted";
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-control transition-colors",
        variant === "muted"
          ? "border border-border text-muted-foreground hover:bg-secondary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        active && variant !== "muted" && "bg-secondary text-foreground",
        active && variant === "muted" && "border-primary/30 text-foreground",
      )}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RolePill({ role }: { role: "technical" | "financial" }) {
  return (
    <Badge variant="muted" className="uppercase">
      {role}
    </Badge>
  );
}
