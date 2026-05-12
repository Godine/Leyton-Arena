import Link from "next/link";
import { ArrowLeft, History, Settings, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin/upload", label: "Upload", icon: <Upload className="h-4 w-4" /> },
  { href: "/admin/history", label: "History", icon: <History className="h-4 w-4" /> },
  { href: "/admin/consultants", label: "Consultants", icon: <Users className="h-4 w-4" /> },
];

interface AdminShellProps {
  active?: string;
  children: React.ReactNode;
  director: { display_name: string };
}

export function AdminShell({ active, children, director }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-body text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to arena</span>
            </Link>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-subhead font-medium">Admin</span>
            </div>
          </div>
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
          <div className="flex items-center gap-3">
            <span className="hidden text-body text-muted-foreground sm:inline">
              {director.display_name}
            </span>
            <form action="/auth/sign-out" method="post">
              <Button variant="ghost" size="sm" type="submit">
                Sign out
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
        </nav>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
