"use client";
// App shell: left sidebar on md+, bottom nav on phones, top bar with conference + user switcher.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, GitBranch, Users, FileText, ListChecks, Plus, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { DEMO_USERS, useSession, userName } from "@/lib/ui/session-context";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { api } from "@/lib/client";
import { Avatar } from "@/components/ui/Misc";
import { Logo, LogoMark } from "@/components/shell/Logo";

const NAV = [
  { href: "/plan", label: "Plan", short: "Plan", icon: CalendarDays },
  { href: "/sessions", label: "Sessions", short: "Sessions", icon: ListChecks },
  { href: "/graph", label: "Conftellation", short: "Graph", icon: GitBranch },
  { href: "/network", label: "Network", short: "Network", icon: Users },
  { href: "/brief", label: "Brief", short: "Brief", icon: FileText },
] as const;

function NavLink({ href, label, short, icon: Icon, active, vertical }: { href: string; label: string; short?: string; icon: typeof CalendarDays; active: boolean; vertical?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center font-heading font-bold transition duration-fast",
        vertical
          ? cn("mx-auto my-1.5 w-full min-w-0 max-w-[64px] flex-col justify-center gap-0.5 rounded-2xl border-2 px-0.5 py-1 text-[10px] leading-3 tracking-tight", active ? "border-border bg-accent text-ink shadow-hardSm" : "border-transparent text-muted")
          : cn("gap-2.5 rounded-full border-2 px-3.5 py-2 text-sm", active ? "border-border bg-ink text-cream" : "border-transparent text-text hover:border-border hover:bg-accent/40"),
      )}
    >
      <Icon className={cn("shrink-0", vertical ? "size-5" : "size-4")} aria-hidden />
      {vertical ? <span className="max-w-full truncate">{short ?? label}</span> : label}
    </Link>
  );
}

function UserSwitcher({ compact }: { compact?: boolean }) {
  const { userId, setUserId } = useSession();
  const name = userName(userId);
  const ids = Object.keys(DEMO_USERS).includes(userId) ? Object.keys(DEMO_USERS) : [userId, ...Object.keys(DEMO_USERS)];
  if (compact) {
    // Phone: avatar only; the native select sits invisibly on top so a tap opens the picker.
    return (
      <label className="relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-border bg-surface shadow-hardSm" title={`Demo user: ${name}`}>
        <Avatar name={name} size="sm" />
        <select aria-label="Demo user" value={userId} onChange={(e) => setUserId(e.target.value)} className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0">
          {ids.map((id) => <option key={id} value={id}>{userName(id)}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="flex items-center gap-1.5 rounded-full border-2 border-border bg-surface py-0.5 pl-0.5 pr-1 shadow-hardSm" title="Demo user">
      <Avatar name={name} size="sm" />
      <select
        aria-label="Demo user"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="h-8 max-w-[8.5rem] cursor-pointer rounded-full bg-transparent pr-1 text-xs font-bold text-text focus:outline-none"
      >
        {ids.map((id) => <option key={id} value={id}>{userName(id)}</option>)}
      </select>
    </label>
  );
}

/** Pick which conference every screen shows (the user's attended conferences, from their record). */
function ConferenceSwitcher({ compact }: { compact?: boolean }) {
  const { userId, confId, setConfId } = useSession();
  const { data } = useApi(apiKey("record", userId), () => api.record(userId));
  const confs = data?.conferences.map((c) => c.conference) ?? [];
  const known = confs.some((c) => c.id === confId);
  const options = known ? confs : [{ id: confId, name: confId, url: "", startDate: "", endDate: "" }, ...confs];
  return (
    <label className={cn("flex min-w-0 items-center gap-1.5 rounded-full border-2 border-border bg-surface shadow-hardSm", compact ? "h-10 max-w-[150px] px-2" : "px-2.5 py-1")} title="Conference">
      <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
      <select
        aria-label="Conference"
        value={confId}
        onChange={(e) => setConfId(e.target.value)}
        className={cn("cursor-pointer truncate bg-transparent font-heading text-xs font-bold text-text focus:outline-none", compact ? "h-8 w-[110px] min-w-0" : "h-8 w-full")}
      >
        {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/network" && pathname.startsWith("/people"));
  const sideCls = (on: boolean) => cn("flex items-center gap-2.5 rounded-full border-2 px-3.5 py-2 font-heading text-sm font-bold transition duration-fast", on ? "border-border bg-ink text-cream" : "border-transparent text-text hover:border-border hover:bg-accent/40");
  return (
    <div className="min-h-dvh overflow-x-clip md:flex">
      {/* Sidebar (md+) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r-2 border-border bg-bg px-4 py-5 md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/" className="mb-5 px-1"><Logo /></Link>
        <div className="mb-5"><ConferenceSwitcher /></div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => <NavLink key={n.href} {...n} active={isActive(n.href)} />)}
        </nav>
        <div className="mt-5 flex flex-col gap-1 border-t-2 border-dashed border-border pt-5">
          <Link href="/add" aria-current={isActive("/add") ? "page" : undefined} className={sideCls(isActive("/add"))}><Plus className="size-4" />Add conference</Link>
          <Link href="/me" aria-current={isActive("/me") ? "page" : undefined} className={sideCls(isActive("/me"))}><UserCircle2 className="size-4" />My record</Link>
        </div>
        <div className="mt-auto"><UserSwitcher /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (phone) */}
        <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] w-full min-w-0 items-center justify-between gap-2 border-b-2 border-border bg-bg px-4 md:hidden">
          <Link href="/" aria-label="Conftellations home" className="shrink-0"><LogoMark size={36} /></Link>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <ConferenceSwitcher compact />
            <Link href="/add" aria-current={isActive("/add") ? "page" : undefined} className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 border-border shadow-hardSm", isActive("/add") ? "bg-accent" : "bg-surface")} aria-label="Add conference"><Plus className="size-5" /></Link>
            <UserSwitcher compact />
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-hidden px-4 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+20px)] pt-5 md:px-10 md:pb-12 md:pt-10">{children}</main>

        {/* Bottom nav (phone) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(var(--nav-h)+env(safe-area-inset-bottom))] grid-cols-6 border-t-2 border-border bg-surface px-0.5 pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((n) => <NavLink key={n.href} {...n} active={isActive(n.href)} vertical />)}
          <NavLink href="/me" label="Me" icon={UserCircle2} active={isActive("/me")} vertical />
        </nav>
      </div>
    </div>
  );
}
