// Steer text → SteerOp[]. The LLM (structured output) is preferred; without a key, or if it fails, a small deterministic parser runs.
// Neither invents ids: `match` text is resolved against the graph later, goal ids must be the user's.
import { z } from "zod";
import { hasLLM, structured } from "@/lib/llm";
import type { GoalKind, SteerOp, TargetKind } from "@/lib/types";
import { lexicalMatch } from "@/lib/queries/steer";

export interface SteerContext {
  date: string; // "2026-10-24"
  offset: string; // "-07:00"
  now: string;
  window: { from: string | null; to: string | null };
  goals: { id: string; text: string; weight: number; topics: string[] }[];
  topics: string[];
}

// ---------- deterministic ----------

const TIME = String.raw`(noon|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)`;

/** "3pm", "3:30", "15:00", "noon" → ISO on the conference day. Bare hours 1–7 are pm (conference hours). */
export function parseTime(s: string, ctx: Pick<SteerContext, "date" | "offset">): string | null {
  const t = s.trim().toLowerCase();
  if (t === "noon") return `${ctx.date}T12:00:00${ctx.offset}`;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  else if (ap === "a" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 7) h += 12;
  if (h > 23 || min > 59) return null;
  return `${ctx.date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00${ctx.offset}`;
}

const addMin = (iso: string, minutes: number, offset: string) => {
  const d = new Date(new Date(iso).getTime() + minutes * 60_000);
  const m = offset.match(/([+-])(\d{2}):(\d{2})/);
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return `${new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19)}${offset}`;
};

const re = (s: string) => new RegExp(s, "i");

export function parseDeterministic(text: string, ctx: SteerContext): SteerOp[] {
  const ops: SteerOp[] = [];
  const window = { ...ctx.window };
  let windowTouched = false;
  const clauses = text.split(/[,;.]|\band\b|\bthen\b|\bbut\b/i).map((c) => c.trim()).filter(Boolean);
  for (const raw of clauses) {
    const c = raw.toLowerCase();
    let m: RegExpMatchArray | null;
    // booth time
    if ((m = c.match(/(\d+)\s*(?:min|mins|minutes|m)\b[^]*booth|booths?[^\d]*(\d+)\s*(?:min|mins|minutes|m)\b/))) {
      ops.push({ op: "booth_time", minutes: Number(m[1] ?? m[2]) });
      continue;
    }
    // blocks: "lunch 12-1", "meeting at 2", "busy 2:30 to 3"
    if ((m = c.match(re(String.raw`^(lunch|meeting|call|busy|break|block)\b.*?${TIME}(?:\s*(?:-|–|to|until)\s*${TIME})?`)))) {
      const from = parseTime(m[2], ctx);
      if (from) {
        const label = m[1] === "lunch" ? "lunch" : m[1] === "break" || m[1] === "block" ? "free" : "meeting";
        let to = m[3] ? parseTime(m[3], ctx) : addMin(from, label === "lunch" ? 60 : 30, ctx.offset);
        if (to && to <= from && m[3]) to = parseTime(`${m[3]}pm`, ctx); // "lunch 12-1"
        if (to && to > from) ops.push({ op: "block_time", from, to, label });
        continue;
      }
    }
    // window end: "leaving at 3pm", "until 4", "out by 5"
    if ((m = c.match(re(String.raw`\b(?:leav(?:e|ing)|until|till|done (?:at|by)|out by|gone (?:at|by|after)|head(?:ing)? out|stop(?:ping)? at|have to go)\b\s*(?:at|by|around|after)?\s*${TIME}`)))) {
      const t = parseTime(m[1], ctx);
      if (t) { window.to = t; windowTouched = true; continue; }
    }
    // window start: "free after 3pm", "arriving at 11", "starting at 10"
    if ((m = c.match(re(String.raw`\b(?:free after|free from|arriv(?:e|ing)|start(?:ing)?|get(?:ting)? (?:there|in)|available (?:from|after)|from|after)\b\s*(?:at|by|around)?\s*${TIME}`)))) {
      const t = parseTime(m[1], ctx);
      if (t) { window.from = t; windowTouched = true; continue; }
    }
    if (/\b(all day|whole day|reset (?:my )?(?:time|window|schedule))\b/.test(c)) {
      window.from = null; window.to = null; windowTouched = true; continue;
    }
    // goals
    if ((m = c.match(/^(?:add (?:a )?goal|new goal|goal:?|i want to|i'd like to|want to)\s*:?\s*(learn|meet|hire|find a job|buy)?\s*(?:about )?(.+)$/))) {
      const kind: GoalKind = m[1] === "meet" ? "meet" : m[1] === "hire" ? "hire" : m[1] === "find a job" ? "job" : m[1] === "buy" ? "buy" : "learn";
      const goalText = `${m[1] && m[1] !== "learn" ? m[1] + " " : ""}${m[2]}`.trim();
      if (goalText.length >= 3) ops.push({ op: "add_goal", text: goalText, kind });
      continue;
    }
    if ((m = c.match(/^(?:drop|remove|forget) (?:the |my )?goal\s*:?\s*(.+)$/))) {
      const g = ctx.goals.find((x) => lexicalMatch(m![1], x.text) || x.topics.some((t) => lexicalMatch(m![1], t)));
      if (g) ops.push({ op: "remove_goal", goalId: g.id });
      continue;
    }
    // pin: "pin the tracing talk", "must see X"
    if ((m = c.match(/^(?:pin|must see|must-see|definitely)\s+(?:the )?(.+)$/))) {
      ops.push({ op: "boost", kind: guessKind(m[1]), match: clean(m[1]) });
      continue;
    }
    // less X: lower a matching goal, else exclude
    if ((m = c.match(/^(?:less|fewer|not so much|lower priority on|deprioriti[sz]e)\s+(.+)$/))) {
      const g = ctx.goals.find((x) => lexicalMatch(clean(m![1]), x.text) || x.topics.some((t) => lexicalMatch(clean(m![1]), t)));
      if (g) ops.push({ op: "reweight_goal", goalId: g.id, weight: Math.max(0.1, Math.round(g.weight * 40) / 100) });
      else ops.push({ op: "exclude", kind: guessKind(m[1]), match: clean(m[1]) });
      continue;
    }
    if ((m = c.match(/^(?:skip|no|no more|avoid|exclude|drop|hide|not|without|nothing on|don't want)\s+(.+)$/))) {
      ops.push({ op: "exclude", kind: guessKind(m[1]), match: clean(m[1]) });
      continue;
    }
    if ((m = c.match(/^(?:more|more on|boost|focus on|prioriti[sz]e|extra|lots of)\s+(.+)$/))) {
      ops.push({ op: "boost", kind: guessKind(m[1]), match: clean(m[1]) });
      continue;
    }
  }
  if (windowTouched) ops.unshift({ op: "set_window", from: window.from, to: window.to });
  return ops;
}

/** Strip filler so "the tracing talks" → "tracing". */
const clean = (s: string) => s.replace(/\b(the|a|an|please|talks?|sessions?|stuff|booths?|stands?)\b/gi, " ").replace(/\s+/g, " ").trim();

function guessKind(s: string): TargetKind {
  if (/\b(booth|stand|expo)\b/i.test(s)) return "booth";
  if (/\b(talk|session|workshop|keynote|panel)\b/i.test(s)) return "session";
  return "topic";
}

// ---------- LLM ----------

const OpSchema = z.object({
  op: z.enum(["add_goal", "remove_goal", "reweight_goal", "set_window", "block_time", "booth_time", "exclude", "boost", "pin"]),
  text: z.string().nullable(),
  kind: z.enum(["learn", "meet", "hire", "job", "buy", "session", "person", "booth", "topic"]).nullable(),
  goalId: z.string().nullable(),
  weight: z.number().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  label: z.enum(["lunch", "meeting", "free"]).nullable(),
  minutes: z.number().nullable(),
  match: z.string().nullable(),
  targetId: z.string().nullable(),
});
const Schema = z.object({ ops: z.array(OpSchema) });
type RawOp = z.infer<typeof OpSchema>;

const SYSTEM = `You convert one line of conference steering text into plan operations. You never chat.
Ops (unused fields null):
- set_window {from, to}: ISO datetimes on the conference day or null. "leaving at 3pm" → to=15:00, keep the current from.
- block_time {from, to, label: lunch|meeting|free}
- booth_time {minutes}: minutes per booth visit
- reweight_goal {goalId, weight 0..1}: "less X" lowers the matching goal (e.g. ×0.4), "more X" raises it, only for an existing goal id
- add_goal {text, kind: learn|meet|hire|job|buy}; remove_goal {goalId}
- exclude / boost {kind: session|person|booth|topic, match}: match is the user's words (e.g. "tracing"), never an id
- pin {targetId}: only for an id the user typed
Prefer boost of a topic for "more X" and reweight_goal for "less X" when a goal matches, else exclude.
Use only goal ids from the list. If nothing actionable, return {"ops": []}.`;

export async function parseLLM(text: string, ctx: SteerContext): Promise<SteerOp[]> {
  const user = JSON.stringify({
    text, now: ctx.now, conferenceDay: ctx.date, utcOffset: ctx.offset, currentWindow: ctx.window,
    goals: ctx.goals.map((g) => ({ id: g.id, text: g.text, weight: g.weight, topics: g.topics })),
    topics: ctx.topics.slice(0, 80),
  });
  const out = await structured(Schema, SYSTEM, user, "steer_ops");
  return out.ops.map(toOp).filter((o): o is SteerOp => o !== null);
}

const TARGETS = new Set(["session", "person", "booth", "topic"]);
const GOAL_KINDS = new Set(["learn", "meet", "hire", "job", "buy"]);

function toOp(r: RawOp): SteerOp | null {
  switch (r.op) {
    case "add_goal": return r.text ? { op: "add_goal", text: r.text, kind: (GOAL_KINDS.has(r.kind ?? "") ? r.kind : "learn") as GoalKind } : null;
    case "remove_goal": return r.goalId ? { op: "remove_goal", goalId: r.goalId } : null;
    case "reweight_goal": return r.goalId && r.weight != null ? { op: "reweight_goal", goalId: r.goalId, weight: Math.min(1, Math.max(0, r.weight)) } : null;
    case "set_window": return { op: "set_window", from: r.from || null, to: r.to || null };
    case "block_time": return r.from && r.to ? { op: "block_time", from: r.from, to: r.to, label: r.label ?? "meeting" } : null;
    case "booth_time": return r.minutes && r.minutes > 0 ? { op: "booth_time", minutes: Math.round(r.minutes) } : null;
    case "exclude":
    case "boost": return r.match ? { op: r.op, kind: (TARGETS.has(r.kind ?? "") ? r.kind : "topic") as TargetKind, match: r.match } : null;
    case "pin": return r.targetId ? { op: "pin", targetId: r.targetId } : null;
  }
}

export async function parseSteer(text: string, ctx: SteerContext): Promise<SteerOp[]> {
  if (hasLLM()) {
    try {
      const ops = await parseLLM(text, ctx);
      if (ops.length) return ops;
    } catch (e) {
      console.warn("steer: LLM parse failed, using deterministic parser", e);
    }
  }
  return parseDeterministic(text, ctx);
}
