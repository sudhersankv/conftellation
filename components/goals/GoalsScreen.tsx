"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Plus, Sparkles, X } from "lucide-react";
import type { GoalKind, OpenTo } from "@/lib/types";
import { api } from "@/lib/client";
import { useApi, apiKey } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { Button, Card, ErrorState, Input, Label, PageHeader, SectionHeader, Skeleton, StatusLine, Textarea, buttonClass } from "@/components/ui";
import { TYPE_COLOR } from "@/lib/ui/tokens";
import { TZ } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";
import { fmtConfDates } from "@/components/record/conf-format";
import { TopicPicker } from "./TopicPicker";
import { hhmmIn, zonedIso } from "./zone";

const KINDS: { value: GoalKind; label: string }[] = [
  { value: "learn", label: "Learn" }, { value: "meet", label: "Meet" }, { value: "hire", label: "Hire" }, { value: "job", label: "Find a job" }, { value: "buy", label: "Buy" },
];
const OPEN_TO: { value: OpenTo; label: string }[] = [
  { value: "hiring", label: "Hiring" }, { value: "job_hunting", label: "Job hunting" }, { value: "buying", label: "Buying" }, { value: "learning", label: "Learning" },
];
const PLACEHOLDERS = ["Learn how teams trace LLM agents in production", "Meet people running graph databases at scale", "Find a vendor for eval tooling"];

interface GoalDraft { text: string; kind: GoalKind; topics: string[] }
const blank = (): GoalDraft => ({ text: "", kind: "learn", topics: [] });

function GoalRow({ i, goal, topics, onChange, onRemove, showError }: { i: number; goal: GoalDraft; topics: string[]; onChange(g: GoalDraft): void; onRemove?: () => void; showError: boolean }) {
  const id = `goal-${i}`;
  return (
    <Card className="flex flex-col gap-3" accent={TYPE_COLOR.goal}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Goal {i + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="-mr-2 grid size-10 place-items-center rounded-md text-faint hover:bg-surface2 hover:text-text md:size-8" aria-label={`Remove goal ${i + 1}`}>
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={goal.text}
          onChange={(e) => onChange({ ...goal, text: e.target.value })}
          placeholder={PLACEHOLDERS[i] ?? PLACEHOLDERS[0]}
          aria-label={`Goal ${i + 1}`}
          aria-invalid={showError || undefined}
          className={cn("sm:flex-1", showError && "border-danger/60")}
          maxLength={160}
        />
        <select
          value={goal.kind}
          onChange={(e) => onChange({ ...goal, kind: e.target.value as GoalKind })}
          aria-label={`Goal ${i + 1} kind`}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text hover:border-borderStrong focus:border-accent focus:outline-none sm:w-36"
        >
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      {topics.length > 0 && (
        <div>
          <Label hint="optional">Topics</Label>
          <TopicPicker idPrefix={id} topics={topics} value={goal.topics} onChange={(t) => onChange({ ...goal, topics: t })} />
        </div>
      )}
    </Card>
  );
}

export function GoalsScreen() {
  const router = useRouter();
  const { userId, confId } = useSession();
  const conf = useApi(apiKey("conference", confId), () => api.conference(confId));
  const plan = useApi(apiKey("plan", userId, confId), () => api.plan(userId, confId));
  const rec = useApi(apiKey("record", userId), () => api.record(userId));

  const [goals, setGoals] = useState<GoalDraft[]>([blank()]);
  const [problem, setProblem] = useState("");
  const [openTo, setOpenTo] = useState<OpenTo[]>(["learning"]);
  const [availOn, setAvailOn] = useState(false);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);
  const prefilledGoals = useRef<string | null>(null);
  const prefilledUser = useRef<string | null>(null);

  const tz = conf.data?.conference.timezone || TZ;

  // Prefill goals from the existing plan (there is no GET for goals).
  useEffect(() => {
    const key = `${userId}:${confId}`;
    if (!plan.data || touched.current || prefilledGoals.current === key) return;
    prefilledGoals.current = key;
    const existing = plan.data.byGoal.map((g) => g.goal).filter((g) => g.text).slice(0, 3);
    if (existing.length) setGoals(existing.map((g) => ({ text: g.text, kind: g.kind, topics: g.topics ?? [] })));
  }, [plan.data, userId, confId]);

  // Prefill open-to and availability from the user record.
  useEffect(() => {
    if (!rec.data || touched.current || prefilledUser.current === userId) return;
    prefilledUser.current = userId;
    const u = rec.data.user;
    if (u.openTo?.length) setOpenTo(u.openTo);
    if (u.availFrom && u.availTo) { setAvailOn(true); setFrom(hhmmIn(u.availFrom, tz)); setTo(hhmmIn(u.availTo, tz)); }
  }, [rec.data, userId, tz]);

  const edit = (fn: () => void) => { touched.current = true; fn(); };
  const validGoals = goals.filter((g) => g.text.trim().length >= 3);
  const goalError = submitted && validGoals.length === 0;
  const availError = availOn && from >= to;

  async function submit() {
    setSubmitted(true);
    if (validGoals.length === 0 || availError || !conf.data) return;
    setSaving(true);
    const day = conf.data.conference.startDate;
    try {
      await api.onboarding(userId, {
        confId,
        goals: validGoals.map((g) => ({ text: g.text.trim(), kind: g.kind, topics: g.topics.length ? g.topics : undefined })),
        problems: problem.trim() ? [problem.trim()] : [],
        openTo,
        name: rec.data?.user.name ? undefined : userId.charAt(0).toUpperCase() + userId.slice(1),
        availFrom: availOn ? zonedIso(day, from, tz) : null,
        availTo: availOn ? zonedIso(day, to, tz) : null,
      });
      toast.success("Planner built your day");
      void rec.reload();
      router.push("/plan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your goals");
      setSaving(false);
    }
  }

  if (!conf.data && !conf.error) return <div><Skeleton rows={1} rowClassName="h-10 w-2/3" className="mb-6" /><Skeleton rows={3} rowClassName="h-32" /></div>;
  if (conf.error && !conf.data) return <ErrorState what="this conference" detail={conf.error.message} onRetry={conf.reload} />;
  const c = conf.data!.conference;
  const topics = conf.data!.topics ?? [];
  const hadGoals = (plan.data?.byGoal.length ?? 0) > 0;

  return (
    <form className="mx-auto max-w-2xl" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <PageHeader
        eyebrow={c.name}
        title={hadGoals ? "Your goals" : "What do you want from this conference?"}
        subtitle={`${fmtConfDates(c)}${c.city ? ` · ${c.city}` : ""}. Planner builds your day from these.`}
      />

      <section>
        <SectionHeader title="Goals" count={goals.length} action={<span className="text-xs text-faint">Up to 3</span>} />
        <div className="flex flex-col gap-3">
          {goals.map((g, i) => (
            <GoalRow
              key={i}
              i={i}
              goal={g}
              topics={topics}
              showError={goalError && i === 0}
              onChange={(next) => edit(() => setGoals((gs) => gs.map((x, j) => (j === i ? next : x))))}
              onRemove={goals.length > 1 ? () => edit(() => setGoals((gs) => gs.filter((_, j) => j !== i))) : undefined}
            />
          ))}
        </div>
        {goalError && <p className="mt-2 text-xs text-danger" role="alert">Write at least one goal of 3 characters or more.</p>}
        {goals.length < 3 && (
          <Button variant="ghost" className="mt-2" onClick={() => edit(() => setGoals((gs) => [...gs, blank()]))}><Plus className="size-4" />Add a goal</Button>
        )}
      </section>

      <section className="mt-8">
        <Label htmlFor="problem" hint="optional">A problem your team has</Label>
        <Textarea
          id="problem"
          value={problem}
          onChange={(e) => edit(() => setProblem(e.target.value))}
          placeholder="Our agents fail silently in production and we can't see why."
          maxLength={400}
          rows={3}
        />
      </section>

      <section className="mt-8">
        <Label>Open to</Label>
        <div className="flex flex-wrap gap-1.5">
          {OPEN_TO.map((o) => {
            const on = openTo.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => edit(() => setOpenTo((v) => (on ? v.filter((x) => x !== o.value) : [...v, o.value])))}
                className={cn(
                  "inline-flex h-10 items-center rounded-md border px-3 text-sm transition duration-fast",
                  on ? "border-accent/50 bg-accent/10 text-accentStrong" : "border-border bg-surface text-muted hover:border-borderStrong hover:text-text",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <StatusLine className="mt-2">Other attendees see this when your plans overlap.</StatusLine>
      </section>

      <section className="mt-8">
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-text">
          <input type="checkbox" checked={availOn} onChange={(e) => edit(() => setAvailOn(e.target.checked))} className="size-4 accent-accent" />
          <Clock className="size-4 text-muted" aria-hidden />
          Only plan part of the first day
        </label>
        {availOn && (
          <div className="mt-2 flex flex-wrap items-end gap-3 pl-6">
            <div>
              <Label htmlFor="avail-from">From</Label>
              <Input id="avail-from" type="time" value={from} onChange={(e) => edit(() => setFrom(e.target.value))} className="w-32 [color-scheme:dark]" />
            </div>
            <div>
              <Label htmlFor="avail-to">To</Label>
              <Input id="avail-to" type="time" value={to} onChange={(e) => edit(() => setTo(e.target.value))} className={cn("w-32 [color-scheme:dark]", availError && "border-danger/60")} />
            </div>
            <StatusLine className="pb-3">Venue time{c.timezone ? ` (${c.timezone.split("/").pop()?.replace(/_/g, " ")})` : ""}</StatusLine>
            {availError && <p className="w-full text-xs text-danger" role="alert">End time must be after start time.</p>}
          </div>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" size="lg" loading={saving}><Sparkles className="size-4" />Build my plan</Button>
        {hadGoals && <Link href="/plan" className={buttonClass({ variant: "ghost", size: "lg" })}>Back to plan</Link>}
        {saving && <StatusLine>Planner is scoring {conf.data!.sessions.length.toLocaleString("en-US")} sessions</StatusLine>}
      </div>
    </form>
  );
}
