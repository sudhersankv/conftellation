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
- **State**: scaffold, contract, mock-backed routes, FalkorDB client and tests on `main`. **#2 done** (`lib/llm.ts` with a fake embedder fallback, `lib/brightdata.ts` with disk cache + cap). Env verified 11:38 PT (install, falkor:ping, tests all pass).
- **Your next task**: **#1** (seed), then **#3** (Scout), **#4** (Planner), **#7** (Constellation). See §7.
- **Blocked on the user**: `OPENAI_API_KEY`, `BRIGHTDATA_API_KEY` + zone names, which sponsor the "$50 credits" belong to, Fly.io go-ahead, any real PTC details. See §9.

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
| `tests/adapters.test.ts` | Primed cache → 0 network calls for every adapter fn; cap; CACHE_ONLY; fake embedder sanity. |
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

1. ~~#2 adapters~~ **done** (see §2).
2. ~~(merged into 1)~~
3. **#1 seed** (`seed/seed.ts`, `npm run seed`): wipe the graph → indexes (spec §5.4) → load PTC (hand-written `seed/ptc.json`: sponsors FalkorDB, Bright Data, TrueFoundry, Qodo + fictional Acme Trace Booth 14) → GitHub Universe from `seed/raw/github-universe-2026-sessions.slim.json` → AI Eng Summit June (6 sessions, Sam met Jake) → users (`sam`, `emily`, `mike` + 10–15 generated) → Sam's day → embeddings. **Ids must match `mocks/index.ts`.** Without an OpenAI key, write a deterministic fake embedder (hash → 1536-d vector) behind a flag so the graph can be built now and re-embedded later.
4. **#3 Scout**: platform adapters (`sessionize`, `sched`, `rainfocus`, `ics`, `unlocker+llm`) → `NormalizedConference` → shared `upsertConference()` used by both the seed and the route.
5. **#4 Planner** then **#7 Constellation**: these unblock Ryan's Sky (#12) and Plan (#13) on real data. Post `route X is live` in COMMS.md each time.
6. **#19 Fly deploy** early (even on mocks): `Dockerfile` (node:22-alpine, standalone output, `PORT=3001`), `fly launch --no-deploy --name conftellations --region sjc` (confirm with the user first), `fly secrets import < .env.local`, `fly deploy`.
7. Then #6, #5, #9, #8, #10 in that order.

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

1. `OPENAI_API_KEY` and the model name the credits allow → blocks embeddings (#1), extraction (#3), steer (#5), brief (#8).
2. `BRIGHTDATA_API_KEY`, the **Web Unlocker zone name** (`web_unlocker1` vs `cli_unlocker`), the **SERP zone name**, any Scraper Studio collector id.
3. Which sponsor gave the **$50 credits**, and is it applied to the account?
4. Fly.io: confirm app name `conftellations`, region `sjc`, and that the personal org has billing set up.
5. Real PTC details (booth numbers, rooms, workshop times) or OK to fabricate plausible ones.
6. Which non-platform conference URL to use for the live "paste any URL" demo.

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
