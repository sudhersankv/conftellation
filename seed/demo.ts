// Builds the demo graph. Used by `npm run seed` and by tests (against the _test graph).
import { readFileSync } from "node:fs";
import path from "node:path";
import { graph } from "@/lib/falkor";
import { ensureIndexes } from "@/lib/schema";
import { upsertConference } from "@/lib/agents/scout/upsert";
import { rainfocusToNormalized, type RainFocusExhibitor, type RainFocusSlimSession } from "@/lib/agents/scout/adapters/rainfocus";
import type { NormalizedConference } from "@/lib/agents/scout/normalized";
import { seedPersonal } from "./personal";
import { runPlanner } from "@/lib/agents/planner";
import { precomputeRecaps } from "@/lib/agents/recapper";
import { precomputeCrowds } from "@/lib/agents/recapper/crowd";
import { sessionsWithSharedMoments } from "@/lib/queries/community";

const dir = path.join(process.cwd(), "seed");
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(dir, rel), "utf8")) as T;

export const loadPtc = () => readJson<NormalizedConference>("ptc.json");
export const loadJune = () => readJson<NormalizedConference>("ai-eng-summit-june.json");

export function loadGithubUniverse(): NormalizedConference {
  const sessions = readJson<RainFocusSlimSession[]>("raw/github-universe-2026-sessions.slim.json");
  const exhibitors = readJson<RainFocusExhibitor[]>("raw/github-universe-2026-sponsors.json");
  const dates = sessions.flatMap((s) => s.times?.map((t) => t.utcStartTime.slice(0, 10).replace(/\//g, "-")) ?? []).sort();
  return rainfocusToNormalized({
    conference: { id: "github-universe-2026", name: "GitHub Universe 2026", url: "https://githubuniverse.com", startDate: dates[0], endDate: dates[dates.length - 1], city: "San Francisco", timezone: "America/Los_Angeles" },
    sessions, exhibitors,
    source: "https://reg.githubuniverse.com/flow/github/universe26/attendee-portal/page/sessioncatalog",
    collectedAt: "2026-10-24T18:40:00Z",
    timeZone: "America/Los_Angeles",
    idPrefix: "ghu26",
  });
}

export async function wipe() {
  try {
    await (await graph()).delete();
  } catch (e) {
    if (!/empty key|invalid graph|not exist|no such/i.test(String(e))) throw e;
  }
}

export async function seedDemo(opts: { githubUniverse?: boolean; log?: (s: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  await wipe();
  await ensureIndexes();
  log("indexes ok");
  const ptc = loadPtc();
  const r1 = await upsertConference(ptc);
  log(`ptc-2026: ${JSON.stringify(r1.counts)}`);
  const r2 = await upsertConference(loadJune());
  log(`ai-eng-summit-2026: ${JSON.stringify(r2.counts)}`);
  if (opts.githubUniverse !== false) {
    const r3 = await upsertConference(loadGithubUniverse());
    log(`github-universe-2026: ${JSON.stringify(r3.counts)}`);
  }
  const p = await seedPersonal(ptc);
  log(`personal: ${JSON.stringify(p)}`);
  const { plan } = await runPlanner("sam", "ptc-2026", { write: true, now: process.env.DEMO_NOW ?? "2026-10-24T12:30:00-07:00" });
  log(`plan(sam): ${plan.itinerary.length} slots`);
  if (process.env.DEMO_MODE === "true") log(`recaps(sam): ${JSON.stringify(await precomputeRecaps("sam", "ptc-2026"))}`);
  if (process.env.DEMO_MODE === "true") {
    const ids = await sessionsWithSharedMoments("ptc-2026");
    const sessions = ptc.sessions.filter((s) => s.id && ids.includes(s.id)).map((s) => ({ id: s.id!, title: s.title, conferenceId: "ptc-2026" }));
    log(`crowd summaries: ${await precomputeCrowds(sessions)}`);
  }
}
