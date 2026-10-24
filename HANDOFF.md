# HANDOFF

Living, harness-agnostic handoff for whichever agent is driving (Claude Code, Cursor, Codex…). First written 2026-10-24 ~11:45 PT by Claude Code when Sudhersan switched to Cursor; **Sudhersan returns to Claude Code at ~13:50 PT**. Read this first, then `CLAUDE.md` (rules and ownership), then `lib/types.ts` (the contract). Product spec: `conftellations-spec.md`. Parent issue: **#21**.

## Keeping this file alive (REQUIRED for every agent)

- **Update this file as you code**, not at the end: after each finished issue, each route made real, each verified fact, each decision from the user, and before any pause. Commit it with the work (`docs(handoff): …`) and push.
- **Harness-agnostic**: plain Markdown, repo-relative paths, shell commands that run anywhere. No references to one tool's UI, slash commands or chat history as the only record. If a fact lives only in your chat, it's lost. Write it here.
- Keep §0 TL;DR and §7 Next steps **current** (rewrite them; don't append stale versions). Add to §11 Log (newest at the bottom, one line per entry with the PT time).
- Move resolved items out of §9 Open questions into §4 Decisions.
- Notes meant for Ryan's agent still go in `COMMS.md`; this file is for whoever continues Sudhersan's backend work.

---

## 0. TL;DR

- **What**: Conftellations, an attendee-owned conference brain. Hackathon: Patch the Conference (WeMakeDevs), **Sat Oct 24 2026, SF. Code freeze 16:45 PT, demo 17:30 PT.** Main track FalkorDB, secondary Bright Data, Qodo reviews PRs.
- **Team**: **Sudhersan** (`sudhersankv`, you/Cursor) = graph + backend + deploy. **Ryan** (`RyanV27`, his own agent) = UI. Ryan is setting up Qodo on the repo right now.
- **State (12:37 PT)**: **#2 done** (adapters), **#1 done** (demo graph, real OpenAI embeddings), **#4 done** (Planner: `GET /plan` + `POST /feedback` real; seed writes Sam's PLANS). **#19 Fly deploy + CI** landed (`236380c`, by a parallel agent): **live at https://conftellations.fly.dev**, every push to `main` typechecks then deploys (newer pushes cancel older deploys).
- **Git workflow changed (PR #22, 12:38 PT)**: branch per issue (`<type>/<issue#>-<slug>`), push the branch, Ryan opens/merges PRs, never commit to `main`. See `CLAUDE.md` "Git workflow". Other routes still serve mocks. 26 tests pass (`npm test`, ~45 s).
- **Ryan's agent posted a 22-point integration list in `COMMS.md` (19:24 + 19:28 entries)**: read it before making any route real. Planner points are answered; open ones: `SkyNode.fit`, mock path/Sky id fixes (#7), `Conference.timezone?`, `CreateMomentFields.clientId?` (#6), `SteerRequest.ops?` for Undo (#5), `createMoment` <1 s, search name-prefix (#9).
- **Working mode (user, 11:50 PT)**: go **module by module**, test each live before moving on, ask the user on use-case questions instead of assuming.
- **LLM**: `OPENAI_MODEL=gpt-5.4-nano` (user's choice; verified live, ~2 s structured call). `lib/llm.ts` sends `reasoning_effort` (env `OPENAI_REASONING_EFFORT`, default `low`) instead of `temperature` for gpt-5*/o* models.
- **Bright Data: working** (12:04 PT). User ran `npx bdata login`, which created zones `cli_unlocker` (unblocker) + `cli_browser`. `.env.local`: `BRIGHTDATA_UNLOCKER_ZONE=cli_unlocker`, `BRIGHTDATA_SERP_ZONE=cli_unlocker` (SERP via the unlocker zone works with `&brd_json=1`). Verified live: `unlock()` ~23 s/page, `serp()` ~18 s, 9 organic results. **Slow: pre-warm the cache before the demo.** Our API key still can't create zones (not admin); `scripts/bd-zones.ts` lists them.
- **Contract additions (12:11 PT)**: `GET /api/people/:id` → `PersonDetail` (stub, real handler is backend work with #9), `PlanResponse.now?` (Planner/#4 must fill it: latest check-in else planned session containing now), `CreateMomentFields`, `community(sessionId, userId?)` (#10 must honour `userId`).
- **UI direction** posted to Ryan in COMMS.md (12:05 PT): dark, sleek, Gen Z, restrained neon; constellation not galaxy; conference cues; surface Scout/Planner/Steer/Scribe/Recapper subtly.
- **Your next task**: **#6** Scribe (capture; user said "tracking", assumed Scribe), **#7** Constellation, **#3** Scout (live demo = **KubeCon NA 2026 via Sessionize + Bright Data sponsor enrichment**). See §7.

---

## 1. Repo & environment

- Repo: https://github.com/sudhersankv/conftellation (**PUBLIC**: never commit secrets). Local: `D:\conftellation`, Windows 11, Node 22.16, npm 10.9, git, `gh` (logged in as sudhersankv), `flyctl` 0.4.111 (logged in, personal org), Docker 29.6 (Desktop was started, but we don't need it: FalkorDB is hosted).
- Branch: `main`. Work on small branches → PR → `Closes #N`. Qodo reviews PRs.
- Line endings: files were written with LF; git warns about CRLF. Harmless.

### Env
- `.env.example` (committed) lists every variable.
- `.env.local` (gitignored, exists locally) already has the **hosted FalkorDB** credentials:
  `FALKORDB_HOST/PORT/USERNAME/PASSWORD`, `FALKORDB_TLS=true`, `FALKORDB_GRAPH=conftellations`. It is the hackathon-provided temp instance (port 58007, TLS).
- Still empty: `OPENAI_API_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE`, Studio ids. `DEMO_MODE=true`, `USE_MOCKS=false`.
- Scripts and tests load `.env.local` via `dotenv`. Next loads it automatically.

### Commands
```bash
npm install
npm run falkor:ping     # connect, param query, vector index sanity check (passes)
npm run dev             # http://localhost:3001 (FalkorDB Browser would use 3000 locally)
npm test                # vitest, tests/**/*.test.ts, uses graph "<FALKORDB_GRAPH>_test"
npm run typecheck
npm run seed            # NOT WRITTEN YET (issue #1): tsx seed/seed.ts
npm run smoke           # NOT WRITTEN YET: tsx scripts/smoke.ts
```

---

## 2. What exists (done this session)

| Path | What |
|---|---|
| `lib/types.ts` | **The contract.** Every request/response type for spec §11 routes, plus `WhyPath`, `PlanItem`, `SteerOp`, `SkyNode`, etc. Changes are additive (optional fields), shipped with the mock update, and announced in COMMS.md. |
| `lib/client.ts` | Typed browser client `api.*`. The UI must use only this. |
| `mocks/index.ts` | Fixtures for every route, consistent demo story: user `sam`, other user `emily`, conference `ptc-2026`, goals `g-tracing`/`g-infra`/`g-role`, problem `pr-tracing`, sessions `s-graphrag`/`s-tracing`/`s-scrape`/`s-infra`, booths `b-acme` (Booth 14, Acme Trace)/`b-falkor`, people `jake-morales@falkordb`, `mike-okafor@acmetrace`, `emily-chen@tensorgrid`. **Seed ids must match these.** |
| `app/api/**/route.ts` | 18 route stubs (all spec §11 routes), each returning its mock. Replace the body with the real handler and keep the return type. Use `handle()` and `json<T>()` / `error()` from `lib/http.ts`. |
| `lib/http.ts` | `json`, `error`, `handle` (turns throws into `{error}` JSON), `useMocks()`. |
| `lib/falkor.ts` | FalkorDB singleton (survives HMR via `globalThis`), `q()` (read/write), `ro()` (read-only), `vecf32()` inline literal helper. Uses HOST/PORT/TLS if `FALKORDB_HOST` is set, else `FALKORDB_URL`. |
| `lib/llm.ts` | `embed(texts)` (batched 100), `embedOne`, `structured(zodSchema, system, user)` via `chat.completions.parse` + `zodResponseFormat`, `hasLLM()`, `embedderName()`. **No key (or `EMBED_FAKE=true`) → `fakeEmbed`**: deterministic 1536-d feature hashing of words + bigrams (lexical similarity, so vector search still ranks sensibly). `structured()` throws without a key; callers must check `hasLLM()` and fall back. |
| `lib/brightdata.ts` | `unlock(url,{format})`, `serp(query)`, `studio(collectorId, inputs)`, `scraperApi(datasetId, inputs)`, plus `fetchText`/`fetchJson` for plain HTTP. All return `{data, cached, collectedAt, via, source}`. Cache: `seed/raw/cache/<sha1(key)>.json` (override `BRIGHTDATA_CACHE_DIR`). Cap: `BRIGHTDATA_MAX_REQUESTS` per process, counts only Bright Data calls (not plain HTTP). `CACHE_ONLY=true` = offline, miss throws. |
| `lib/agents/scout/normalized.ts` | `NormalizedConference` (the one ingest shape) + identity helpers: `slug`, `companySlug` ("Acme Trace"→`acmetrace`), `personId` (`jake-morales@falkordb`), `companyId` (domain else slug), `topicId` (lowercase, parentheticals dropped, **no singularization** so mock topic ids like `agents` survive), `stripHtml`. |
| `lib/agents/scout/upsert.ts` | `upsertConference(norm)` → `{counts, ids}`. MERGE-only, batched `UNWIND`; companies resolved by name in-batch **and** against existing graph companies (so "TrueFoundry" in June maps to `truefoundry.com`); topics merged into existing ones at cosine sim ≥ 0.9; embeds Session/Person/Company. `writeEmbeddings(label, items)` reusable. |
| `lib/agents/scout/adapters/rainfocus.ts` | RainFocus slim sessions + exhibitors → normalized (UTC → venue tz, type→kind, Topic/product attributes → topics). |
| `lib/schema.ts` | `ensureIndexes()` range + vector indexes (idempotent). |
| `lib/time.ts` | `isoInZone(date, tz)`, `localToIso(local, tz)`, `PT`. |
| `seed/ptc.json`, `seed/ai-eng-summit-june.json` | Hand-written PTC (fabricated plausible schedule 10:00–18:30, clashes at 11:30/13:00/14:00/15:00 on purpose) and June conference. `via:"seed"`. |
| `seed/personal.ts`, `seed/demo.ts`, `seed/seed.ts`, `seed/env.ts` | Personal layer (Sam/Emily/Mike + 12 generated `u-*` users, deterministic), `seedDemo()` reused by tests, CLI. Scripts import `seed/env.ts` first so `.env.local` loads before `lib/falkor` reads the graph name. |
| `scripts/inspect.ts` (`npm run inspect`) | Sanity queries on the demo graph (Q1, vector, Q6, dupes). |
| `tests/fakes.ts`, `tests/helpers.ts`, `tests/seed.test.ts` | `fakeLlm` for `vi.mock` (use dynamic import inside the factory), `seedOnce()` seeds `_test` (no GitHub Universe, ~18 s), `req()`. Vitest runs files sequentially (`fileParallelism:false`) since they share `_test`. |
| `tests/adapters.test.ts` | Primed cache → 0 network calls for every adapter fn; cap; CACHE_ONLY; fake embedder sanity. |
| `lib/agents/scout/normalized.ts` | `NormalizedConference` (the one shape every ingest path produces) + identity helpers: `slug`, `companySlug` ("Acme Trace"→"acmetrace"), `personId(name, company)` → `jake-morales@falkordb`, `companyId(name, website)` → domain or slug, `topicId` (lowercase, no parentheticals; **no singularisation**, to keep mock ids like `agents`), `stripHtml`. |
| `lib/agents/scout/upsert.ts` | `upsertConference(norm)` → `{counts, ids}`. MERGE-only, batched UNWIND/FOREACH, stamps `source/collectedAt/via`. Resolves speaker companies against the batch **and existing graph companies by name** (so "TrueFoundry" → `truefoundry.com`). New topics merge into an existing Topic at similarity ≥ 0.9. Embeds Session/Person/Company. Also exports `resolveTopics`, `writeEmbeddings(label, [{id,text}])`. |
| `lib/agents/scout/adapters/rainfocus.ts` | RainFocus slim sessions + exhibitors → normalized (kind map, topic aliases, UTC → venue tz). |
| `lib/schema.ts` | `ensureIndexes()`: range indexes on every label's id (+ Conference.url) and vector indexes (1536, cosine) on Session/Person/Company/Topic. Idempotent. |
| `lib/time.ts` | `isoInZone(date, tz)`, `localToIso(local, tz)`, `PT`, `ms()`. |
| `seed/ptc.json`, `seed/ai-eng-summit-june.json` | Hand-written normalized conferences (fabricated but plausible PTC schedule 10:00–18:30 with deliberate clashes at 11:30, 13:00, 14:00, 15:00; 7 booths in walking order 2..14). |
| `seed/personal.ts` | Sam (3 goals, problem, June MET Jake, today's moments m1–m6, MET Mike/Emily), Emily (hiring; checked in at s-graphrag + s-tracing → warm intro), Mike (booth staff), 12 generated users `u-ana…u-lia` (deterministic PRNG) with goals, PLANS, check-ins, shared notes clustered mid-session (hot moments), pending meet `meet-1` sam→emily. Sam's PLANS edges are written by the Planner at the end of `seedDemo()` (now = `DEMO_NOW` or 12:30). |
| `seed/demo.ts`, `seed/seed.ts`, `seed/env.ts` | `seedDemo({githubUniverse})` = wipe → indexes → PTC → June → GitHub Universe → personal. CLI `npm run seed [-- --no-ghu]` (~45 s with real embeddings). `seed/env.ts` must be the first import in CLI scripts. |
| `scripts/inspect.ts` | `npm run inspect`: label counts, Q1, a vector query, Q6, identity checks. |
| `tests/fakes.ts`, `tests/helpers.ts`, `tests/seed.test.ts` | `fakeLlm(orig, structuredImpl?)` for `vi.mock("@/lib/llm", async (orig) => (await import("./fakes")).fakeLlm(await orig()))`; `seedOnce()` seeds `_test` (no GHU); `req(url, body?)` builds a `Request`. Vitest runs files sequentially (shared `_test` graph). |
| `lib/agents/planner/index.ts` | `runPlanner(userId, confId, {now?, write?})` → `{plan, diff}`; throws `NotFound`. Score = Σ goal weight over distinct goals + 0.1·extra topics + 0.5·boosted + 0.3·vector sim; people +0.2 speaker / +0.1 sponsor / +0.4 met-before / +0.3 intent (job goal ↔ person `openTo:hiring`); booths +0.4 if you met staff. Every why is a template over a real path (`fitWhy` keeps it ≤110 chars). byGoal lists items under every goal they serve; `goalId` = best goal. `write` replaces the conference's PLANS edges. |
| `lib/agents/planner/itinerary.ts` | Pure `buildItinerary`: done/pinned fixed, greedy by score without clashes inside the availability window minus blocks, then booth runs in walking order in gaps **after `now`**. Unit tests: `tests/itinerary.test.ts`. |
| `lib/queries/plan.ts`, `lib/queries/feedback.ts` | Planner Cypher (user state, session/person/booth candidate paths, vector sim, details, `writePlans`) and `writeFeedback` (SKIPPED/BOOSTED, removes the opposite edge). |
| `app/api/users/[id]/plan`, `.../feedback` | **Live.** `?now=` or `DEMO_NOW` env. Unknown user → 200 empty plan. Route tests: `tests/planner.test.ts`. `npx tsx scripts/plan-demo.ts [user] [now]` prints a plan + lint (long whys, missing details). |
| `scripts/falkor-ping.ts` | Connectivity + vector sanity check. |
| `tests/setup.ts`, `tests/contract.test.ts`, `vitest.config.ts` | vitest with `@` alias. Setup forces graph `<name>_test`. Contract tests check the fixture invariants (3 passing). |
| `CLAUDE.md` | Principles, ownership, run commands, FalkorDB facts. **Cursor should treat it as the project rules** (`AGENTS.md` and `.cursor/rules/` point to it). |
| `COMMS.md` | Append-only notes between Sudhersan's and Ryan's agents. First entry: "contract locked". |
| `next.config.mjs` | `output: "standalone"` (for the Fly Docker image). |
| `seed/raw/*` | Raw scrape samples (see §5). |
| `SKILLS_SETUP.md` | Older notes. **Partly stale**: it says the FalkorDB skills and Bright Data CLI were "done", but they were not present in this folder. The Bright Data CLI is now installed as a devDependency; the FalkorDB skills are not cloned. |

`app/page.tsx`, `app/layout.tsx`, `app/globals.css` are still the create-next-app defaults. Ryan replaces them in #11.

### Dependencies installed
Runtime: `next@14.2.35`, `react@18`, `falkordb@6.9.2`, `openai`, `zod`, `react-force-graph-2d`.
Dev: `typescript`, `tailwindcss@3`, `eslint`, `vitest`, `tsx`, `dotenv`, `@brightdata/cli` (`npx bdata`), `@types/node@22` (needed: vitest 5 rejects `@types/node@20`).

---

## 3. Verified facts (don't re-derive)

### FalkorDB (hosted hackathon instance)
- TLS connection works with the `falkordb` Node client using `socket: { host, port, tls: true }` + `username`/`password`.
- Graph list was empty at first. Our graph name is `conftellations`; tests use `conftellations_test`.
- **Query parameters work**, including inside vector calls: `CALL db.idx.vector.queryNodes('Session','embedding',10, vecf32($v)) YIELD node, score`. No need to inline vectors (`vecf32()` helper exists if needed).
- **Vector `score` is a cosine DISTANCE**: lower = closer. Sort ascending; similarity = `1 - score`.
- Vector index DDL that worked: `CREATE VECTOR INDEX FOR (p:Label) ON (p.prop) OPTIONS {dimension:N, similarityFunction:'cosine'}`. Use dimension 1536 for `text-embedding-3-small`.
- Vector search can't filter by property: filter by conference in a following `MATCH`.
- After an aggregation, `ORDER BY` may only reference projected aliases (`RETURN s.start AS start, count(t) AS n ORDER BY n DESC, start`), not `s.start`.
- `SET n += $map`, `UNWIND $rows` + `vecf32(r.v)`, and `FOREACH (x IN list | MERGE ...)` all work.
- **Why-paths: use named paths.** `MATCH p = (u)-[:MET]->(a)<-[:IS]-(au)-[:CAPTURED]->(m)-[:AT]->(s)<-[:SPEAKS_AT]-(b) RETURN [n IN nodes(p) | {id:n.id, label:labels(n)[0], name:coalesce(n.name,n.title,n.kind)}] AS nodes, [r IN relationships(p) | {type:type(r), from:startNode(r).id, to:endNode(r).id}] AS edges` returns `WhyPath` shape directly (verified 12:18 PT).
- `shortestPath` only works in `WITH`/`RETURN` (`WITH shortestPath((u)-[*..4]->(j)) AS p`), **directed only**; undirected is unsupported.
- Vector query can take a stored embedding: `MATCH (g:Goal {id:$id}) CALL db.idx.vector.queryNodes('Session','embedding',30,g.embedding) ...` (no need to send the vector from JS).
- Times are compared as strings in Cypher (`s.start >= u.availFrom`), so **every stored time must be ISO with the same `-07:00` offset** (seed fixed 12:17 PT; generated moments were UTC `Z`).

### Spec queries on the demo graph (`npx tsx scripts/queries-check.ts`, 12:18 PT)
Q1 ✓ (s-tracing, s-otel top for g-tracing) · Q1b vector ✓ · Q2 ✓ (Jake, Arjun, Emily, Noa for g-infra) · Q3 ✓ (Booth 14 Acme Trace, "you met Mike") · Q4 ✓ but **`sum(DISTINCT g.weight)` is wrong** (collapses equal weights; sum per distinct goal instead) · Q5 ✓ (Emily → Priya Nair, speaks on agent tracing) · Q6 ✓ (Jake, met at AI Eng Summit) · **Q7 as written returns 0** until Sam has PLANS; use `[:PLANS|CAPTURED|AT*1..2]` to include check-ins (5 users share s-graphrag) · Q7b ✓ · Q9 ✓ (m2, m-x1) · Q9b ✓ · Q10 ✓ · Q11 inputs ✓ (Sam: 4 goals/problems, 8 moments, 3 met, 0 plans → Planner must write PLANS).
- `tsconfig.json` needed `"target": "es2017"` (Set/Map iteration). Delete `tsconfig.tsbuildinfo` if tsc shows stale errors.
- `ORDER BY` after an aggregation can only reference projected aliases (`RETURN s.start AS start … ORDER BY start`, not `ORDER BY s.start`).
- `SET n += $map` works; `FOREACH (x IN list | MERGE …)` works inside UNWIND batches; `vecf32(r.v)` works on UNWIND rows from params.
- Real `text-embedding-3-small` distances on the seed: a good match is ~0.29–0.40, unrelated ≥ 0.55.
- FalkorDB Browser for the demo: the hosted instance should have a cloud browser UI (check the FalkorDB Cloud dashboard). Locally it is `docker run -p 6379:6379 -p 3000:3000 falkordb/falkordb` → http://localhost:3000.

### Conference scraping (probe results; full detail in issue #3 comment)
All plain HTTP on public pages. **No Bright Data needed for these two.**

**GitHub Universe 2026: RainFocus**
- `POST https://events.rainfocus.com/api/search`, `Content-Type: application/x-www-form-urlencoded`
- Headers: `rfApiProfileId: TJRfOIsFkCN8hnKQS3oqHpRTCt7LQMuV`, `rfWidgetId: 1778595031036001ei5o` (sessions + speakers) or `1775680413768003YDHF` (sponsors); `Origin`/`Referer: https://reg.githubuniverse.com/`
- Body: `type=session|speaker|exhibitor&size=50&from=N`. **Max 50 per page.** First page: `sectionList[0].items`; later pages: top-level `items`.
- Discover ids generically: `POST https://reg.githubuniverse.com/flow/loadPage` with `pageUri=sessioncatalog&workflowApiToken=github.universe26.attendee-portal` → `widgetConf.apiProfileToken` + `data-widgetid` in `pageData`.
- 157 sessions (all timed), 183 speakers, 54 sponsors (with descriptions; only 1 booth number).
- Session fields: `sessionID, code, title, abstract (HTML), type, times[{utcStartTime, utcEndTime, room}], participants[], attributevalues[] (Track, Topic, Level, …)`. Filter `participants[].session[]` to `published` (rehearsal sessions leak in).

**KubeCon + CloudNativeCon NA 2026 (Salt Lake City, Nov 9–12): Sessionize** (not sched this year)
- `GET https://sessionize.com/api/v2/svi82w6c/view/All`: 574 sessions, 701 speakers, 35 rooms, categories. No auth.
- `startsAt`/`endsAt` are **local, no timezone** (America/Denver; Nov 9–12 is after DST ends, so MST `-07:00`).
- Speaker company/title are in `questionAnswers`. Code found in the LF schedule page HTML as `sessionizeApiCode`.
- Sponsors: not in Sessionize. 242 sponsors (tier, name, url) parsed from `https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/sponsor-list/`. No descriptions, no booths. **This is where Bright Data (SERP + Unlocker) earns its place: sponsor enrichment.**

**sched.com** (checked on kccncna2025): `GET /all.ics` returns every session (room, UTC times, description, URL). `/list/descriptions` (HTML) gives speakers. `/api/session/export` needs the organizer's key, so don't use it.

**Ingest router order (issue #3):** Sessionize → sched → RainFocus → Pretalx (untested; `/schedule/export/schedule.json`) → `.ics`/JSON-LD → **Bright Data Web Unlocker markdown + LLM extraction**. Always also look for a sponsors/expo page. All routes → one `NormalizedConference` → identity rules (spec §5.3) → embed → `MERGE` with `source/collectedAt/via`.

**Live demo**: pick a conference on its own website (not a platform) for the "paste any URL" moment so the Unlocker path runs on stage. Still undecided; ask the user.

---

## 4. Decisions made with the user

1. This folder is the repo; pushed to the GitHub repo above.
2. Secrets: user fills `.env.local`; we never print or commit them. `.env.example` is committed.
3. FalkorDB: use the **hosted hackathon instance** (not local Docker).
4. Two people: issues split and assigned (Sudhersan backend/infra, Ryan UI); `COMMS.md` for agent-to-agent notes; each UI issue is paired with a BE issue in the same time window.
5. Scrape GitHub Universe + KubeCon (done, §3), and support "any conference" with a normalized format into the graph.
6. "$50 credits" from a sponsor: **unknown which sponsor**. Ask.
7. User said yes to everything: cache all Bright Data responses + cap requests; test strategy below; install deps freely.
8. Generate random other users (10–15) so network/community look alive.
9. Build order = what wins the hack first (spec §15 "never cut" list).
10. Full authority, but stay in scope: a strong demoable MVP. Use the user's PowerShell; Docker may be started.
11. Deploy target: **Fly.io** (issue #19).
12. Contracts and pipeline locked so UI work runs in parallel.
13. (11:56 PT) LLM model `gpt-5.4-nano`. PTC data may be fabricated. Live import demo = KubeCon NA 2026 (Sessionize) + Bright Data sponsor enrichment. Work module by module, testing each, and ask on use-case questions.

### Test strategy (agreed; also in #21)
- **Primary seam: route handlers.** Call them directly with a `Request` against the `_test` graph seeded from a small fixture. Assert response + resulting graph state. No assertions on Cypher text or prompts.
- **Secondary seam: `lib/llm.ts` and `lib/brightdata.ts`**, faked at the module boundary in tests (`vi.mock`) with deterministic outputs. Real calls only in `npm run smoke`.
- Pure unit tests only for the itinerary builder and the brief citation parser.
- Contract tests on fixtures (exist).
- UI: Playwright screenshots at 390px (Ryan's side / optional).

---

## 5. Files in `seed/raw/`

| File | Content |
|---|---|
| `github-universe-2026-sessions.slim.json` | **Use this.** All 157 sessions, slimmed (times, room, speakers, abstract, attributes). |
| `github-universe-2026-sessions.json` | Raw RainFocus, first 117 sessions only (size cap). |
| `github-universe-2026-speakers.json` | 183 speakers. |
| `github-universe-2026-sponsors.json` | 54 sponsors. |
| `kubecon-na-2026-sessionize-all.json` | Complete Sessionize "All" view (574 sessions). |
| `kubecon-na-2026-sponsors.json` | 242 sponsors `{tier, name, url}`. |
| `kubecon-na-2025-sched-all.ics` | sched `.ics` sample. |
| `kubecon-na-2025-sched-*.html` | sched HTML samples (`*.html` is gitignored). |

---

## 6. GitHub issues

Labels: `P0` / `P1` / `P2`, `backend` / `ui` / `infra`, `ready-for-agent`.

| # | Title | Owner | Window (PT) |
|---|---|---|---|
| 21 | **Spec: Conftellations MVP** (parent, 68 user stories, impl + test decisions) | — | — |
| 1 | [BE] Seed: demo graph | Sudhersan | 11:40–12:45 |
| 2 | [BE] lib/llm.ts + lib/brightdata.ts (cached, capped) | Sudhersan | 11:40–12:15 |
| 3 | [BE] Scout: ingest any URL → normalized graph (has probe comment) | Sudhersan | 12:15–13:15 |
| 4 | [BE] Planner: Q1–Q4 + itinerary (GET /plan, POST /feedback) | Sudhersan | 12:45–14:00 |
| 5 | [BE] Steer (POST /steer) | Sudhersan | 14:00–14:45 |
| 6 | [BE] Scribe: capture (POST /moments, share) | Sudhersan | 13:15–14:00 |
| 7 | [BE] Constellation Q11 | Sudhersan | 14:00–14:30 |
| 8 | [BE] Recapper: brief + trip report + DEMO_MODE | Sudhersan | 15:15–16:00 |
| 9 | [BE] Intros, network, meets (Q5–Q7) | Sudhersan | 14:30–15:15 |
| 10 | [BE] Community (Q9) + record (Q10) | Sudhersan | 15:45–16:15 |
| 11–18 | [UI] shell, Sky, Plan, Capture, Brief, Add+onboarding, Person/meet/network, Session/Community/record | Ryan | paired |
| 19 | [INFRA] Deploy to Fly.io | Sudhersan | first by 14:00 |
| 20 | [INFRA] Demo prep | both | 16:15–17:15 |

The backend load is heavy, so prioritise by spec §15 "never cut": Sky with why-paths, steering, capture lighting up stars, brief → path highlight, network + one meet. **Cut order if behind at 14:00**: stretch → community signal (F14) → timeline → hot moments → trip report → live scrape on stage.

`gh issue view N -R sudhersankv/conftellation` for the full bodies.

---

## 7. Next steps for Cursor (in order)

1. ~~#2 adapters~~ **done**. ~~#1 seed~~ **done** (brief/trip/crowd precompute is part of #8; seed should call the planner for Sam once #4 lands).
2. ~~#4 Planner~~ **done** (12:37 PT). ~~#19 Fly deploy + CI~~ **done**: app `conftellations`, `sjc`, 1 always-on `shared-cpu-1x` 1GB machine. Fly secrets copied from `.env.local` (USE_MOCKS=false). Manual redeploy: `fly deploy --remote-only --ha=false`; logs: `fly logs -a conftellations`. Docker build uses `next build --no-lint` (types still checked) so UI lint can't block deploys. No volume: new Bright Data cache entries and `public/uploads/` vanish on redeploy, so **commit pre-warmed cache files** in `seed/raw/cache/`. Two stray Fly deploy tokens exist (`fly tokens list -a conftellations` to revoke).
3. **#6 Scribe** (`POST /api/users/:id/moments`, share): attach to explicit target else `plan.now` rule (latest check-in, else planned session containing now; reuse `nowTarget` in the planner). Honour Ryan's COMMS asks: respond <1 s (topic extraction/embedding after), `clientId` MERGE, `lit` ids must exist in the constellation. Check-in flips PLANS status to done.
4. **#7 Constellation** (Q11): include every node any returned why mentions (topics too), `conferenceId` on all nodes, `fit` = normalised plan score, ≤800 nodes (dust ≤300). Fix mock paths (booth id `b-acme`, topic nodes in mock Sky) in the same PR.
5. **#3 Scout** (`POST /api/conferences`, `GET /api/conferences/:id`): Sessionize KubeCon first (no Bright Data), then sponsor enrichment (cap 20–30 sponsors; confirm credits with the user). Set `maxDuration`; already-imported URL → `cached:true` fast.
6. Then #5 steer (support `ops` for Undo), #9, #8, #10.

For every route you make real: keep the stub's response type, wrap it in `handle()`, add a route-level vitest, update COMMS.md.

---

## 8. Skills & agent tooling in Cursor

### 8.1 Project rules
- `CLAUDE.md` is the source of truth. `AGENTS.md` (Cursor reads it) and `.cursor/rules/conftellations.mdc` (`alwaysApply: true`) point at `CLAUDE.md`, `HANDOFF.md`, `lib/types.ts`, `COMMS.md`.

### 8.2 FalkorDB skills (Cypher reference)
```bash
git clone https://github.com/FalkorDB/skills skills     # gitignored; has its own .git
```
- Overview: `skills/SKILL.md`. Per topic: `skills/<category>-skills/<name>/skill.md` (cypher 16, udf 5, operations 6, ingestion 4).
- In Cursor, `@skills/SKILL.md` or `@skills/cypher-skills` in chat pulls them in. Check vector index, `MERGE`, `UNWIND` batch ingestion and path return syntax there before writing queries.
- Optional **FalkorDB MCP server** (lets the agent inspect schema and run queries): https://docs.falkordb.com/genai-tools/mcpserver/index.md. Add it in Cursor Settings → MCP with the hosted instance's host/port/password (put the password in the Cursor MCP config, not in the repo).

### 8.3 Bright Data skills, CLI and MCP
- CLI is installed: `npx bdata version`. Authenticate with `npx bdata login` (browser OAuth) or set `BRIGHTDATA_API_KEY`. Verify: `npx bdata config`, `npx bdata zones`, `npx bdata budget`.
- Skills: `npx bdata skill list`, then `npx bdata skill add scrape search scraper-studio js-sdk-best-practices` (or one at a time). Check which directory it writes to. If it's `.claude/skills/`, Cursor can still read them by `@`-mentioning the `SKILL.md` files, or copy/symlink them into `.cursor/skills/` (Cursor's agent-skills folder).
- MCP for Cursor (Settings → MCP → add server): URL `https://mcp.brightdata.com/mcp?token=<BRIGHTDATA_API_KEY>`; limit tools with `&groups=scrapers` etc. It uses the same credit pool. **Don't commit the URL with the token.**
- Credits: the free tier has 5,000 credits/month shared; plus possibly the $50 hackathon credits (unconfirmed). Always go through `lib/brightdata.ts` (cache + cap).

### 8.4 Matt Pocock skills in Cursor
These were used in this session from the Claude Code plugin (`/grill-me` → grilling, `/to-spec` → issue #21). For Cursor:
```bash
npx skills@latest add mattpocock/skills -a cursor
```
- When it asks which skills to install, include at least: `setup-matt-pocock-skills`, `grill-me`, `grilling`, `grill-with-docs`, `to-spec`, `to-tickets`, `tdd`, `diagnosing-bugs`, `code-review`, `pr`, `implement`, `implement-spec`, `handoff`, `wizard`.
- Update later: `npx skills@latest update`.
- Then run **`/setup-matt-pocock-skills`** once in this repo. Answers to give: issue tracker = **GitHub** (`sudhersankv/conftellation`, via `gh`); triage labels = use the existing `ready-for-agent` plus `P0`/`P1`/`P2`; domain docs = repo root (`GLOSSARY.md`, `docs/adr/`). It will add an `## Agent skills` section to `AGENTS.md`/`CLAUDE.md`. That's fine.
- Useful during the build: `/tdd` for the planner and Scout adapters, `/diagnosing-bugs` when a Cypher query misbehaves, `/pr` for PR bodies (Qodo reviews them), `/implement` with an issue number.
- Don't install both the plugin form and the skills.sh form for the same agent (you'd get duplicates).

---

## 9. Open questions for the user (blocking or soon-blocking)

1. ~~OPENAI_API_KEY~~ set (11:47 PT). Model `gpt-5.4-nano`.
2. ~~Bright Data zones~~ → `cli_unlocker` for both Unlocker and SERP (12:04 PT).
3. Which sponsor gave the **$50 credits**, and is it applied to the account?
4. Fly.io: confirm app name `conftellations`, region `sjc`, and that the personal org has billing set up.
5. ~~Real PTC details~~ → fabricated is fine (user, 11:56 PT).
6. ~~Live "paste any URL" demo~~ → **KubeCon NA 2026** (Sessionize fast path) + Bright Data sponsor enrichment (user, 11:56 PT).

---

## 10. Gotchas

- `next@14` + `react@18`: route handler params are plain objects (`{ params }: { params: { id: string } }`), not promises.
- `react-force-graph-2d` must be `dynamic(..., { ssr: false })`.
- Don't import `lib/falkor.ts`, `lib/llm.ts` or `lib/brightdata.ts` from client components.
- npm peer conflicts: keep `@types/node@22`.
- KubeCon Sessionize times have no offset; attach the venue timezone when normalizing.
- RainFocus abstracts are HTML: strip tags before embedding.
- GitHub Universe/KubeCon data are real people. Fine to show (public), but **personal-layer data (MET, goals) must stay fictional/seeded** for personas.

---

## 11. Log

Format: `HH:MM PT · agent · what changed (issue #, commit/PR)`

- 11:20 PT · Claude Code · Scaffold, contract, mock routes, FalkorDB client verified, tests; pushed to `main`.
- 11:35 PT · Claude Code · Issues #1–#20 created and assigned; spec issue #21 (`ready-for-agent`).
- 11:40 PT · Claude Code · Scrape probe done (GitHub Universe RainFocus, KubeCon Sessionize); findings on #3; raw data in `seed/raw/`.
- 11:50 PT · Claude Code · HANDOFF.md, AGENTS.md, `.cursor/rules/conftellations.mdc`; handed to Cursor. Next: #2 → #1 → #3 → #4.
- 11:38 PT · Cursor · Env check: `npm install`, `falkor:ping`, `npm test` all pass. OpenAI + Bright Data keys still empty.
- 11:42 PT · Cursor · #2 done: `lib/llm.ts` (fake hash embedder fallback), `lib/brightdata.ts` (sha1 disk cache, cap, CACHE_ONLY), `tests/adapters.test.ts` (7/7 pass). Next: #1 seed.
- 11:47 PT · Cursor · User added OpenAI + Bright Data keys to `.env.local`.
- 11:53 PT · Cursor · #1 done: shared `upsertConference()` + identity rules, RainFocus adapter, `seed/ptc.json`, June conf, personal layer, `npm run seed` (real embeddings, ~45 s), `npm run inspect`, `tests/seed.test.ts`. `Via` widened (`rainfocus`, `ics`; COMMS note). 11/11 tests pass.
- 11:56 PT · Cursor · Model → `gpt-5.4-nano` (verified live). Bright Data: no zones on account, budget 403. Decisions: KubeCon is the live import demo; fabricated PTC is fine; work module by module.
- 11:59 PT · Cursor · Bright Data key can list zones (none) but can't create them (403). `scripts/bd-zones.ts` added. Waiting on user: `bdata login` or admin key.
- 12:18 PT · Cursor · Ran all spec queries on the demo graph (`scripts/queries-check.ts`); results + FalkorDB path facts in §3. Fixed seed: generated moment times now `-07:00`. Reseeded. Started a background agent for #19 (Fly.io deploy + GitHub Actions auto-deploy on push to main; user approved Fly).
- 12:11 PT · Cursor · Contract gaps closed after checking UI issues #11–#18 with gh: `GET /api/people/:id` (`PersonDetail`, stub + mock), `PlanResponse.now?`, `CreateMomentFields` + `momentForm()`, `api.community(sessionId, userId?)`, steer empty-ops + edge-type docs. COMMS note; comments on #11 #12 #13 #14 #17 #18.
- 12:05 PT · Cursor · User ran `bdata login` → `cli_unlocker`. Unlocker + SERP verified live (~20 s each, 2 credits total). UI direction + backend agent vocabulary posted to Ryan in COMMS.md. Next: #3 Scout step 1 (Sessionize/KubeCon).
- 12:37 PT · Cursor · #4 Planner done: `GET /plan` + `POST /feedback` live (~0.9 s), booths only after `now`, byGoal lists items under every goal, hiring intent bonus, whys ≤110 chars. Seed runs the planner for Sam (PLANS edges). 26/26 tests. Replied to Ryan's planner points in COMMS. User asked for "tracking" next → assumed #6 Scribe.
- 12:42 PT · Cursor · Fly deploy confirmed (https://conftellations.fly.dev). Renamed `useFakeEmbed` → `isFakeEmbed` in `lib/llm.ts` (tripped `react-hooks/rules-of-hooks`). Repo moved to branch-per-issue PRs (PR #22); this change is on `fix/19-deploy-followups`.
- 13:05 PT · Claude Code (Ryan) · #11 UI shell on `ui/11-app-shell`: dark tokens + Caslon/Geist fonts, `(sky)` route group with persistent `SkyStage`, top/tab bars, session context (`?as=`, `?now=`), `useSky` store, `useApi`, UI primitives, `call()` JSON fix + `now` option. All UI deps installed. COMMS note 13:05.
