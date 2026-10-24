"use client";
// Bottom card for the tapped star (vaul snap 40% / 90%).
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PathButton } from "@/components/sky/PathButton";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { api } from "@/lib/client";
import type { Booth, PlanItem, Session, SkyNode } from "@/lib/types";
import { fmtRange, fmtTime } from "@/lib/ui/format";
import { useSession } from "@/lib/ui/session-context";
import { useSky } from "@/lib/ui/sky-store";
import { planItemById } from "@/lib/ui/sky/build";
import { useSkyView } from "@/lib/ui/sky/view-store";
import { apiKey, useApi } from "@/lib/ui/use-api";

const CARD_TYPES = new Set(["session", "person", "booth", "company", "user", "goal", "problem", "moment", "meet", "topic"]);

const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-3">{children}</div>;

function Body({ node }: { node: SkyNode }) {
  const router = useRouter();
  const { userId, confId, nowIso } = useSession();
  const coverage = useSkyView((s) => s.coverage);
  const links = useSkyView((s) => s.links);
  const t = node.type;
  const needsPlan = t === "session" || t === "person" || t === "booth" || t === "company";
  const plan = useApi(needsPlan ? apiKey("plan", userId, confId, nowIso()) : null, () => api.plan(userId, confId, { now: nowIso() }));
  const detail = useApi(t === "session" || t === "booth" || t === "company" ? apiKey("conference", confId) : null, () => api.conference(confId));
  const network = useApi(t === "user" ? apiKey("network", userId, confId) : null, () => api.network(userId, confId));
  const go = (href: string) => { useSky.getState().focus(null); router.push(href); };
  const item: PlanItem | undefined = plan.data ? planItemById(plan.data).get(node.id) : undefined;
  const why = item?.why ?? [];

  if (t === "session") {
    const s: Session | undefined = item?.session ?? detail.data?.sessions.find((x) => x.id === node.id);
    return (
      <Stack>
        <p className="text-title">{item?.title ?? s?.title ?? node.label}</p>
        {s && <div className="flex flex-wrap gap-2"><Chip kind="time">{fmtRange(s.start, s.end)}</Chip>{s.room && <Chip kind="room">{s.room}</Chip>}</div>}
        {s && s.speakers.length > 0 && <p className="text-meta text-dust">{s.speakers.map((p) => p.name).join(", ")}</p>}
        <PathButton paths={why} />
        <Button onClick={() => go(`/sessions/${encodeURIComponent(node.id)}`)}>Open session</Button>
      </Stack>
    );
  }
  if (t === "person") {
    return (
      <Stack>
        <p className="text-title">{item?.title ?? node.label}</p>
        {item?.subtitle && <p className="text-meta text-dust">{item.subtitle}</p>}
        <PathButton paths={why} />
        <Button onClick={() => go(`/people/${encodeURIComponent(node.id)}`)}>Open profile</Button>
      </Stack>
    );
  }
  if (t === "booth" || t === "company") {
    const b: Booth | undefined = item?.booth ?? detail.data?.booths.find((x) => x.id === node.id || x.companyId === node.id);
    return (
      <Stack>
        <p className="text-title">{b?.company.name ?? item?.title ?? node.label}</p>
        {b && <div><Chip kind="booth">{b.label}{b.hall ? ` · ${b.hall}` : ""}</Chip></div>}
        {b?.company.description && <p className="line-clamp-2 text-body">{b.company.description}</p>}
        <PathButton paths={why} />
      </Stack>
    );
  }
  if (t === "user") {
    if (network.error && !network.data) return <ErrorState what="attendees" onRetry={network.reload} />;
    if (!network.data) return <Stack><p className="text-title">{node.label}</p><Skeleton rows={2} /></Stack>;
    const nu = network.data.users.find((u) => u.user.id === node.id);
    const pid = nu?.user.personId;
    return (
      <Stack>
        <p className="text-title">{nu?.user.name ?? node.label}</p>
        {nu && <p className="text-meta text-dust">{nu.overlap} in common{nu.shared.length ? `: ${nu.shared.map((x) => x.title).join(", ")}` : ""}</p>}
        <Button disabled={!pid} onClick={() => pid && go(`/people/${encodeURIComponent(pid)}`)}>{pid ? "Open profile" : "Profile not available"}</Button>
      </Stack>
    );
  }
  if (t === "goal" || t === "problem") {
    const c = coverage.find((x) => x.goalId === node.id);
    return (
      <Stack>
        <p className="font-name text-title font-normal italic">{node.label}</p>
        {c && <p className="text-meta text-dust">{c.covered} of {c.planned} covered</p>}
      </Stack>
    );
  }
  if (t === "moment") {
    const target = links.find((l) => l.source === node.id && l.type === "AT")?.target;
    const name = node.label.charAt(0).toUpperCase() + node.label.slice(1);
    return (
      <Stack>
        <p className="text-title">{name}</p>
        {node.at && <p className="text-meta tabular-nums text-dust">{fmtTime(node.at)}</p>}
        {target && <Button variant="ghost" onClick={() => go(`/sessions/${encodeURIComponent(target)}`)}>Open session</Button>}
      </Stack>
    );
  }
  return <Stack><p className="text-title">{node.label}</p></Stack>;
}

export function StarCard() {
  const id = useSky((s) => s.focusId);
  const node = useSkyView((s) => s.nodes.find((n) => n.id === id));
  const show = !!node && CARD_TYPES.has(node.type) && !(node.type === "user" && !node.isOtherUser) && node.state !== "dust";
  return (
    <Drawer open={show} onOpenChange={(o) => { if (!o) useSky.getState().focus(null); }} title={node?.label ?? "Star"} snapPoints={[0.4, 0.9]}>
      {show && node && <Body node={node} />}
    </Drawer>
  );
}
