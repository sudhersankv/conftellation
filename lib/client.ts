// Typed browser-side API client. UI code calls these, never fetch() directly,
// so the contract in lib/types.ts is enforced in one place.
import type {
  AddConferenceResponse, BriefResponse, CommunityResponse, ConferenceDetail, ConstellationResponse,
  CreateMomentResponse, FeedbackRequest, IntrosResponse, MeetRequest, MeetRequestBody, MeetRespondBody,
  Moment, NetworkResponse, OnboardingRequest, OnboardingResponse, PlanResponse, RecordResponse,
  SearchResponse, SteerResponse, TripReportResponse, CreateMomentFields, PersonDetail, SteerOp,
} from "@/lib/types";

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
  addConference: (url: string) => call<AddConferenceResponse>("/api/conferences", post({ url })),
  conference: (id: string) => call<ConferenceDetail>(`/api/conferences/${encodeURIComponent(id)}`),
  onboarding: (userId: string, body: OnboardingRequest) => call<OnboardingResponse>(`/api/users/${userId}/onboarding`, post(body)),
  plan: (userId: string, confId: string, opts: { now?: string } = {}) => call<PlanResponse>(`/api/users/${userId}/plan${q({ confId, now: opts.now })}`),
  /** Pass `ops` (e.g. a previous response's `undo`) to apply them directly without the LLM. */
  steer: (userId: string, confId: string, text: string, ops?: SteerOp[]) => call<SteerResponse>(`/api/users/${userId}/steer`, post({ confId, text, ops })),
  feedback: (userId: string, body: FeedbackRequest, opts: { now?: string } = {}) => call<PlanResponse>(`/api/users/${userId}/feedback${q({ now: opts.now })}`, post(body)),
  search: (confId: string, q_: string) => call<SearchResponse>(`/api/search${q({ confId, q: q_ })}`),
  /** Build `form` with momentForm({ confId, kind, ... }) (fields: CreateMomentFields). */
  createMoment: (userId: string, form: FormData) => call<CreateMomentResponse>(`/api/users/${userId}/moments`, { method: "POST", body: form }),
  shareMoment: (momentId: string, to: string[] | "network") => call<Moment>(`/api/moments/${momentId}/share`, post({ to })),
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
};
