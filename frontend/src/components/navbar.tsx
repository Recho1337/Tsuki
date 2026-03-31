"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useDownloads } from "@/lib/download-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Download", href: "/download" },
  { label: "Search", href: "/search" },
  { label: "Library", href: "/library" },
  { label: "Services", href: "/connections" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { activeJobs } = useDownloads();

  // Lead active job for the mini progress bar
  const leadJob = activeJobs[0];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 glass">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="text-base font-semibold tracking-tight">
            月 <span className="text-primary">Tsuki</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                pathname === item.href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Active downloads indicator */}
          {activeJobs.length > 0 && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span>
                {activeJobs.length} active
              </span>
              {leadJob && (
                <>
                  <span className="text-primary/50">·</span>
                  <span className="tabular-nums">{leadJob.progress}%</span>
                </>
              )}
            </Link>
          )}

          <ThemeToggle />
          <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
              U
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
