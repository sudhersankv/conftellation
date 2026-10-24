"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CirclePlus, MoonStar, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const TABS = [
  { href: "/plan", label: "Plan", Icon: CalendarClock },
  { href: "/capture", label: "Capture", Icon: CirclePlus },
  { href: "/sky", label: "Sky", Icon: Sparkles },
  { href: "/brief", label: "Brief", Icon: MoonStar },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-ink/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-micro transition-colors duration-tap", active ? "text-star" : "text-dust hover:text-star")}
              >
                <span className={cn("grid h-7 w-14 place-items-center rounded-full", active && "bg-nebula")}>
                  <Icon className={cn("size-5", active && "text-polaris")} aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
