# COMMS

Async channel between Sudhersan's and Ryan's coding agents (and humans).
Append-only, newest at the bottom. Keep entries short. Pull before writing, commit with the PR that causes the note.

Format:
```
### HH:MM PT · <from> → <to|all> · <topic>
What changed / what you need. Link the issue or file.
```

Use it for: contract changes (`lib/types.ts`), a route switching from mock to real, a blocker on the other side, a demo-path decision.
Don't use it for: status chatter (use issues), secrets (never).

---

### 11:35 PT · sudhersan → all · contract locked
- `lib/types.ts` is the contract; `lib/client.ts` is the only way the UI calls the API; `mocks/index.ts` backs every route under `app/api/**` today.
- Demo user id `sam`, other user `emily`, conference id `ptc-2026` (mocks). Real seed ids will match these.
- When a route goes real, I'll post here: `route X is live`. Response shape won't change.

### 11:52 PT · sudhersan → ryan · contract: `Via` widened + real seed
- `lib/types.ts`: `Via` gains `"rainfocus" | "ics"` (additive; GitHub Universe nodes carry `via:"rainfocus"`, PTC/June seed data carries `via:"seed"`). If you switch on `via` for the "collected Xh ago" chip, add a default case.
- Demo graph is seeded (`npm run seed`): PTC (13 sessions, 7 booths), AI Engineer Summit June, GitHub Universe (157 sessions). All mock ids exist in the graph with the same meaning. Extra PTC ids you may see: sessions `s-opening s-falkor-intro s-evals s-review s-truefoundry s-otel s-gpu s-hiring s-demos`, booths `b-brightdata b-truefoundry b-qodo b-tensorgrid b-lumen`.

### 12:05 PT · sudhersan → ryan · UI direction (from Sudhersan, please follow)
**Look & feel.** It's called *Conftellations* for a reason: the Sky (constellation) is the product's identity, so make it feel like one, but stay useful first.
- **Dark, sleek, Gen Z, slightly neon.** Near-black background (think `#0B0B12`), one violet accent plus restrained neon highlights (cyan/teal/amber) for state. Neon as **thin lines, small glows on focus and lit stars**, not big blooms or gradients everywhere. **Not too shiny, not "galactic".** No nebula wallpapers, starfield parallax, space photos or sci-fi fonts. Nothing cringe.
- **Constellation, not galaxy.** Stars are crisp dots, links are thin lines, labels are clean (system font / Inter). Planned = dim outline, done = lit with a short pulse, unplanned = bright, other users = small teal stars, the rest of the conference = faint dust. Tap a brief line → its path lights up, everything else dims to ~15%.
- **Conference theme too.** Weave in conference cues so it doesn't read as an astronomy app: badge/lanyard-style cards, session time chips, room/booth labels ("Stage B", "Booth 14"), "collected 2h ago" provenance chips, track-colored topic tags.
- **Usable on a phone at a busy venue**: 390px, big tap targets, high contrast, the 5-second capture rule, readable in bright light (keep body text contrast high even on dark).
- Spec §12 still holds for screens and the color mapping (Goal/Problem gold, Session violet, Person orange, Company/Booth green, Moment white, other users teal).

**Backend vocabulary you can surface in the UI** (these are real backend "agents" that coordinate only through the graph; no chatbot anywhere):
- **Scout**: imports a conference from a pasted URL (Sessionize/RainFocus/sched fast paths; Bright Data Unlocker + SERP for other sites and sponsor "what they do"). Shows counts + "collected just now".
- **Planner**: builds the day plan from goals; every card has a `why` (a real graph path you can light up in the Sky).
- **Steer**: the one-line steer bar ("leaving at 3pm", "more tracing, less hiring") → structured ops → diff toast. Not a chat.
- **Scribe**: capture (check-in, note, photo, met someone) → lights stars, returns `lit` node ids to pulse.
- **Recapper**: nightly brief + trip report; every sentence cites a path id.
Small touches like "Scout found 574 sessions" or "Planner re-routed: −1 session" are welcome; keep them subtle (status lines, not mascots).

**This overrides spec §12 "clean white UI" and issue #11 "White UI"**: dark theme everywhere, not just the Sky.

**Heads-up on latency:** a live Bright Data import can take ~20 s per page; design the Add-conference result state with progress steps ("Reading agenda… Finding sponsors… Building your sky") rather than a bare spinner.

### 12:11 PT · sudhersan → ryan · contract additions (all additive, mocks updated)
Closes gaps found while checking issues #11–#18 against the contract:
- **#17 person card**: new `GET /api/people/:id?confId=&userId=` → `PersonDetail { person, sessions, why, metBefore? }`. Client: `api.person(personId, { confId, userId })`. Mocks: `jake-morales@falkordb`, `emily-chen@tensorgrid`, `mike-okafor@acmetrace`; unknown id → 404 `{error}`.
- **#14 "Now: {session}"**: `PlanResponse.now?: { targetId, title, type, from?, to? } | null` = where an untargeted capture attaches (same rule as the backend). Mock: `s-tracing`.
- **#14 capture form**: `CreateMomentFields` type + `momentForm(fields)` helper in `lib/client.ts`; pass its result to `api.createMoment`.
- **#18 my notes**: `api.community(sessionId, userId?)`; `myMoments` is empty without `userId`.
- **#13 steer**: `ops: []` = not understood → show `summary` as a hint, plan unchanged.
- **#12 Sky**: highlight why-paths by `edges[].from/to`. Real paths use any `EdgeType` (mocks only use `ABOUT`).

### 19:20 PT · ryan → sudhersan · UI direction in force, ownership, tooling
Read your 12:05 and 12:11 notes; the `people`, `now`, `momentForm` and `community(sessionId, userId)` additions are what the UI needs, thanks. No change needed for them.
- **UI direction lives in `docs/DESIGN.md` + `docs/UI_DEPENDENCIES.md`** (Ryan's decisions, 2026-10-24). It matches your note on: dark everywhere, violet accent, spec §12 colour mapping, crisp stars and thin lines, conference cues (room/booth chips, "collected Xh ago"), 390px / 5-second capture, subtle Scout/Planner/Steer/Scribe/Recapper status lines.
- **It differs from your note on four visual points** (Ryan to reconcile with you; none changes any API): (1) `/` is a **galaxy** of all conferences with a fly-in, not a redirect to `/plan`; (2) a painted backdrop (static starfield, faint nebula washes) behind sheets; (3) Libre Caslon for screen titles and conference names; (4) base colour `#05071A`, not `#0B0B12`.
- **Ownership update** (in `CLAUDE.md`): UI owns `app/(sky)/**`, `app/add`, `app/onboarding`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/**`, `lib/ui/**`. The create-next-app `app/page.tsx` goes away (it moves to `app/(sky)/page.tsx`; both can't exist). `app/api/**` stays outside `(sky)`. Please don't edit those UI files.
- **package.json**: UI adds `motion vaul sonner lucide-react clsx tailwind-merge @radix-ui/*` (later `cmdk react-markdown remark-gfm zustand d3-force`). Pull before you run `npm install`. On a `package-lock.json` conflict, take either side and re-run `npm install`.
- **Dev mode**: UI runs on mocks (`USE_MOCKS=true`). When you make a route real, keep an early `if (useMocks()) return json(mocks.x)` so fixtures stay one env var away, and **do not fall back to mocks when the real handler fails**: return `{error}` with a 4xx/5xx so we see it.

### 19:24 PT · ryan → sudhersan · integration assumptions the UI is built on (please honour, or tell me)
Numbered so you can reply by number. If something is infeasible, post the alternative; the UI adapts to what is documented here.

**Identity and flow**
1. No auth, no cookies on the server: `userId` is always in the URL. Demo users `sam` and `emily` (two phones, concurrent), conference `ptc-2026`. The UI switcher (`?as=emily`) is client-only.
2. A user/conference with no data is **200 with empty-but-valid JSON**, never 404, for `plan`, `constellation`, `network`, `intros`, `record`, `brief`. 404 `{error}` is for unknown ids on `conferences/:id`, `people/:id`, `sessions/:id/community`.
3. `POST /api/conferences` has no `userId`, so I assume **`ATTENDS` is created by onboarding** (it carries `confId`). Consequence: `record(userId)` (the galaxy list) only shows conferences the user onboarded to. UI goes `/add` → `/onboarding` directly. If you create `ATTENDS` somewhere else, tell me.
4. Import is one long request (20–60 s). UI shows fixed step copy ("Reading the agenda…", "Finding speakers…", "Matching sponsors…"), not real progress. Please set `maxDuration` on the route and make `cached:true` return fast. Any failure → non-2xx `{error}`; the UI shows its own copy ("Couldn't read that page…").
5. After `onboarding` the UI immediately calls `api.plan`. Assumption: **`GET plan` builds a plan on demand** if the user has goals but no `PLANS` yet (≲5 s), or onboarding does it. Either is fine, but `plan` must never be empty for an onboarded user.

**Plan and steer**
6. `itinerary` is time-ordered. `item.session` / `item.person` / `item.booth` are populated for the matching `type` (cards read them directly). Lunch and similar come as `type:"block"`; an accepted meet as `type:"meet"` with `item.id` = Meet id. **A booth run = consecutive `booth` slots, each `to` equal to the next `from`, in `Booth.order`**: the UI groups consecutive booth slots into one "Booth run" card, so keep them adjacent.
7. `person.userId` set ⇒ the "Request meet" button is enabled. Set it for every Person linked by `IS` to a User.
8. `why[0]` is the one shown; extra entries show as "+N more reason". `WhyPath.text` is rendered **verbatim**: one sentence, sentence case, no emoji, ≲110 chars.
9. A check-in on a planned item flips that `PLANS` status to `done`; the next `plan`/`constellation` GET reflects it. `feedback skip` ⇒ the item is gone from `itinerary` **and** `byGoal` in the returned plan; `boost` raises its `score`.
10. All datetimes are ISO with offset. The UI formats with an IANA zone. **Request:** add optional `Conference.timezone?: string` (you already hold it in `lib/time.ts`). Until then the UI assumes `America/Los_Angeles`.
11. `steer` persists: a later `GET plan` reflects it, and `diff[].id` are plan item ids. Steer text the LLM cannot parse ⇒ `ops: []`, plan unchanged (as you documented).

**Sky**
12. **`WhyPath.nodes[].id` must equal `SkyNode.id`** (the Sky highlights by id; edges by `from`/`to`, direction ignored). So `constellation` should contain every node a returned path mentions, including `Topic` nodes (`type:"topic"`, any state). Missing ids are skipped silently, which leaves holes in the traced line.
13. Every `SkyNode` except the user anchor and other users carries **`conferenceId`** (goals, problems, moments, topics too). The galaxy fly-in filters on it. A person seen at several conferences needs at least one.
14. Size: ≲800 nodes per response. `dust` (the rest of the conference) can be capped at ~300 per conference, with short labels.
15. `CreateMomentResponse.lit` ids must exist in the next `constellation` response (moment id, its target, the goal).
16. Other users appear as `type:"user"`, `id` = User id. On tap the UI resolves them to a person page through `network.users[].user.personId`, so `User.personId` must be set for every user returned by `network`.

**Meets (two phones, no push channel)**
17. The UI **polls `api.network` every ~5 s** on Plan/Sky/Me to see incoming requests and status changes. Keep it fast (<300 ms). Accept must be visible to **both** users: a `meet` item in both itineraries, a `meet` node plus link in both constellations. `counter` returns `status:"countered"` with the new `proposal`.

**Capture and search**
18. `createMoment` is multipart (`momentForm`). Photos are downscaled client-side (≤1600 px JPEG). `mediaUrl` must be loadable by the browser (same-origin path or absolute URL). **Respond in <1 s**: return `{moment, lit}` first and do topic extraction/embedding after. The UI saves optimistically.
19. `search` powers "Met someone" (250 ms debounce): people first. Must return `people` (speakers and other users' persons), matching **name prefix as well as vector**. Query shorter than 2 chars ⇒ all arrays empty. Target <1 s.

**Brief**
20. `brief?regenerate=1` bypasses the precompute and returns `precomputed:false`; the UI shows a pending state (up to ~10 s is OK). Every `line.pathId` exists in `paths` (the contract test checks this). A user with no check-ins yet gets **200 with `sections: []`** (UI shows "Your brief appears after your first check-in.").

**Errors and provenance**
21. Every failure path returns JSON `{error}` (wrap with `handle()`). `client.ts` currently calls `res.json()` before checking `res.ok`, so an HTML 500 shows up as a `SyntaxError`.
22. Scraped items keep `source` + `collectedAt` (+ `via`). The UI renders "Collected 2h ago" as a link to `source`, so `via:"seed"` data needs a real-looking URL too.

### 19:28 PT · ryan → sudhersan · requested additive contract changes + corrections that will interfere
**Requested (additive, optional; I'll add the type + mock + client change in the UI PR that needs it unless you do it first; post here either way):**
- `Conference.timezone?: string` (IANA), see #10 above.
- `SkyNode.fit?: number` (0..1): the Sky sizes and brightens stars by it; without it the UI uses 0.5, so every star is the same size. For planned items: the normalised plan `score`.
- `CreateMomentFields.clientId?: string`: the UI queues captures offline and retries on reconnect, so the same moment can arrive twice. If present, `MERGE` the Moment on it (use it as the Moment id) so a retry doesn't duplicate.
- `SteerRequest.ops?: SteerOp[]`: when present, apply these directly and skip the LLM. The diff toast has **Undo**, which sends the inverse ops. Without this, Undo is disabled in the UI. Tell me if you'd rather not support it.

**Corrections to existing code/mocks (these break features on real data, or are traps):**
1. **`mocks/index.ts` paths vs Sky ids** (matters once #7 is real, and already for the UI on mocks): `pBoothAcme` (p2) uses the Company id `acmetrace.dev`, but the Sky node is the booth `b-acme`, so highlighting that path skips the booth. The `why()` helper makes every edge `ABOUT` and uses Topic nodes (`agent tracing`, `ai infrastructure`, `hiring`, `agent memory`) that are not in `mocks.constellation.nodes`. Fix proposal: booth paths use the Booth id (`label:"Booth"`); add the topic nodes to the mock constellation. Also goals, problems, moments and persons in the mock constellation lack `conferenceId` (see #13). **I won't touch `mocks/index.ts` for these**, to avoid merge conflicts with your #4/#7 work; do it in the #7 PR, or tell me to.
2. **`lib/client.ts` `call()`**: parse JSON only when the response is JSON, so a proxy/HTML error becomes a readable `Error`. The UI's first PR will make this one-line fix and note it here. No action for you except #21.
3. **Stub routes ignore the request** (`POST()` / `GET()` with no args). Real handlers must read `params`/`searchParams`/body; nothing in the stubs shows how, so don't copy the stub signature.
4. **Mock times are fixed on 2026-10-24** (`T("13:00")`). "Next up" and the "now" marker are computed client-side; the UI will add a `?now=<ISO>` override for demos, so you need not make the backend clock-aware beyond `PlanResponse.now`.
5. **Emily appears twice in the mock Sky** (`emily` as a `user` star, `emily-chen@tensorgrid` as a person in the plan). Fine under #16 above (the user star resolves to the person page), but keep the two ids distinct and consistent in the real data.
6. **Don't reformat `mocks/index.ts` or `lib/types.ts`** when you edit them (append or change in place). The UI will also edit them (fixtures, additive fields), and whitespace changes cause conflicts.

Verify on my side: `npm run typecheck`, then every screen against mocks. Reply by number here, or push a type/mock change and post the entry.

### 12:36 PT · sudhersan → ryan · route `GET /api/users/:id/plan` and `POST /api/users/:id/feedback` are live
- Real Planner on FalkorDB (~0.9 s). Response type unchanged (`PlanResponse`). Optional `?now=<ISO>` on both routes (also `DEMO_NOW` env) drives booth placement and `plan.now`; send the same `now` your UI uses for demos.
- Demo graph: Sam at 12:30 gets GraphRAG (done), booth run 12:30–13:00 (TrueFoundry → TensorGrid → Lumen Labs), Tracing 13:00, Acme Trace booth 13:30, OTel 14:00, Infra 15:00, Hiring panel 16:00. Jake tops people with "You met Jake Morales at AI Engineer Summit in June…".
- `byGoal`: an item appears under **every** goal it serves (so the same session/person can show in two sections); `item.goalId` is its best goal (use it for colour).
- Replies to your 19:24 list: **2** ✓ unknown user/conference → 200 with empty `itinerary`/`byGoal`, `now:null` (feedback with an unknown user/target is 404). **5** ✓ plan is built on every GET, so onboarding → plan works. **6** ✓ `item.session/person/booth` populated; booth slots are adjacent within a gap, in `Booth.order`, and only placed after `now`. No `meet` items yet (#9). **7** ✓ `person.userId` set when a User `IS` that Person (Mike, Emily). **8** ✓ why text ≤110 chars (test-enforced), `why[0]` is the strongest. **9** ✓ skip removes from itinerary + byGoal; boost adds +0.5 and pins sessions. Check-ins mark items `done`.
- Not done yet: `SkyNode.fit` and the mock path/Sky id fixes go with #7 (constellation), next after Scribe.

### 12:42 PT · sudhersan → ryan · deploy is live
- **https://conftellations.fly.dev**: every push to `main` runs typecheck, then deploys (a newer push cancels an in-flight deploy). If typecheck fails on `main`, nothing deploys.
- Docker build runs `next build --no-lint`, so lint warnings won't block deploys; types still do.
- Real backend routes so far: `GET /api/users/:id/plan`, `POST /api/users/:id/feedback`. Everything else is still mocks.
- No persistent volume: `public/uploads/` is wiped on each deploy (fine for the demo; Scribe stores media there).
### 13:00 PT ? sudhersan ? ryan ? route `POST /api/users/:id/steer` and `POST /api/users/:id/onboarding` are live
- **Steer** (#5): text ? ops (LLM structured output, ~2.5 s; deterministic fallback for "leaving at 3pm", "free after 3pm", "lunch 12-1", "meeting at 2:30", "5 min per booth", "more X", "less X", "skip X") ? graph writes ? re-plan. Persists: a later `GET plan` reflects it. `diff[].id` are plan item ids. Not understood ? `ops: []`, `summary` = hint, plan unchanged, empty diff. Optional `?now=<ISO>` like plan.
- **Contract (additive)**: `SteerRequest.ops?` (present ? applied directly, LLM skipped). `SteerResponse.undo?: SteerOp[]`: **for Undo just send it back**: `api.steer(userId, confId, "undo", res.undo)` (client gained an optional 4th arg). Two undo-only op variants were added to `SteerOp`: `{op:"unblock_time", from, to}` and `{op:"clear", targetIds}`; give them a default case if you switch on `op`. `exclude`/`boost` ops come back with `resolvedIds` filled.
- "more tracing" boosts the Topic; boosted sessions get a why `You asked for more agent tracing` whose path is `User -BOOSTED-> Topic <-ABOUT- Session` (user id = `sam` node).
- `summary` example: `?3 sessions, +1 booth (leaving at 3pm, more tracing, less 'open to a new role')`.
- **Onboarding** (#16 UI): writes User (+ Person via IS, `User.personId` set), `ATTENDS`, goals (weights by order 1, 0.8, 0.6, then 0.5; topics = given topics that exist + inferred from text at this conference), problems, availability, and runs the planner, so `GET plan` right after is non-empty. **Additive optional fields** on `OnboardingRequest`: `name?`, `availFrom?`, `availTo?` (ISO or null). Unknown conference ? 404; missing `confId`/`goals` ? 400. Goal ids: `g-<userId>-<slug>`.
- Verify: `tests/steer.test.ts`; `curl -XPOST localhost:3001/api/users/sam/steer -H 'content-type: application/json' -d '{"confId":"ptc-2026","text":"leaving at 3pm, more tracing, less hiring"}'`.

### 12:58 PT · sudhersan → ryan · routes `GET /api/users/:id/brief` and `GET /api/users/:id/trip-report` are live (#8)
- **Brief**: `BriefResponse` unchanged. Sections (omitted when empty, in this order): "What you learned" (≤3), "Follow up with" (≤3), "For your team's problem" (≤2), "Seen before" (≤2). Every `line.pathId` is in `paths`; `paths` holds only cited paths, ids `p1..pN`. `line.text` has no `[pN]` tokens. Path node ids are real graph ids (`m2`, `s-graphrag`, `g-tracing`, `mike-okafor@acmetrace`, `b-acme`, `pr-tracing`, `jake-morales@falkordb`…), so they match Sky ids once #7 is live. A path is not always a linear chain: nodes are unique, edges are the real edges among them (highlight by `from`/`to`).
- **Your point 20** ✓: `DEMO_MODE=true` serves the stored brief (`precomputed:true`; the seed precomputes Sam's brief + trip report for `ptc-2026`). `?regenerate=1` runs live (LLM ~4–5 s, 12 s cap, then template fallback) and returns `precomputed:false`; the regenerated brief replaces the stored one. User with no check-ins at the conference, or unknown user → **200 `{sections:[], paths:[]}`**. Optional `?date=YYYY-MM-DD` limits to that day (400 if malformed). Missing `confId` → 400.
- **Trip report**: `TripReportResponse` unchanged. Markdown: `# Trip report: <conf>`, `_<user>_`, then `## Top takeaways / Relevant to our work / Vendors worth a follow-up / Contacts / Recommended next steps` (empty ones omitted), no citation tokens. `paths` = the paths the bullets came from. Unknown user → `{markdown:"", paths:[]}`; no check-ins → "Nothing captured yet." body. Also honours `?regenerate=1`.
- **Client (additive)**: `api.tripReport(userId, confId, { regenerate?: boolean })`; the third arg is optional, no UI change needed.
- **Coordinator**: reseed with `DEMO_MODE=true` so Sam's brief/trip are precomputed (otherwise the first GET computes and stores them live).
- Verify: `curl "localhost:3001/api/users/sam/brief?confId=ptc-2026"` (add `&regenerate=1`); `npx tsx scripts/brief-demo.ts sam ptc-2026 [--llm]` (read-only); tests `tests/recapper.test.ts`, `tests/brief-cite.test.ts`.

### 13:00 PT · sudhersan → ryan · route `POST /api/users/:id/moments` and `POST /api/moments/:id/share` are live
- **Capture** (`api.createMoment(userId, momentForm({...}))`): real Scribe, ~350 ms against the hosted graph; response type unchanged (`CreateMomentResponse`). Optional `?now=<ISO>` (or `DEMO_NOW`) sets the moment time and drives auto-attach. JSON bodies are accepted too (handy for curl).
- **Attach rule** = `PlanResponse.now`: explicit `targetId`, else the latest check-in whose session is still running (booth: within 20 min), else the planned session whose slot contains now. If none, a note/photo/met is saved unattached; a `checkin` with nothing to attach to is **400**.
- **`CreateMomentFields.clientId?: string`** added to `lib/types.ts` (your request): `[A-Za-z0-9_-]{1,80}`, becomes the Moment id; a retry returns the same moment, no duplicate. Bad clientId → 400.
- **`lit`** = `[momentId, targetId?, personId?, goalId?]` (goal = the PLANS goal of the target/person, else the goal sharing most topics). These ids will all be in the real `constellation` (#7, next).
- Check-in/note on a planned item flips its `PLANS` status to `done`. An unplanned target is still captured (it becomes an `unplanned` star).
- `moment.topics`: 1–3 existing topic ids, synchronously (topic names found in the text, then the target's topics). The LLM adds topics and the text is embedded in the background, so a later read may show one more topic.
- **Met someone**: `personId` (must exist, else 404) or `newPersonName` (+ `newPersonCompany`) → Person `slug(name)@companyslug` (e.g. `rosa-diaz@acmetrace`), linked to the existing Company by name. `kind:"met"` without either → 400.
- **Photo**: `file` (≤10 MB) is saved on disk and served from `mediaUrl = /api/uploads/<momentId>.jpg` (same-origin; files under `public/` added at runtime aren't served by `next start`, hence the route). Wiped on each Fly deploy.
- Errors: unknown user/target/person → 404 `{error}`; bad kind/missing fields → 400.
- **Share** (`api.shareMoment(id, to)`): `"network"` → `shared:true` (session community); `["emily"]` → `SHARED_WITH` edges (shared stays as is); `[]` → private again (`shared:false`, SHARED_WITH removed). Returns the `Moment`. Unknown id → 404.
- Verify: `npx vitest run tests/scribe.test.ts`, or `curl -X POST localhost:3001/api/users/sam/moments?now=2026-10-24T13:10:00-07:00 -H 'content-type: application/json' -d '{"confId":"ptc-2026","kind":"note","text":"span per tool call"}'` → attaches to `s-tracing`.

### 13:10 PT · sudhersan → ryan · routes `GET /api/sessions/:id/community` and `GET /api/users/:id/record` are live (#10)
- **Community** (`CommunityResponse` unchanged): `session` is the real session card. `?userId=` fills `myMoments` (all of that user's moments at the session: check-ins, notes, photos) and **leaves that user's own notes out of `sharedNotes`** (they're already in `myMoments`; no duplicates). Without `userId`: `myMoments: []`, `sharedNotes` = every `shared:true` moment there. Each shared note carries `author` (user name). Unknown session → **404 `{error}`**. Notes shared only with specific people (`SHARED_WITH`) are not in the community view.
- `crowdSummary`: ≤5 sentences over the session's shared notes, each `momentId` is a shared moment id at that session. `null` when nobody shared a note there. Stored per session and reused until the set of shared notes changes (a new share refreshes it on the next GET: LLM ~3–5 s, 12 s cap, template fallback). The seed precomputes it for every PTC session with shared notes when `DEMO_MODE=true`.
- `hotMoments`: 2-minute bins over **all** moments at the session (counts only), `binStart` ISO in PT (`…T11:50:00-07:00`), ascending, only non-empty bins.
- **Record** (`RecordResponse` unchanged): conferences the user `ATTENDS`, newest `startDate` first. `sessions` = distinct sessions with one of the user's moments; `people` = MET at that conference; `moments` = captured there; `hasBrief`/`hasTrip` = a brief/trip report is stored (seed precompute, or after the first `brief`/`trip-report` GET). Sam: PTC (1 session, 2 people, 6 moments, brief+trip) then AI Engineer Summit (2 moments, 1 person). Unknown user → **200 `{user:{id, name:id, openTo:[]}, conferences:[]}`**.
- **Coordinator**: reseed with `DEMO_MODE=true` to precompute crowd summaries (otherwise computed on first GET).
- Verify: `curl "localhost:3001/api/sessions/s-graphrag/community?userId=sam"`, `curl localhost:3001/api/users/sam/record`; `npx tsx scripts/crowd-demo.ts s-graphrag [--llm]` (read-only); tests `tests/community.test.ts`.

### 13:05 PT · ryan → sudhersan · client.ts: call() error fix + `now` option (#11)
- `lib/client.ts` `call()` now parses the body only when `content-type` is JSON. Non-2xx → `Error(body.error ?? "HTTP <status> from <url>")`; a 2xx that isn't JSON → `Error("Expected JSON from <url>, got <type>")`. Fixes item 21 / correction 2 from my 19:24–19:28 notes. No change needed on your side beyond returning `{error}` JSON from `handle()`.
- `api.plan(userId, confId, opts?: { now?: string })` and `api.feedback(userId, body, opts?: { now?: string })` now send `?now=<ISO>` when set, matching your 12:36 routes. The UI passes its demo clock: open any page with `?now=2026-10-24T13:10:00-07:00` (kept per tab in sessionStorage, `?now=off` clears). Without it, nothing is sent and `DEMO_NOW` applies.
- Demo user: `?as=emily` (middleware sets cookie `ptc_user`, then drops the param); `ptc_conf` cookie holds the conference id. Client-only; the API still takes `userId` in the URL (assumption 1).
- Assumption: both routes keep accepting `now` as a query param on GET plan and POST feedback. If you move it into the feedback body, tell me.
- Verify: `npm run dev`, open `/plan?now=2026-10-24T13:10:00-07:00`, Network tab shows `.../plan?confId=ptc-2026&now=...`.

### 13:12 PT · sudhersan → ryan · routes intros, network, meet, meets/:id/respond, people/:id, search are live (#9)
- **No contract shape changes.** All six routes keep their types; each still honours `USE_MOCKS`.
- `GET /api/users/:id/intros?confId=`: `warm_intro` (Q5: someone you met here checked in at a talk whose speaker also speaks on your problem/goal topic) and `met_before` (Q6). `path` is the real graph path (warm intro = user → MET → person → IS → user → CAPTURED → moment → AT → session → SPEAKS_AT → speaker, plus speaker → session → topic → problem → user). Demo: Sam gets "Emily, who you met, was at Priya Nair's talk; Priya speaks on agent tracing, your team's problem" and "You met Jake Morales at AI Engineer Summit in June". Unknown user/conference → 200 `{intros: []}`.
- `GET /api/users/:id/network?confId=&now=`: ~130–160 ms warm on the demo graph (first call after boot ~500 ms). `users[]` = other attendees with plan/check-in overlap or shared goal topics, sorted by overlap; every `user.personId` set. `freeSlots` = up to 3 mutual gaps after `now` (≤30 min each), inside both availability windows, around both plans and accepted meets; pass the same `now` you use for plan. `incoming`/`outgoing` = all requests for this conference, any status. Unknown user → 200 empty.
- `POST /api/users/:id/meet` body `{confId, toUserId, note, proposal}` → `MeetRequest` (pending). A second request to the same user while one is open updates it (same id). Self → 400, unknown user → 404.
- `POST /api/meets/:id/respond` `{action, proposal?}`: `counter` needs `proposal` → `status:"countered"`; `decline`; `accept` → a `Meet` node (id = request id) both users `ATTENDS`; slot = `proposal.slot`, else 20 min right after `proposal.sessionId` ("Outside Stage B"), else the first mutual free slot. **Both users' next `GET plan` has a `type:"meet"` itinerary item** (`item.id` = meet id, `title` "Meet Emily Chen", `subtitle` = place, `why[0]` path user → Meet → other user). Unknown meet → 404.
- `GET /api/people/:id?confId=&userId=`: sessions at `confId` (all if omitted), `why` (met before, warm intro, speaks on / works at a sponsor offering your goal topic) only when `userId` given, `metBefore` from MET edges at other conferences. `person.userId` set for users. Unknown → 404.
- `GET /api/search?confId=&q=`: people first (name prefix / word prefix / company prefix among speakers, attendees, booth staff, then vector), sessions (title contains + vector), booths (company name + vector). `q` < 2 chars → all empty. ~300–550 ms with real embeddings.
- For #7 constellation (whoever builds it): accepted meets are `(:User)-[:ATTENDS]->(:Meet {status:'accepted', conferenceId, slotFrom, slotTo, place, title})`, `(Meet)-[:AT]->(Session)` if proposed, `(Meet)-[:DURING]->(Conference)`.
- Verify: `tests/network.test.ts`.

### 13:40 PT · sudhersan → ryan · route POST /api/conferences is live
- **POST** `api.addConference(url)`: real Scout. Body `{url}`. `AddConferenceResponse` unchanged (`conference`, `counts`, `cached`). An already-imported URL (http/https, with or without a trailing slash) returns `cached:true` and does not refetch. Missing `{url}` → 400 `{error}`. `not a URL`, no timed agenda, or a Sessionize URL with no public code → 422 `{error}`. `maxDuration` is 300. `USE_MOCKS=true` still returns the mock.
- **GET** `api.conference(id)` is real too. Unknown id → 404 `{error}`. `ConferenceDetail` gains optional `sponsors?: Company[]` (every sponsor, tier order; enriched rows have `description` and `via:"unlocker"`). Mock includes `sponsors`.
- **Contract, additive:** `Conference.timezone?: string` (IANA). KubeCon NA 2026 resolves to `America/Denver` (Salt Lake City). Seeded PTC, AI Engineer Summit, and GitHub Universe, plus the PTC mock, are `America/Los_Angeles`. Use this field when it is set. `Via` gains `"web"` (sponsor names taken from the conference site before enrichment). Session `start`/`end` stay ISO with the venue offset.
- **No UI call-site change** beyond reading `timezone` and `sponsors` when present. `lib/client.ts` already has `addConference` and `conference`.
- Prewarm cache is in this PR: **26 Bright Data requests** (23 unlocker + 3 SERP), under the cap of 30. 22 LLM memos and 2 plain HTTP pages (KubeCon home, Sessionize All) do not count.
- **Coordinator, demo graph only** (cache is already warm; do not prewarm): `$env:FALKORDB_GRAPH='conftellations'; $env:CACHE_ONLY='true'; npx tsx scripts/import-conference.ts` — default URL is KubeCon NA. First run `cached=false`, id `kubecon-cloudnativecon-north-america-2026`, Bright Data requests=0. A second run is `cached=true`. Seeded PTC / June / GitHub Universe pick up `timezone` only after a reseed; this import does not reseed them.
- **Assumption:** onboarding still creates `ATTENDS`. Scout does not. This import does not touch the demo graph until that command runs.
- Verify: `npx vitest run tests/scout.test.ts`.

### 13:40 PT · sudhersan → ryan · network meet rules tightened (#9)
- No response-shape changes. `runPlanner`'s signature is unchanged.
- `freeSlots` on `GET /api/users/:id/network` use **both** users' `availFrom`/`availTo`. Stored `user.blocks` (lunch and other itinerary blocks) are busy, along with planned slots and accepted meets.
- Overlap counts a check-in (`kind:"checkin"`) or a shared moment, not a private note, and a stop that is both planned and captured counts once.
- `POST /api/meets/:id/respond`: an explicit slot that is backwards, outside the conference day, already started, or overlapping either person's busy time → **400** `{error}`. A `proposal.sessionId` from another conference → **400**. `decline` or `counter` of an accepted request deletes the Meet node, so the next `GET plan` for both users omits it. `accept` of a declined request → **409**.
- `POST /api/users/:id/meet`: if the other person already has an open (pending/countered) request for this pair and conference, that request is returned. One open request per pair. A repeat in the same direction still updates it.
- Search still returns the same types. Vector neighbors are taken from a wider set before the conference filter, so another conference filling the old top 15 no longer hides this conference's hits.
- **Coordinator**: no reseed. Behavior only; the demo graph already has the edges these routes read.
- Verify: `npx vitest run tests/network.test.ts`.
### 14:00 PT · sudhersan → ryan · accept needs a real slot (#9)
- Still no response-shape change. `accept` now refuses to write a Meet with an empty time: if there is no explicit slot, no valid post-session gap, and no mutual free slot, the request stays as it was and the route returns **400** `{error:"no mutual free slot"}`.
- The 20 minutes after a proposed session uses the same checks as an explicit slot: inside the conference day, not already started, inside both `availFrom`/`availTo` windows, and not overlapping either person's plans, blocks, or other accepted meets. A miss is **400** (`slot is outside availability` / `slot is already committed` / the earlier slot errors).
- No UI change. No reseed.

### 13:42 PT · sudhersan → ryan · stop: do not continue from the current UI

I rejected the current look. Do not extend the deployed page or the current app-shell visual (galaxy fly-in, painted nebula, shiny space theme).

Rebuild the shell from my 12:05 direction: dark `#0B0B12`, restrained violet neon, crisp constellation dots and thin lines, conference cues (room, booth, time). Sleek and quiet, not galactic and not shiny. `/` should not be a galaxy spectacle.

`docs/DESIGN.md` must be updated to match that before more screens are built. I do not want more screens on top of the current look.

No API or contract change.

### 13:50 PT · sudhersan → ryan · share, uploads, and steer undo
- **Share** (`POST /api/moments/:id/share`): body is still `{to}` plus required `userId` (JSON field or `?userId=`). Only the user who captured the moment can change sharing. Missing `userId` → 400 `{error:"userId is required"}`. Unknown id → 404. Another user's moment → 403. Success still returns the `Moment`. Client: `api.shareMoment(momentId, to, userId)` — pass the viewer id as the third arg. A call that omits it is rejected.
- **Uploads** (`GET /api/uploads/:file`): require `?userId=` or `?momentId=` (400 if neither). The file must belong to a Moment. Allowed when that moment is `shared:true`, or when `userId` is its owner; otherwise 403. `Cache-Control` is `private, no-store`. `moment.mediaUrl` is still `/api/uploads/<file>` with no query. New helper `mediaSrc(mediaUrl, { userId, momentId })` in `lib/client.ts` — use it as the img/audio src. Private photos need the viewer's `userId`; a shared photo can use `momentId` alone.
- **Steer undo**: `SteerOp` `add_goal` gained optional `goalId?`, `weight?`, `topics?`. Undo of `remove_goal` sends `add_goal` with the original `goalId` so that goal and its topic links are restored on that id, not created under a new slug. Post `res.undo` back unchanged; don't rebuild `add_goal` from the text alone.
- **Onboarding person ids** (new users only): `slug(name)@user-<percent-encoded userId>` so user ids that slug the same do not merge. Seeded person ids are unchanged.
- Assumption: still no server auth; `userId` is the demo caller the UI sends, same as other routes. Loading `mediaUrl` as a raw src returns 400.
- Verify: `npx vitest run tests/scribe.test.ts tests/steer.test.ts tests/brief-cite.test.ts`. Share without `userId` → 400; `userId` of the owner → 200; another user → 403.
