// Steer: text (or explicit ops) → resolved ops → graph writes → re-plan → diff + undo ops.
import type { GoalKind, PlanDiff, SteerOp, SteerResponse, TargetKind } from "@/lib/types";
import { NotFound, runPlanner } from "@/lib/agents/planner";
import { conferenceDay, userState } from "@/lib/queries/plan";
import {
  clearTargets, conferenceTopics, markTargets, removeGoal, resolveMatch, setBlocks, setBoothMinutes, setGoalWeight, setWindow,
  storeSteer, targetExists, targetMarks, topicsForText, upsertGoal,
} from "@/lib/queries/steer";
import { slug } from "@/lib/agents/scout/normalized";
import { parseSteer, parseTime, type SteerContext } from "./parse";

export const NOT_UNDERSTOOD = "Didn't catch that. Try 'leaving at 3pm' or 'more tracing'.";
const KINDS: TargetKind[] = ["topic", "session", "person", "booth"];

export async function runSteer(userId: string, confId: string, input: { text: string; ops?: SteerOp[]; now?: string }): Promise<SteerResponse> {
  const state = await userState(userId, confId);
  if (!state) throw new NotFound(`user ${userId} not found`);
  const now = input.now ?? new Date().toISOString();
  const day = await conferenceDay(confId);
  const date = (day.from ?? now).slice(0, 10);
  const offset = (day.from ?? now).match(/([+-]\d{2}:\d{2}|Z)$/)?.[1]?.replace("Z", "+00:00") ?? "-07:00";
  const ctx: SteerContext = {
    date, offset, now, window: { from: state.availFrom, to: state.availTo },
    goals: state.goals, topics: (await conferenceTopics(confId)).map((t) => t.name),
  };

  const parsed = input.ops ?? (input.text.trim() ? await parseSteer(input.text, ctx) : []);
  const ops = await resolve(parsed, confId, ctx, state.goals.map((g) => g.id), userId);
  if (!ops.length) {
    const { plan } = await runPlanner(userId, confId, { now, write: false });
    return { ops: [], diff: { added: [], removed: [], moved: [] }, summary: NOT_UNDERSTOOD, plan, undo: [] };
  }

  const undo = await apply(userId, confId, ops, state);
  const at = new Date().toISOString();
  await storeSteer(userId, { id: `steer-${userId}-${Date.parse(at)}`, text: input.text, ops, at });
  const { plan, diff } = await runPlanner(userId, confId, { now, write: true });
  return { ops, diff, summary: summarize(ops, diff, ctx), plan, undo: undo.reverse() };
}

// ---------- resolve ----------

const toIso = (s: string | null, ctx: SteerContext) => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) return /([+-]\d{2}:\d{2}|Z)$/.test(s) ? s : `${s.slice(0, 19)}${ctx.offset}`;
  return parseTime(s, ctx);
};

const derivedGoalId = (userId: string, text: string) => `g-${userId}-${slug(text).slice(0, 40)}`;

async function resolve(ops: SteerOp[], confId: string, ctx: SteerContext, goalIds: string[], userId: string): Promise<SteerOp[]> {
  const live = new Set(goalIds);
  const out: SteerOp[] = [];
  for (const op of ops) {
    switch (op.op) {
      case "exclude":
      case "boost": {
        if (op.resolvedIds?.length) { out.push(op); break; }
        let found: { kind: TargetKind; ids: string[] } | null = null;
        for (const k of [op.kind, ...KINDS.filter((x) => x !== op.kind)]) {
          const ids = await resolveMatch(k, op.match, confId);
          if (ids.length) { found = { kind: k, ids }; break; }
        }
        if (found) out.push({ ...op, kind: found.kind, resolvedIds: found.ids });
        break;
      }
      case "remove_goal":
        if (!live.has(op.goalId)) break;
        live.delete(op.goalId);
        out.push(op);
        break;
      case "reweight_goal":
        if (live.has(op.goalId)) out.push(op);
        break;
      case "pin":
        if (await targetExists(op.targetId)) out.push(op);
        break;
      case "set_window": {
        const from = toIso(op.from, ctx), to = toIso(op.to, ctx);
        if ((op.from && !from) || (op.to && !to)) break;
        out.push({ op: "set_window", from, to });
        break;
      }
      case "block_time":
      case "unblock_time": {
        const from = toIso(op.from, ctx), to = toIso(op.to, ctx);
        if (from && to && from < to) out.push({ ...op, from, to });
        break;
      }
      case "booth_time":
        if (op.minutes > 0 && op.minutes <= 120) out.push(op);
        break;
      case "add_goal":
        if (!op.text.trim()) break;
        out.push(op);
        live.add(op.goalId ?? derivedGoalId(userId, op.text));
        break;
      case "clear":
        if (op.targetIds.length) out.push(op);
        break;
    }
  }
  return out;
}

// ---------- apply (returns inverse ops) ----------

type State = NonNullable<Awaited<ReturnType<typeof userState>>>;

async function apply(userId: string, confId: string, ops: SteerOp[], state: State): Promise<SteerOp[]> {
  const undo: SteerOp[] = [];
  let window = { from: state.availFrom, to: state.availTo };
  let blocks: { from: string; to: string; label: string }[] = state.blocks ? JSON.parse(state.blocks) : [];
  let boothMinutes = state.boothMinutes;
  const goals = new Map(state.goals.map((g) => [g.id, g]));
  for (const op of ops) {
    switch (op.op) {
      case "set_window":
        undo.push({ op: "set_window", from: window.from, to: window.to });
        window = { from: op.from, to: op.to };
        await setWindow(userId, op.from, op.to);
        break;
      case "block_time": {
        const prev = blocks.find((b) => b.from === op.from && b.to === op.to);
        blocks = [...blocks.filter((b) => !(b.from === op.from && b.to === op.to)), { from: op.from, to: op.to, label: op.label }];
        // Returned undo is reversed, so the restore is pushed before the unblock and runs after it.
        if (prev) undo.push({ op: "block_time", from: prev.from, to: prev.to, label: prev.label as "lunch" | "meeting" | "free" });
        undo.push({ op: "unblock_time", from: op.from, to: op.to });
        await setBlocks(userId, blocks);
        break;
      }
      case "unblock_time": {
        const gone = blocks.filter((b) => Date.parse(b.from) === Date.parse(op.from) && Date.parse(b.to) === Date.parse(op.to));
        blocks = blocks.filter((b) => !gone.includes(b));
        gone.forEach((b) => undo.push({ op: "block_time", from: b.from, to: b.to, label: b.label as "lunch" | "meeting" | "free" }));
        await setBlocks(userId, blocks);
        break;
      }
      case "booth_time":
        undo.push({ op: "booth_time", minutes: boothMinutes ?? 10 });
        boothMinutes = op.minutes;
        await setBoothMinutes(userId, op.minutes);
        break;
      case "reweight_goal": {
        const g = goals.get(op.goalId);
        if (!g) break;
        undo.push({ op: "reweight_goal", goalId: g.id, weight: g.weight });
        g.weight = op.weight;
        await setGoalWeight(userId, op.goalId, op.weight);
        break;
      }
      case "remove_goal": {
        const g = goals.get(op.goalId);
        if (!g) break;
        undo.push({
          op: "add_goal", text: g.text, kind: g.kind as GoalKind, goalId: g.id, weight: g.weight,
          topics: g.topics.filter((t) => typeof t === "string" && t),
        });
        goals.delete(op.goalId);
        await removeGoal(userId, op.goalId);
        break;
      }
      case "add_goal": {
        const id = op.goalId ?? derivedGoalId(userId, op.text);
        const topics = op.topics ? op.topics.filter((t) => t) : await topicsForText(op.text, confId);
        const weight = op.weight ?? 1;
        await upsertGoal(userId, { id, text: op.text, kind: op.kind, weight, topics });
        goals.set(id, { id, text: op.text, kind: op.kind, weight, topics });
        undo.push({ op: "remove_goal", goalId: id });
        break;
      }
      case "exclude":
      case "boost":
      case "pin":
      case "clear": {
        const ids = op.op === "pin" ? [op.targetId] : op.op === "clear" ? op.targetIds : op.resolvedIds ?? [];
        undo.push(...restoreMarks(ids, await targetMarks(userId, ids)));
        if (op.op === "clear") await clearTargets(userId, ids);
        else await markTargets(userId, ids, op.op === "exclude" ? "skip" : op.op === "pin" ? "pin" : "boost");
        break;
      }
    }
  }
  return undo;
}

function restoreMarks(ids: string[], marks: { id: string; type: string; pinned: boolean }[]): SteerOp[] {
  const by = new Map(marks.map((m) => [m.id, m]));
  const out: SteerOp[] = [];
  const none = ids.filter((id) => !by.has(id));
  if (none.length) out.push({ op: "clear", targetIds: none });
  const skipped = marks.filter((m) => m.type === "SKIPPED").map((m) => m.id);
  if (skipped.length) out.push({ op: "exclude", kind: "topic", match: "", resolvedIds: skipped });
  const boosted = marks.filter((m) => m.type === "BOOSTED" && !m.pinned).map((m) => m.id);
  if (boosted.length) out.push({ op: "boost", kind: "topic", match: "", resolvedIds: boosted });
  marks.filter((m) => m.type === "BOOSTED" && m.pinned).forEach((m) => out.push({ op: "pin", targetId: m.id }));
  return out;
}

// ---------- summary ----------

const clock = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function summarize(ops: SteerOp[], diff: PlanDiff, ctx: SteerContext): string {
  const goalText = (id: string) => ctx.goals.find((g) => g.id === id)?.text ?? id;
  const what = ops.map((op) => {
    switch (op.op) {
      case "set_window": return op.to && op.from ? `${clock(op.from)}–${clock(op.to)}` : op.to ? `leaving at ${clock(op.to)}` : op.from ? `from ${clock(op.from)}` : "all day";
      case "block_time": return `${op.label} ${clock(op.from)}–${clock(op.to)}`;
      case "unblock_time": return `freed ${clock(op.from)}`;
      case "booth_time": return `${op.minutes} min per booth`;
      case "reweight_goal": return `${op.weight < (ctx.goals.find((g) => g.id === op.goalId)?.weight ?? 1) ? "less" : "more"} '${goalText(op.goalId)}'`;
      case "add_goal": return `new goal '${op.text}'`;
      case "remove_goal": return `dropped '${goalText(op.goalId)}'`;
      case "exclude": return op.match ? `no ${op.match}` : "restored";
      case "boost": return op.match ? `more ${op.match}` : "restored";
      case "pin": return "pinned";
      case "clear": return "undone";
    }
  }).join(", ");
  const count = (list: { type: string }[], sign: string) => {
    const by = new Map<string, number>();
    list.forEach((x) => by.set(x.type, (by.get(x.type) ?? 0) + 1));
    return [...by].map(([t, n]) => `${sign}${plural(n, t)}`);
  };
  const parts = [...count(diff.added, "+"), ...count(diff.removed, "−"), ...(diff.moved.length ? [`${plural(diff.moved.length, "move")}`] : [])];
  return `${parts.length ? parts.join(", ") : "No change"} (${what})`;
}
