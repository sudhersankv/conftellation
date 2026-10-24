"use client";
// Shared person card: avatar (photo or initials), name, title · company, chips, profile link buttons.
import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { Globe } from "lucide-react";
import type { Person } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { TYPE_COLOR } from "@/lib/ui/tokens";

export const personHref = (id: string) => `/people/${encodeURIComponent(id)}`;

/** Anything with an id and a name; every other Person field is optional (PersonRef fits). */
export type PersonLike = Pick<Person, "id" | "name"> & Partial<Omit<Person, "id" | "name">>;

// lucide-react 1.x dropped brand icons: minimal inline glyphs, currentColor.
const LinkedinIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.6h.06c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.5 4.77 5.75v5.6h-4v-4.96c0-1.18-.02-2.7-1.7-2.7-1.7 0-1.96 1.28-1.96 2.6v5.06h-4v-11Z" /></svg>
);
const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M17.75 3h3.07l-6.7 7.65L22 21h-6.17l-4.83-6.3L5.47 21H2.4l7.16-8.18L2 3h6.33l4.36 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z" /></svg>
);
const GithubIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.9.83.1-.65.36-1.08.65-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
);

export type ProfileLink = { href: string; label: string; kind: "linkedin" | "x" | "github" | "site" };

/** Classify a profile URL by host. Returns null for anything that isn't an http(s) URL. */
export function profileLink(raw: string): ProfileLink | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const href = u.toString();
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return { href, label: "LinkedIn", kind: "linkedin" };
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return { href, label: "X", kind: "x" };
  if (host === "github.com") return { href, label: "GitHub", kind: "github" };
  return { href, label: "Site", kind: "site" };
}

const ICON = { linkedin: LinkedinIcon, x: XIcon, github: GithubIcon, site: Globe } as const;

/** Profile link buttons (LinkedIn, X, GitHub, Site). Renders nothing when there are no usable links. */
export function PersonLinks({ links, size = "sm", className }: { links?: string[]; size?: "xs" | "sm"; className?: string }) {
  const seen = new Set<string>();
  const items = (links ?? []).map(profileLink).filter((l): l is ProfileLink => !!l && !seen.has(l.href) && !!seen.add(l.href));
  if (items.length === 0) return null;
  return (
    <div className={cn("relative z-10 flex flex-wrap gap-1.5", className)}>
      {items.map((l) => {
        const Icon = ICON[l.kind];
        return (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            title={l.href}
            className={cn(
              "press-sm inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-surface font-heading font-bold text-ink shadow-hardSm hover:bg-surface2",
              size === "xs" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
            )}
          >
            <Icon className="size-3.5 shrink-0" />{l.label}
          </a>
        );
      })}
    </div>
  );
}

export const roleLine = (p: { title?: string; company?: string }) => [p.title, p.company].filter(Boolean).join(" · ");

/**
 * Person card. `href` (or `href={true}` for `/people/<id>`) makes the whole card a link; link buttons and
 * `actions` stay independently clickable above it. `meta` sits on the right of the name row, `chips` under the role.
 */
export function PersonCard({
  person, meta, chips, actions, children, href, compact, color = TYPE_COLOR.person, bare, className,
}: {
  person: PersonLike;
  meta?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  href?: string | boolean;
  compact?: boolean;
  color?: string;
  /** Render only the header row (no card chrome), for use inside an existing Card. */
  bare?: boolean;
  className?: string;
}) {
  const link = href === true ? personHref(person.id) : typeof href === "string" ? href : undefined;
  const role = roleLine(person);
  const body = (
    <>
      {link && <Link href={link} className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent" aria-label={person.name} />}
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={person.name} src={person.photoUrl} size={compact ? "md" : "lg"} color={color} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
            <span className="min-w-0 truncate font-heading text-sm font-bold leading-5 text-text">{person.name}</span>
            {meta && <div className="shrink-0 text-xs text-muted">{meta}</div>}
          </div>
          {role && <p className={cn("text-xs text-muted", compact ? "truncate" : "mt-0.5")}>{role}</p>}
          {chips && <div className="relative z-10 mt-1.5 flex flex-wrap gap-1.5">{chips}</div>}
          <PersonLinks links={person.links} size={compact ? "xs" : "sm"} className="mt-2" />
        </div>
      </div>
      {children && <div className="relative z-10">{children}</div>}
      {actions && <div className="relative z-10 flex flex-wrap justify-end gap-2">{actions}</div>}
    </>
  );
  if (bare) return <div className={cn("relative flex min-w-0 flex-col gap-3", className)}>{body}</div>;
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border-2 border-border bg-surface",
        compact ? "p-3 shadow-hardSm" : "p-4 shadow-hard",
        link && "press-sm hover:bg-surface2",
        className,
      )}
    >
      {body}
    </div>
  );
}
