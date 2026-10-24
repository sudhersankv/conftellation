// Typed browser-side API client. UI code calls these, never fetch() directly,
// so the contract in lib/types.ts is enforced in one place.
import type {
  AddConferenceResponse, BriefResponse, CommunityResponse, ConferenceDetail, ConstellationResponse,
  CreateMomentResponse, FeedbackRequest, IntrosResponse, MeetRequest, MeetRequestBody, MeetRespondBody,
  Moment, NetworkResponse, OnboardingRequest, OnboardingResponse, PlanResponse, RecordResponse,
  SearchResponse, SteerResponse, TripReportResponse,
} from "@/lib/types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
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
  plan: (userId: string, confId: string) => call<PlanResponse>(`/api/users/${userId}/plan${q({ confId })}`),
  steer: (userId: string, confId: string, text: string) => call<SteerResponse>(`/api/users/${userId}/steer`, post({ confId, text })),
  feedback: (userId: string, body: FeedbackRequest) => call<PlanResponse>(`/api/users/${userId}/feedback`, post(body)),
  search: (confId: string, q_: string) => call<SearchResponse>(`/api/search${q({ confId, q: q_ })}`),
  /** form fields: confId, kind, text?, file?, targetId?, personId?, newPersonName?, newPersonCompany?, shared? */
  createMoment: (userId: string, form: FormData) => call<CreateMomentResponse>(`/api/users/${userId}/moments`, { method: "POST", body: form }),
  shareMoment: (momentId: string, to: string[] | "network") => call<Moment>(`/api/moments/${momentId}/share`, post({ to })),
  constellation: (userId: string, confId?: string) => call<ConstellationResponse>(`/api/users/${userId}/constellation${q({ confId })}`),
  brief: (userId: string, confId: string, opts: { date?: string; regenerate?: boolean } = {}) =>
    call<BriefResponse>(`/api/users/${userId}/brief${q({ confId, date: opts.date, regenerate: opts.regenerate ? "1" : undefined })}`),
  tripReport: (userId: string, confId: string) => call<TripReportResponse>(`/api/users/${userId}/trip-report${q({ confId })}`),
  intros: (userId: string, confId: string) => call<IntrosResponse>(`/api/users/${userId}/intros${q({ confId })}`),
  network: (userId: string, confId: string) => call<NetworkResponse>(`/api/users/${userId}/network${q({ confId })}`),
  requestMeet: (userId: string, body: MeetRequestBody & { confId: string }) => call<MeetRequest>(`/api/users/${userId}/meet`, post(body)),
  respondMeet: (meetId: string, body: MeetRespondBody) => call<MeetRequest>(`/api/meets/${meetId}/respond`, post(body)),
  community: (sessionId: string) => call<CommunityResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/community`),
  record: (userId: string) => call<RecordResponse>(`/api/users/${userId}/record`),
};
