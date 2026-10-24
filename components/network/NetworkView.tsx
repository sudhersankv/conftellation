"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Users } from "lucide-react";
import type { MeetProposal, MeetRequest, MeetRequestBody, MeetRespondBody, NetworkUser } from "@/lib/types";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession, userName } from "@/lib/ui/session-context";
import { EmptyState, ErrorState, PageHeader, SectionHeader, Skeleton, buttonClass } from "@/components/ui";
import { IntroCard } from "./IntroCard";
import { RequestCard } from "./RequestCard";
import { PersonOverlapCard } from "./PersonOverlapCard";
import { MeetDrawer } from "./MeetDrawer";
import { useSessionLookup } from "./proposal";

type DrawerState = { kind: "request"; toUserId: string } | { kind: "counter"; req: MeetRequest } | null;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function NetworkView() {
  const { userId, confId } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const net = useApi(apiKey("network", userId, confId), () => api.network(userId, confId), { pollMs: 5000 });
  const intros = useApi(apiKey("intros", userId, confId), () => api.intros(userId, confId));
  const lookup = useSessionLookup(confId, net.data);
  const [drawer, setDrawer] = useState<DrawerState>(null);

  // ?meet=<userId> opens the drawer once the network has loaded.
  const opened = useRef<string | null>(null);
  const meetParam = params.get("meet");
  useEffect(() => {
    if (!meetParam || !net.data || opened.current === meetParam || meetParam === userId) return;
    opened.current = meetParam;
    setDrawer({ kind: "request", toUserId: meetParam });
  }, [meetParam, net.data, userId]);

  const closeDrawer = (open: boolean) => {
    if (open) return;
    setDrawer(null);
    if (meetParam) router.replace("/network", { scroll: false });
  };

  const byId = useMemo(() => new Map((net.data?.users ?? []).map((u) => [u.user.id, u])), [net.data]);
  const pendingTo = useMemo(() => new Set((net.data?.outgoing ?? []).filter((r) => r.status === "pending").map((r) => r.toUserId)), [net.data]);

  const other = (r: MeetRequest) => (r.fromUserId === userId ? { id: r.toUserId, name: r.toName } : { id: r.fromUserId, name: r.fromName });

  const respond = async (req: MeetRequest, action: "accept" | "decline" | "counter", proposal?: MeetProposal) => {
    try {
      // The server needs the acting user (a fresh browser may have no ptc_user cookie yet).
      await api.respondMeet(req.id, { action, proposal, userId } as MeetRespondBody & { userId: string });
      if (action === "accept") toast.success("Meet added to both plans");
      else if (action === "decline") toast(`Declined ${other(req).name}`);
      else toast(`Suggested another time to ${other(req).name}`);
      await net.reload();
    } catch (e) {
      // e.g. 409 after a counter: show the server's message and refresh the list.
      toast.error(errMsg(e));
      void net.reload();
    }
  };

  const sendRequest = async (toUserId: string, v: { note: string; proposal: MeetProposal }) => {
    try {
      await api.requestMeet(userId, { confId, toUserId, note: v.note, proposal: v.proposal, userId } as MeetRequestBody & { confId: string; userId: string });
      toast.success(`Request sent to ${byId.get(toUserId)?.user.name ?? userName(toUserId)}`);
      closeDrawer(false);
      await net.reload();
    } catch (e) {
      toast.error(`Couldn't send the request: ${errMsg(e)}`);
    }
  };

  const incoming = [...(net.data?.incoming ?? [])].sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at));
  const outgoing = [...(net.data?.outgoing ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const users = net.data?.users ?? [];
  const waiting = incoming.filter((r) => r.status === "pending").length + outgoing.filter((r) => r.status === "countered").length;

  const drawerTarget: NetworkUser | undefined =
    drawer?.kind === "request" ? byId.get(drawer.toUserId) : drawer?.kind === "counter" ? byId.get(other(drawer.req).id) : undefined;
  const drawerName =
    drawer?.kind === "request" ? drawerTarget?.user.name ?? userName(drawer.toUserId) : drawer?.kind === "counter" ? other(drawer.req).name : "";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Network"
        subtitle={net.data ? `${users.length} ${users.length === 1 ? "person" : "people"} overlap your plan${waiting ? ` · ${waiting} waiting on you` : ""}` : "People whose plans overlap yours"}
      />

      {/* Requests */}
      <section>
        <SectionHeader title="Requests" count={net.data ? incoming.length + outgoing.length : undefined} />
        {net.error && !net.data ? (
          <ErrorState what="meet requests" detail={net.error.message} onRetry={net.reload} />
        ) : !net.data ? (
          <Skeleton rows={2} rowClassName="h-24" />
        ) : incoming.length + outgoing.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} text="No meet requests yet. Pick someone below and propose a time." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {incoming.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                direction="incoming"
                lookup={lookup}
                onAccept={() => respond(r, "accept")}
                onDecline={() => respond(r, "decline")}
                onSuggest={() => setDrawer({ kind: "counter", req: r })}
              />
            ))}
            {outgoing.map((r) => (
              <RequestCard key={r.id} req={r} direction="outgoing" lookup={lookup} onAccept={() => respond(r, "accept")} onDecline={() => respond(r, "decline")} onSuggest={() => setDrawer({ kind: "counter", req: r })} />
            ))}
          </div>
        )}
      </section>

      {/* Warm intros */}
      <section>
        <SectionHeader title="Warm intros & met before" count={intros.data?.intros.length} />
        {intros.error && !intros.data ? (
          <ErrorState what="intros" detail={intros.error.message} onRetry={intros.reload} />
        ) : !intros.data ? (
          <Skeleton rows={2} rowClassName="h-24" />
        ) : intros.data.intros.length === 0 ? (
          <EmptyState text="No warm intros yet. They appear when someone you met connects to your plan." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {intros.data.intros.map((i, k) => <IntroCard key={`${i.kind}-${i.person.id}-${k}`} intro={i} confId={confId} />)}
          </div>
        )}
      </section>

      {/* Overlapping people */}
      <section>
        <SectionHeader title="People here with overlapping plans" count={net.data ? users.length : undefined} />
        {net.error && !net.data ? (
          <ErrorState what="your network" detail={net.error.message} onRetry={net.reload} />
        ) : !net.data ? (
          <Skeleton rows={3} rowClassName="h-40" className="md:grid md:grid-cols-2 md:gap-3" />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No one overlaps your plan yet"
            text="As others plan the same sessions and booths, they show up here."
            action={<Link href="/plan" className={buttonClass({ variant: "secondary", size: "sm" })}>Open plan</Link>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {users.map((u) => (
              <PersonOverlapCard key={u.user.id} nu={u} pending={pendingTo.has(u.user.id)} onRequest={() => setDrawer({ kind: "request", toUserId: u.user.id })} />
            ))}
          </div>
        )}
      </section>

      <MeetDrawer
        open={!!drawer}
        onOpenChange={closeDrawer}
        name={drawerName}
        target={drawerTarget}
        counter={drawer?.kind === "counter"}
        onSubmit={async (v) => {
          if (drawer?.kind === "request") await sendRequest(drawer.toUserId, v);
          else if (drawer?.kind === "counter") { await respond(drawer.req, "counter", v.proposal); setDrawer(null); }
        }}
      />
    </div>
  );
}

const rank = (r: MeetRequest) => (r.status === "pending" || r.status === "countered" ? 0 : 1);
