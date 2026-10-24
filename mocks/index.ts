// Fixtures for every API route, typed against lib/types.ts.
// Routes return these when USE_MOCKS=true (or until the real handler lands).
// Demo story: Sam at Patch the Conference (ptc-2026), Oct 24 2026, PT.
import type {
  AddConferenceResponse, BriefResponse, Booth, CommunityResponse, ConferenceDetail, ConstellationResponse,
  CreateMomentResponse, Goal, IntrosResponse, MeetRequest, Moment, NetworkResponse, OnboardingResponse,
  PlanItem, PlanResponse, Problem, RecordResponse, SearchResponse, Session, SteerResponse, TripReportResponse,
  User, WhyPath,
} from "@/lib/types";

const CONF = "ptc-2026";
const T = (hhmm: string) => `2026-10-24T${hhmm}:00-07:00`;
const prov = { source: "https://www.wemakedevs.org/hackathons/ptc", collectedAt: "2026-10-24T16:00:00Z", via: "unlocker" as const };

export const sam: User = { id: "sam", name: "Sam Rivera", personId: "sam-rivera", openTo: ["job_hunting", "learning"], availFrom: null, availTo: null };
export const emily: User = { id: "emily", name: "Emily Chen", personId: "emily-chen@tensorgrid", openTo: ["hiring"] };

export const goals: Goal[] = [
  { id: "g-tracing", text: "fix agent tracing for my team", kind: "learn", weight: 1, topics: ["agent tracing", "observability"] },
  { id: "g-infra", text: "meet AI infra people", kind: "meet", weight: 0.8, topics: ["ai infrastructure"] },
  { id: "g-role", text: "open to a new role", kind: "job", weight: 0.5, topics: ["hiring"] },
];
export const problems: Problem[] = [
  { id: "pr-tracing", text: "We can't see why our agents fail in production", topics: ["agent tracing", "observability"] },
];

export const sessions: Session[] = [
  { id: "s-graphrag", conferenceId: CONF, title: "GraphRAG for agent memory", kind: "workshop", start: T("11:30"), end: T("12:15"), room: "Stage A", topics: ["graphrag", "agent memory"], speakers: [{ id: "jake-morales@falkordb", name: "Jake Morales", title: "DevRel", company: "FalkorDB" }], ...prov },
  { id: "s-tracing", conferenceId: CONF, title: "Tracing multi-agent systems end to end", kind: "talk", start: T("13:00"), end: T("13:30"), room: "Stage B", topics: ["agent tracing", "observability"], speakers: [{ id: "priya-nair@acmetrace", name: "Priya Nair", company: "Acme Trace" }], ...prov },
  { id: "s-scrape", conferenceId: CONF, title: "Live web data for agents", kind: "workshop", start: T("14:00"), end: T("14:45"), room: "Stage A", topics: ["web scraping", "agents"], speakers: [{ id: "lena-ortiz@brightdata", name: "Lena Ortiz", company: "Bright Data" }], ...prov },
  { id: "s-infra", conferenceId: CONF, title: "Running inference at scale", kind: "talk", start: T("15:00"), end: T("15:30"), room: "Stage B", topics: ["ai infrastructure"], speakers: [{ id: "jake-morales@falkordb", name: "Jake Morales", company: "FalkorDB" }], ...prov },
];

export const booths: Booth[] = [
  { id: "b-acme", conferenceId: CONF, companyId: "acmetrace.dev", label: "Booth 14", hall: "Expo", order: 14, company: { id: "acmetrace.dev", name: "Acme Trace", description: "Open-source tracing for LLM agents. Captures every tool call and model step as a span.", topics: ["agent tracing", "observability"], ...prov } },
  { id: "b-falkor", conferenceId: CONF, companyId: "falkordb.com", label: "Booth 2", hall: "Expo", order: 2, company: { id: "falkordb.com", name: "FalkorDB", description: "Low-latency graph database with vector search, built for GraphRAG.", topics: ["graph database", "graphrag"], ...prov } },
];

const why = (id: string, text: string, ...names: [string, any, string][]): WhyPath => ({
  id, text,
  nodes: names.map(([nid, label, name]) => ({ id: nid, label, name })),
  edges: names.slice(1).map(([nid], i) => ({ from: names[i][0], to: nid, type: "ABOUT" as const })),
});

const pSessTracing = why("p1", "Matches your goal 'fix agent tracing' via topic Agent tracing", ["g-tracing", "Goal", "fix agent tracing"], ["agent tracing", "Topic", "Agent tracing"], ["s-tracing", "Session", "Tracing multi-agent systems"]);
const pBoothAcme = why("p2", "Acme Trace offers agent tracing, your team's problem. You met their engineer Mike at lunch.", ["pr-tracing", "Problem", "agents fail in prod"], ["agent tracing", "Topic", "Agent tracing"], ["acmetrace.dev", "Company", "Acme Trace"], ["mike-okafor@acmetrace", "Person", "Mike Okafor"]);
const pJake = why("p3", "Jake speaks on AI infrastructure. You met him at AI Engineer Summit in June.", ["g-infra", "Goal", "meet AI infra people"], ["ai infrastructure", "Topic", "AI infrastructure"], ["s-infra", "Session", "Running inference at scale"], ["jake-morales@falkordb", "Person", "Jake Morales"]);
const pGraph = why("p4", "Matches your goal 'fix agent tracing' via topic Agent memory", ["g-tracing", "Goal", "fix agent tracing"], ["agent memory", "Topic", "Agent memory"], ["s-graphrag", "Session", "GraphRAG for agent memory"]);

const item = (type: PlanItem["type"], id: string, title: string, subtitle: string, goalId: string, score: number, w: WhyPath, extra: Partial<PlanItem> = {}): PlanItem =>
  ({ type, id, title, subtitle, goalId, score, status: "planned", why: [w], collectedAt: prov.collectedAt, source: prov.source, ...extra });

const iGraph = item("session", "s-graphrag", "GraphRAG for agent memory", "Stage A", "g-tracing", 1.6, pGraph, { session: sessions[0], status: "done" });
const iTracing = item("session", "s-tracing", "Tracing multi-agent systems end to end", "Stage B", "g-tracing", 2.1, pSessTracing, { session: sessions[1] });
const iInfra = item("session", "s-infra", "Running inference at scale", "Stage B", "g-infra", 1.3, pJake, { session: sessions[3] });
const iAcme = item("booth", "b-acme", "Acme Trace", "Booth 14", "g-tracing", 1.9, pBoothAcme, { booth: booths[0] });
const iJake = item("person", "jake-morales@falkordb", "Jake Morales", "DevRel @ FalkorDB", "g-infra", 1.5, pJake, { person: { id: "jake-morales@falkordb", name: "Jake Morales", title: "DevRel", company: "FalkorDB" } });
const iEmily = item("person", "emily-chen@tensorgrid", "Emily Chen", "Eng Manager @ TensorGrid (hiring)", "g-role", 1.2,
  why("p5", "Emily is hiring and shares your AI infra goal", ["g-role", "Goal", "open to a new role"], ["hiring", "Topic", "Hiring"], ["emily-chen@tensorgrid", "Person", "Emily Chen"]),
  { person: { id: "emily-chen@tensorgrid", name: "Emily Chen", title: "Engineering Manager", company: "TensorGrid", userId: "emily", openTo: ["hiring"] } });

export const plan: PlanResponse = {
  confId: CONF, userId: "sam", generatedAt: "2026-10-24T18:00:00Z",
  itinerary: [
    { from: T("11:30"), to: T("12:15"), item: iGraph },
    { from: T("12:15"), to: T("12:25"), item: iAcme },
    { from: T("13:00"), to: T("13:30"), item: iTracing },
    { from: T("15:00"), to: T("15:30"), item: iInfra },
  ],
  byGoal: [
    { goal: goals[0], sessions: [iTracing, iGraph], people: [], booths: [iAcme] },
    { goal: goals[1], sessions: [iInfra], people: [iJake], booths: [] },
    { goal: goals[2], sessions: [], people: [iEmily], booths: [] },
  ],
};

export const steer: SteerResponse = {
  ops: [{ op: "set_window", from: null, to: T("15:00") }, { op: "reweight_goal", goalId: "g-role", weight: 0.2 }],
  diff: { added: [], removed: [{ id: "s-infra", title: "Running inference at scale", type: "session" }], moved: [] },
  summary: "−1 session (leaving at 3pm)",
  plan: { ...plan, itinerary: plan.itinerary.slice(0, 3) },
};

export const moments: Moment[] = [
  { id: "m1", userId: "sam", conferenceId: CONF, kind: "checkin", at: T("11:32"), shared: false, targetId: "s-graphrag", targetTitle: "GraphRAG for agent memory", topics: ["graphrag"] },
  { id: "m2", userId: "sam", conferenceId: CONF, kind: "note", at: T("11:50"), text: "Store tool calls as edges, not logs. Query the failure path.", shared: true, targetId: "s-graphrag", targetTitle: "GraphRAG for agent memory", topics: ["agent memory", "agent tracing"] },
  { id: "m3", userId: "sam", conferenceId: CONF, kind: "met", at: T("12:40"), shared: false, personId: "mike-okafor@acmetrace", text: "Mike, Acme Trace, lunch", topics: ["agent tracing"] },
];

export const createMoment: CreateMomentResponse = { moment: moments[1], lit: ["m2", "s-graphrag", "g-tracing"] };

export const constellation: ConstellationResponse = {
  nodes: [
    { id: "sam", type: "user", label: "Sam", state: "anchor" },
    { id: CONF, type: "conference", label: "Patch the Conference", state: "anchor", conferenceId: CONF },
    ...goals.map((g) => ({ id: g.id, type: "goal" as const, label: g.text, state: "anchor" as const, goalId: g.id })),
    { id: "pr-tracing", type: "problem", label: "agents fail in prod", state: "anchor", goalId: "g-tracing" },
    { id: "s-graphrag", type: "session", label: "GraphRAG for agent memory", state: "done", goalId: "g-tracing", at: T("11:32"), conferenceId: CONF },
    { id: "s-tracing", type: "session", label: "Tracing multi-agent systems", state: "planned", goalId: "g-tracing", conferenceId: CONF },
    { id: "s-infra", type: "session", label: "Running inference at scale", state: "planned", goalId: "g-infra", conferenceId: CONF },
    { id: "b-acme", type: "booth", label: "Booth 14 · Acme Trace", state: "planned", goalId: "g-tracing", conferenceId: CONF },
    { id: "jake-morales@falkordb", type: "person", label: "Jake Morales", state: "planned", goalId: "g-infra" },
    { id: "mike-okafor@acmetrace", type: "person", label: "Mike Okafor", state: "unplanned", goalId: "g-tracing", at: T("12:40") },
    { id: "m2", type: "moment", label: "note", state: "done", at: T("11:50"), goalId: "g-tracing" },
    { id: "emily", type: "user", label: "Emily", state: "planned", isOtherUser: true, goalId: "g-role" },
    { id: "s-scrape", type: "session", label: "Live web data for agents", state: "dust", conferenceId: CONF },
  ],
  links: [
    { source: "sam", target: "g-tracing", type: "HAS_GOAL" }, { source: "sam", target: "g-infra", type: "HAS_GOAL" }, { source: "sam", target: "g-role", type: "HAS_GOAL" },
    { source: "sam", target: "pr-tracing", type: "HAS_PROBLEM" },
    { source: "g-tracing", target: "s-graphrag", type: "PLANS" }, { source: "g-tracing", target: "s-tracing", type: "PLANS" },
    { source: "pr-tracing", target: "b-acme", type: "PLANS" }, { source: "g-infra", target: "s-infra", type: "PLANS" },
    { source: "s-infra", target: "jake-morales@falkordb", type: "SPEAKS_AT" }, { source: "b-acme", target: "mike-okafor@acmetrace", type: "WORKS_AT" },
    { source: "m2", target: "s-graphrag", type: "AT" }, { source: "emily", target: "s-graphrag", type: "PLANS" },
    { source: "sam", target: CONF, type: "ATTENDS" },
  ],
  coverage: [{ goalId: "g-tracing", covered: 2, planned: 4 }, { goalId: "g-infra", covered: 0, planned: 2 }, { goalId: "g-role", covered: 0, planned: 1 }],
};

export const brief: BriefResponse = {
  generatedAt: "2026-10-24T22:00:00Z", precomputed: true,
  paths: [pGraph, pBoothAcme, pJake, pSessTracing],
  sections: [
    { title: "What you learned", lines: [{ text: "Store agent tool calls as graph edges so you can query the failure path.", pathId: "p4" }] },
    { title: "Follow up with", lines: [{ text: "Mike Okafor at Acme Trace: their tracer covers your team's agent failures.", pathId: "p2" }] },
    { title: "For your team's problem", lines: [{ text: "Booth 14 (Acme Trace) traces every tool call as a span.", pathId: "p2" }] },
    { title: "Seen before", lines: [{ text: "You met Jake Morales at AI Engineer Summit in June; he spoke on AI infra today.", pathId: "p3" }] },
  ],
};

export const tripReport: TripReportResponse = {
  paths: brief.paths,
  markdown: "# Trip report: Patch the Conference\n\n## Top takeaways\n- Store agent tool calls as graph edges.\n\n## Vendors worth a follow-up\n- Acme Trace (Booth 14): agent tracing.\n\n## Contacts\n- Mike Okafor, Acme Trace\n- Emily Chen, TensorGrid\n\n## Recommended next steps\n- Trial Acme Trace on our agent pipeline.\n",
};

export const meetRequest: MeetRequest = {
  id: "meet-1", fromUserId: "sam", toUserId: "emily", fromName: "Sam Rivera", toName: "Emily Chen",
  note: "Catch up after Jake's talk?", proposal: { sessionId: "s-infra" }, status: "pending", at: T("13:40"),
};

export const network: NetworkResponse = {
  users: [{ user: emily, overlap: 2, shared: [{ id: "s-graphrag", title: "GraphRAG for agent memory", type: "session" }, { id: "b-acme", title: "Acme Trace", type: "booth" }], sharedTopics: ["ai infrastructure"], freeSlots: [{ from: T("14:00"), to: T("14:30") }] }],
  incoming: [], outgoing: [meetRequest],
};

export const intros: IntrosResponse = {
  intros: [
    { kind: "warm_intro", text: "Emily, who you met today, was at Jake's workshop; Jake speaks on your problem at 3pm.", person: { id: "jake-morales@falkordb", name: "Jake Morales" }, via: { id: "emily-chen@tensorgrid", name: "Emily Chen" }, path: pJake },
    { kind: "met_before", text: "You met Jake at AI Engineer Summit in June.", person: { id: "jake-morales@falkordb", name: "Jake Morales" }, path: pJake },
  ],
};

export const community: CommunityResponse = {
  session: sessions[0], myMoments: [moments[0], moments[1]],
  sharedNotes: [{ ...moments[1], author: "Sam Rivera" }, { id: "m-x1", userId: "u-ana", conferenceId: CONF, kind: "note", at: T("11:52"), text: "Cypher path queries as the debugger.", shared: true, targetId: "s-graphrag", topics: ["graphrag"], author: "Ana Lopez" }],
  crowdSummary: { updatedAt: "2026-10-24T19:00:00Z", lines: [{ text: "Attendees noted storing tool calls as edges makes failures queryable.", momentId: "m2" }] },
  hotMoments: [{ binStart: T("11:48"), count: 5 }, { binStart: T("11:50"), count: 9 }, { binStart: T("11:52"), count: 3 }],
};

export const conferenceDetail: ConferenceDetail = {
  conference: { id: CONF, name: "Patch the Conference", url: "https://www.wemakedevs.org/hackathons/ptc", startDate: "2026-10-24", endDate: "2026-10-24", city: "San Francisco", ...prov },
  sessions, booths, topics: ["agent tracing", "observability", "graphrag", "agent memory", "ai infrastructure", "web scraping"],
};

export const addConference: AddConferenceResponse = { conference: conferenceDetail.conference, counts: { sessions: 4, people: 3, companies: 2, booths: 2 }, cached: false };
export const onboarding: OnboardingResponse = { goals, problems };
export const search: SearchResponse = { sessions: [sessions[1]], booths: [booths[0]], people: [] };
export const record: RecordResponse = {
  user: sam,
  conferences: [
    { conference: conferenceDetail.conference, sessions: 3, people: 2, moments: 6, hasBrief: true, hasTrip: true },
    { conference: { id: "ai-eng-summit-2026", name: "AI Engineer Summit", url: "https://www.ai.engineer", startDate: "2026-06-03", endDate: "2026-06-05", city: "San Francisco" }, sessions: 4, people: 1, moments: 2, hasBrief: true, hasTrip: false },
  ],
};
