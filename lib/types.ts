// THE CONTRACT. Shared by API routes (backend) and screens (UI).
// Change only via a PR that also updates mocks/ and a note in COMMS.md.

// ---------- Graph primitives ----------

export type NodeLabel =
  | "Conference" | "Session" | "Person" | "Company" | "Booth" | "Topic"
  | "User" | "Goal" | "Problem" | "Moment" | "Steer" | "Meet" | "Summary";

export type EdgeType =
  | "HAS_SESSION" | "SPEAKS_AT" | "ABOUT" | "WORKS_AT" | "SPONSORS" | "HAS_BOOTH"
  | "OFFERS" | "SENTIMENT" | "IS" | "ATTENDS" | "HAS_GOAL" | "HAS_PROBLEM" | "PLANS"
  | "SKIPPED" | "BOOSTED" | "STEERED" | "CAPTURED" | "AT" | "MET" | "MENTIONS"
  | "DURING" | "REQUESTED_MEET" | "SHARED_WITH" | "HAS_SUMMARY";

export type Via = "studio" | "unlocker" | "serp" | "scraper-api" | "sessionize" | "sched" | "rainfocus" | "ics" | "seed" | "user";

/** Every scraped node carries this. Cards show "collected Xh ago". */
export interface Provenance {
  source: string;      // URL
  collectedAt: string; // ISO
  via: Via;
}

/** A "why": a real graph path. The UI renders `text` and highlights nodes/edges in the Sky. */
export interface WhyPath {
  id: string; // stable within a response, e.g. "p3"
  text: string; // one human sentence built from the path, e.g. "Matches your goal 'agent tracing' via topic Tracing"
  nodes: { id: string; label: NodeLabel; name: string }[];
  edges: { from: string; to: string; type: EdgeType }[];
}

// ---------- Shared conference layer ----------

export interface Conference extends Partial<Provenance> {
  id: string; // slug
  name: string;
  url: string;
  startDate: string; // ISO date
  endDate: string;
  city?: string;
}

export type SessionKind = "talk" | "workshop" | "keynote" | "panel" | "other";

export interface PersonRef { id: string; name: string; title?: string; company?: string }

export interface Session extends Partial<Provenance> {
  id: string;
  conferenceId: string;
  title: string;
  abstract?: string;
  kind: SessionKind;
  start: string; // ISO datetime
  end: string;
  room?: string;
  url?: string;
  topics: string[];
  speakers: PersonRef[];
}

export interface Person extends Partial<Provenance> {
  id: string; // slug(name)@companySlug
  name: string;
  title?: string;
  company?: string;
  companyId?: string;
  bio?: string;
  links?: string[];
  userId?: string; // set if this person is also a Conftellations user
  openTo?: OpenTo[];
}

export interface Company extends Partial<Provenance> {
  id: string; // domain or slug
  name: string;
  description?: string; // 1-2 sentences "what they do"
  website?: string;
  sponsorTier?: string;
  topics: string[];
}

export interface Booth {
  id: string;
  conferenceId: string;
  companyId: string;
  company: Company;
  label: string; // "Booth 14"
  hall?: string;
  order?: number; // walking order
}

// ---------- Personal layer ----------

export type OpenTo = "hiring" | "job_hunting" | "buying" | "learning";
export type GoalKind = "learn" | "meet" | "hire" | "job" | "buy";

export interface Goal { id: string; text: string; kind: GoalKind; weight: number; topics: string[] }
export interface Problem { id: string; text: string; topics: string[] }

export interface User {
  id: string;
  name: string;
  personId?: string;
  availFrom?: string | null;
  availTo?: string | null;
  openTo: OpenTo[];
}

export type MomentKind = "checkin" | "note" | "photo" | "met" | "voice";

export interface Moment {
  id: string;
  userId: string;
  conferenceId: string;
  kind: MomentKind;
  at: string; // ISO
  text?: string;
  mediaUrl?: string;
  shared: boolean;
  targetId?: string; // Session or Booth it attached to
  targetTitle?: string;
  personId?: string; // for "met"
  topics: string[];
}

export type MeetStatus = "pending" | "accepted" | "declined" | "countered";

export interface MeetProposal { sessionId?: string; slot?: { from: string; to: string }; place?: string }

export interface MeetRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  note: string;
  proposal: MeetProposal;
  status: MeetStatus;
  at: string;
}

// ---------- Plan ----------

export type PlanItemType = "session" | "person" | "booth" | "meet" | "block";
export type PlanStatus = "planned" | "done" | "skipped";

export interface PlanItem {
  type: PlanItemType;
  id: string;
  title: string; // session title / person name / company name / block label
  subtitle?: string; // room / role @ company / booth label
  goalId?: string;
  score: number;
  status: PlanStatus;
  why: WhyPath[]; // at least one for session/person/booth
  collectedAt?: string;
  source?: string;
  session?: Session;
  person?: Person;
  booth?: Booth;
}

export interface ItinerarySlot { from: string; to: string; item: PlanItem }

export interface GoalPlan { goal: Goal; sessions: PlanItem[]; people: PlanItem[]; booths: PlanItem[] }

export interface PlanResponse {
  confId: string;
  userId: string;
  itinerary: ItinerarySlot[]; // time-ordered
  byGoal: GoalPlan[];
  generatedAt: string;
}

// ---------- Steering & feedback ----------

export type TargetKind = "session" | "person" | "booth" | "topic";

export type SteerOp =
  | { op: "add_goal"; text: string; kind: GoalKind }
  | { op: "remove_goal"; goalId: string }
  | { op: "reweight_goal"; goalId: string; weight: number }
  | { op: "set_window"; from: string | null; to: string | null }
  | { op: "block_time"; from: string; to: string; label: "lunch" | "meeting" | "free" }
  | { op: "booth_time"; minutes: number }
  | { op: "exclude"; kind: TargetKind; match: string; resolvedIds?: string[] }
  | { op: "boost"; kind: TargetKind; match: string; resolvedIds?: string[] }
  | { op: "pin"; targetId: string };

export interface PlanDiff {
  added: { id: string; title: string; type: PlanItemType }[];
  removed: { id: string; title: string; type: PlanItemType }[];
  moved: { id: string; title: string; type: PlanItemType; from: string; to: string }[];
}

export interface SteerRequest { confId: string; text: string }
export interface SteerResponse { ops: SteerOp[]; diff: PlanDiff; summary: string; plan: PlanResponse }

export interface FeedbackRequest { confId: string; targetId: string; kind: "skip" | "boost" }

// ---------- Constellation (Sky) ----------

export type SkyNodeType =
  | "goal" | "problem" | "session" | "person" | "company" | "booth"
  | "moment" | "user" | "conference" | "topic" | "meet";

/** planned = dim outline, done = lit, unplanned = bright, skipped = hidden, dust = faint background */
export type SkyNodeState = "planned" | "done" | "unplanned" | "skipped" | "dust" | "anchor";

export interface SkyNode {
  id: string;
  type: SkyNodeType;
  label: string;
  state: SkyNodeState;
  goalId?: string; // cluster
  at?: string; // replay order
  conferenceId?: string;
  isOtherUser?: boolean;
}

export interface SkyLink { source: string; target: string; type: EdgeType }

export interface ConstellationResponse {
  nodes: SkyNode[];
  links: SkyLink[];
  coverage: { goalId: string; covered: number; planned: number }[];
}

// ---------- Brief / writing ----------

export interface BriefLine { text: string; pathId: string }
export interface BriefSection { title: string; lines: BriefLine[] }
export interface BriefResponse { sections: BriefSection[]; paths: WhyPath[]; generatedAt: string; precomputed: boolean }
export interface TripReportResponse { markdown: string; paths: WhyPath[] }

// ---------- Intros / network ----------

export interface WarmIntro { kind: "warm_intro" | "met_before"; text: string; person: Person; via?: Person; path: WhyPath }
export interface IntrosResponse { intros: WarmIntro[] }

export interface NetworkUser {
  user: User;
  overlap: number;
  shared: { id: string; title: string; type: "session" | "booth" }[];
  sharedTopics: string[];
  freeSlots: { from: string; to: string }[];
}
export interface NetworkResponse { users: NetworkUser[]; incoming: MeetRequest[]; outgoing: MeetRequest[] }

export interface MeetRequestBody { toUserId: string; note: string; proposal: MeetProposal }
export interface MeetRespondBody { action: "accept" | "decline" | "counter"; proposal?: MeetProposal }

// ---------- Session community ----------

export interface CommunityResponse {
  session: Session;
  myMoments: Moment[];
  sharedNotes: (Moment & { author: string })[];
  crowdSummary: { lines: { text: string; momentId: string }[]; updatedAt: string } | null;
  hotMoments: { binStart: string; count: number }[]; // 2-minute bins
}

// ---------- Conferences / onboarding / search / record ----------

export interface AddConferenceRequest { url: string }
export interface AddConferenceResponse {
  conference: Conference;
  counts: { sessions: number; people: number; companies: number; booths: number };
  cached: boolean; // true if already in the shared layer
}

export interface ConferenceDetail { conference: Conference; sessions: Session[]; booths: Booth[]; topics: string[] }

export interface OnboardingRequest {
  confId: string;
  goals: { text: string; kind: GoalKind; topics?: string[] }[];
  problems: string[];
  openTo: OpenTo[];
}
export interface OnboardingResponse { goals: Goal[]; problems: Problem[] }

export interface SearchResponse { sessions: Session[]; booths: Booth[]; people: Person[] }

export interface CreateMomentResponse { moment: Moment; lit: string[] } // node ids that should light up in Sky

export interface RecordConference {
  conference: Conference;
  sessions: number;
  people: number;
  moments: number;
  hasBrief: boolean;
  hasTrip: boolean;
}
export interface RecordResponse { user: User; conferences: RecordConference[] }

export interface ApiError { error: string }
