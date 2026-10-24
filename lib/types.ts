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

export type Via = "studio" | "unlocker" | "serp" | "scraper-api" | "sessionize" | "sched" | "rainfocus" | "ics" | "web" | "seed" | "user";

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
  edges: { from: string; to: string; type: EdgeType }[]; // highlight by from/to; real paths use any EdgeType (mocks only use ABOUT)
}

// ---------- Shared conference layer ----------

export interface Conference extends Partial<Provenance> {
  id: string; // slug
  name: string;
  url: string;
  startDate: string; // ISO date
  endDate: string;
  city?: string;
  timezone?: string; // IANA venue zone, e.g. "America/Denver"
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
  /** Where a capture with no explicit target would attach right now (Capture "Now: {title}"). Same rule the backend uses: latest check-in, else the planned session containing now. */
  now?: { targetId: string; title: string; type: "session" | "booth"; from?: string; to?: string } | null;
}

// ---------- Steering & feedback ----------

export type TargetKind = "session" | "person" | "booth" | "topic";

export type SteerOp =
  | { op: "add_goal"; text: string; kind: GoalKind; goalId?: string; weight?: number; topics?: string[] }
  | { op: "remove_goal"; goalId: string }
  | { op: "reweight_goal"; goalId: string; weight: number }
  | { op: "set_window"; from: string | null; to: string | null }
  | { op: "block_time"; from: string; to: string; label: "lunch" | "meeting" | "free" }
  | { op: "booth_time"; minutes: number }
  | { op: "exclude"; kind: TargetKind; match: string; resolvedIds?: string[] }
  | { op: "boost"; kind: TargetKind; match: string; resolvedIds?: string[] }
  | { op: "pin"; targetId: string }
  /** Undo-only ops (the backend emits them in `SteerResponse.undo`). */
  | { op: "unblock_time"; from: string; to: string }
  | { op: "clear"; targetIds: string[] };

export interface PlanDiff {
  added: { id: string; title: string; type: PlanItemType }[];
  removed: { id: string; title: string; type: PlanItemType }[];
  moved: { id: string; title: string; type: PlanItemType; from: string; to: string }[];
}

/** `ops` present → applied directly, the LLM is skipped (Undo sends `SteerResponse.undo` back here). */
export interface SteerRequest { confId: string; text: string; ops?: SteerOp[] }
/** `ops: []` means the text wasn't understood: show `summary` as a hint (e.g. "Didn't catch that. Try 'leaving at 3pm'."), plan unchanged.
 *  `undo`: ops that revert this steer; send them as `SteerRequest.ops` for the toast's Undo. */
export interface SteerResponse { ops: SteerOp[]; diff: PlanDiff; summary: string; plan: PlanResponse; undo?: SteerOp[] }

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
  conferenceId?: string; // primary conference (newest, unless a stronger state came from another)
  conferenceIds?: string[]; // set when this id belongs to more than one attended conference
  isOtherUser?: boolean;
  fit?: number; // 0..1 magnitude (normalised plan score); UI uses 0.5 when absent
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

/** `userId` (optional): the acting user; when set it must equal the sender in the URL. */
export interface MeetRequestBody { toUserId: string; note: string; proposal: MeetProposal; userId?: string }
/** `userId`: the acting user (else `x-user-id` header or the `ptc_user` cookie). Required by the API: 401 without one, 403 if not allowed. */
export interface MeetRespondBody { action: "accept" | "decline" | "counter"; proposal?: MeetProposal; userId?: string }

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

export interface ConferenceDetail {
  conference: Conference; sessions: Session[]; booths: Booth[]; topics: string[];
  /** Every sponsor/exhibitor (with or without a booth), tier order; enriched ones carry `description` + `via:"unlocker"`. */
  sponsors?: Company[];
}

export interface OnboardingRequest {
  confId: string;
  goals: { text: string; kind: GoalKind; topics?: string[] }[];
  problems: string[];
  openTo: OpenTo[];
  name?: string; // display name for a new user
  availFrom?: string | null; // ISO; null/omitted = whole day
  availTo?: string | null;
}
export interface OnboardingResponse { goals: Goal[]; problems: Problem[] }

export interface SearchResponse { sessions: Session[]; booths: Booth[]; people: Person[] }

/** Fields of the multipart body for POST /api/users/:id/moments. Build it with `momentForm()` from lib/client.ts. */
export interface CreateMomentFields {
  confId: string;
  kind: MomentKind;
  text?: string;
  file?: Blob; // photo
  targetId?: string; // omit → attaches by time (see PlanResponse.now)
  personId?: string; // "met": existing person
  newPersonName?: string; // "met": new person
  newPersonCompany?: string;
  shared?: boolean;
  clientId?: string; // [A-Za-z0-9_-]{1,80}; becomes the Moment id, so an offline retry doesn't duplicate
}
export interface CreateMomentResponse { moment: Moment; lit: string[] } // node ids that should light up in Sky

/** GET /api/people/:id?confId=&userId= (person card). `why` explains why this person matters to the user, if anything. */
export interface PersonDetail {
  person: Person;
  sessions: Session[]; // talks at confId (all conferences if omitted)
  why: WhyPath[];
  metBefore?: { conferenceId: string; conferenceName: string; at: string }[];
}

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
