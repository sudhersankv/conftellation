// Typed browser-side API client. UI code calls these, never fetch() directly,
// so the contract in lib/types.ts is enforced in one place.
import type {
  AddConferenceResponse, BriefResponse, CommunityResponse, ConferenceDetail, ConstellationResponse,
  CreateMomentResponse, FeedbackRequest, IntrosResponse, MeetRequest, MeetRequestBody, MeetRespondBody,
  Moment, NetworkResponse, OnboardingRequest, OnboardingResponse, PlanResponse, RecordResponse,
  SearchResponse, SteerResponse, TripReportResponse, CreateMomentFields, PersonDetail, SteerOp, AskResponse, ConferencesResponse,
} from "@/lib/types";

/** Append the demo access query required by GET /api/uploads/:file. Private media needs the owner's userId; shared media may use momentId. */
export function mediaSrc(mediaUrl: string, opts: { userId?: string; momentId?: string } = {}): string {
  const hashAt = mediaUrl.indexOf("#");
  const hash = hashAt >= 0 ? mediaUrl.slice(hashAt) : "";
  const withoutHash = hashAt >= 0 ? mediaUrl.slice(0, hashAt) : mediaUrl;
  const qAt = withoutHash.indexOf("?");
  const path = qAt >= 0 ? withoutHash.slice(0, qAt) : withoutHash;
  const params = new URLSearchParams(qAt >= 0 ? withoutHash.slice(qAt + 1) : "");
  if (opts.userId) params.set("userId", opts.userId);
  if (opts.momentId) params.set("momentId", opts.momentId);
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}

/** Typed builder for the multipart body of api.createMoment. */
export function momentForm(fields: CreateMomentFields): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.append(k, v instanceof Blob ? v : String(v));
  }
  return form;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const body = (isJson ? await res.json().catch(() => null) : null) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status} from ${url}`);
  if (!isJson) throw new Error(`Expected JSON from ${url}, got ${res.headers.get("content-type") || "no content type"}`);
  return body as T;
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as [string, string][]).toString();
  return s ? `?${s}` : "";
};

export const api = {
  /** `input` may be a URL or a conference name (Scout searches for the schedule page). */
  addConference: (input: string) => call<AddConferenceResponse>("/api/conferences", post(/^https?:\/\//i.test(input.trim()) ? { url: input.trim() } : { name: input.trim() })),
  /** Catalogue of every imported conference, split by date. */
  conferences: (userId?: string) => call<ConferencesResponse>(`/api/conferences${q({ userId })}`),
  conference: (id: string) => call<ConferenceDetail>(`/api/conferences/${encodeURIComponent(id)}`),
  onboarding: (userId: string, body: OnboardingRequest) => call<OnboardingResponse>(`/api/users/${userId}/onboarding`, post(body)),
  plan: (userId: string, confId: string, opts: { now?: string } = {}) => call<PlanResponse>(`/api/users/${userId}/plan${q({ confId, now: opts.now })}`),
  /** Pass `ops` (e.g. a previous response's `undo`) to apply them directly without the LLM. */
  steer: (userId: string, confId: string, text: string, ops?: SteerOp[]) => call<SteerResponse>(`/api/users/${userId}/steer`, post({ confId, text, ops })),
  feedback: (userId: string, body: FeedbackRequest, opts: { now?: string } = {}) => call<PlanResponse>(`/api/users/${userId}/feedback${q({ now: opts.now })}`, post(body)),
  search: (confId: string, q_: string) => call<SearchResponse>(`/api/search${q({ confId, q: q_ })}`),
  /** Build `form` with momentForm({ confId, kind, ... }) (fields: CreateMomentFields). */
  createMoment: (userId: string, form: FormData) => call<CreateMomentResponse>(`/api/users/${userId}/moments`, { method: "POST", body: form }),
  /** `userId` is required by the route (demo caller). Omit it and the share is rejected. */
  shareMoment: (momentId: string, to: string[] | "network", userId?: string) =>
    call<Moment>(`/api/moments/${momentId}/share${q({ userId })}`, post(userId ? { to, userId } : { to })),
  constellation: (userId: string, confId?: string, opts: { now?: string } = {}) => call<ConstellationResponse>(`/api/users/${userId}/constellation${q({ confId, now: opts.now })}`),
  brief: (userId: string, confId: string, opts: { date?: string; regenerate?: boolean } = {}) =>
    call<BriefResponse>(`/api/users/${userId}/brief${q({ confId, date: opts.date, regenerate: opts.regenerate ? "1" : undefined })}`),
  tripReport: (userId: string, confId: string, opts: { regenerate?: boolean } = {}) =>
    call<TripReportResponse>(`/api/users/${userId}/trip-report${q({ confId, regenerate: opts.regenerate ? "1" : undefined })}`),
  intros: (userId: string, confId: string) => call<IntrosResponse>(`/api/users/${userId}/intros${q({ confId })}`),
  network: (userId: string, confId: string) => call<NetworkResponse>(`/api/users/${userId}/network${q({ confId })}`),
  requestMeet: (userId: string, body: MeetRequestBody & { confId: string }) => call<MeetRequest>(`/api/users/${userId}/meet`, post(body)),
  respondMeet: (meetId: string, body: MeetRespondBody) => call<MeetRequest>(`/api/meets/${meetId}/respond`, post(body)),
  /** userId fills `myMoments` (empty without it). */
  community: (sessionId: string, userId?: string) =>
    call<CommunityResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/community${q({ userId })}`),
  person: (personId: string, opts: { confId?: string; userId?: string } = {}) =>
    call<PersonDetail>(`/api/people/${encodeURIComponent(personId)}${q(opts)}`),
  record: (userId: string) => call<RecordResponse>(`/api/users/${userId}/record`),
  /** Ask the conference brain. Grounded in graph paths; each line cites one. No history is kept. */
  ask: (userId: string, confId: string, question: string) => call<AskResponse>(`/api/users/${userId}/ask`, post({ confId, question })),
};
