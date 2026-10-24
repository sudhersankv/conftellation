"use client";
// App shell: left sidebar on md+, bottom nav on phones, top bar with conference + user switcher.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, GitBranch, Users, FileText, Plus, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { DEMO_USERS, useSession, userName } from "@/lib/ui/session-context";
import { Avatar } from "@/components/ui/Misc";

const NAV = [
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/graph", label: "Graph", icon: GitBranch },
  { href: "/network", label: "Network", icon: Users },
  { href: "/brief", label: "Brief", icon: FileText },
] as const;

function NavLink({ href, label, icon: Icon, active, vertical }: { href: string; label: string; icon: typeof CalendarDays; active: boolean; vertical?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg text-sm transition duration-fast",
        vertical ? "flex-col gap-1 px-2 py-1.5 text-[11px]" : "px-3 py-2",
        active ? "bg-surface2 text-text" : "text-muted hover:bg-surface hover:text-text",
      )}
    >
      <Icon className={cn("shrink-0", vertical ? "size-5" : "size-4")} aria-hidden />
      {label}
    </Link>
  );
}

function UserSwitcher() {
  const { userId, setUserId } = useSession();
  const name = userName(userId);
  const ids = Object.keys(DEMO_USERS).includes(userId) ? Object.keys(DEMO_USERS) : [userId, ...Object.keys(DEMO_USERS)];
  return (
    <label className="flex items-center gap-2" title="Demo user">
      <Avatar name={name} size="sm" />
      <select
        aria-label="Demo user"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="h-10 max-w-[9.5rem] rounded-md border border-border bg-surface px-2 text-xs text-text hover:border-borderStrong focus:border-accent focus:outline-none md:h-8"
      >
        {ids.map((id) => <option key={id} value={id}>{userName(id)}</option>)}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/plan" && pathname.startsWith("/sessions")) || (href === "/network" && pathname.startsWith("/people"));
  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (md+) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg px-3 py-4 md:flex md:sticky md:top-0 md:h-dvh">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-bg"><GitBranch className="size-3.5" /></span>
          <span className="text-sm font-semibold tracking-tight">Conftellations</span>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => <NavLink key={n.href} {...n} active={isActive(n.href)} />)}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          <Link href="/add" aria-current={isActive("/add") ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface hover:text-text", isActive("/add") ? "bg-surface2 text-text" : "text-muted")}><Plus className="size-4" />Add conference</Link>
          <Link href="/me" aria-current={isActive("/me") ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface hover:text-text", isActive("/me") ? "bg-surface2 text-text" : "text-muted")}><UserCircle2 className="size-4" />My record</Link>
        </div>
        <div className="mt-auto px-1"><UserSwitcher /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (phone) */}
        <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-accent text-bg"><GitBranch className="size-3.5" /></span>
            <span className="text-sm font-semibold tracking-tight">Conftellations</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/add" aria-current={isActive("/add") ? "page" : undefined} className={cn("grid size-10 place-items-center rounded-md hover:bg-surface hover:text-text", isActive("/add") ? "bg-surface2 text-text" : "text-muted")} aria-label="Add conference"><Plus className="size-5" /></Link>
            <UserSwitcher />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+16px)] pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>

        {/* Bottom nav (phone) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(var(--nav-h)+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border bg-bg/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((n) => <NavLink key={n.href} {...n} active={isActive(n.href)} vertical />)}
          <NavLink href="/me" label="Me" icon={UserCircle2} active={isActive("/me")} vertical />
        </nav>
      </div>
    </div>
  );
}
