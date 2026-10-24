# Conftellations: platform spec (final)

> **Every conference you've been to, connected.**
> Patch the Conference hackathon (WeMakeDevs), Sat Oct 24 2026, San Francisco. Build 11:00 to ~17:15 PT, live demo 17:30.
> Main track: **FalkorDB**. Strong secondary: **Bright Data**. OpenAI runs in the backend only. Qodo reviews PRs if multi-track entry is allowed.
> Written to be handed to coding agents (Claude Code / Cursor). Nothing in here has been run yet; verify queries against a live FalkorDB early.

---

## 1. Product

### 1.1 Problem
Every conference ends the same way: a camera roll of slides, a pocket of badges, a trip report due Monday, and no good way to have planned talks, people and booths together. Two weeks later it's forgotten. Every event uses a different app (Whova, Cvent, Swapcard, Luma...), each controlled by the organizer and locked to that one event, so nothing carries over to the next.

*Example heard at the event:* an attendee at big shows like KubeCon (300 booths) ends up skipping talks entirely because there's no good way to plan talks and booth visits together.

### 1.2 What it is
An **attendee-owned conference brain** that works alongside any event's official app, with no organizer involvement. Paste a conference link and go. The conference, your goals, your team's problems, your notes and the people you meet all live in one graph that grows across every conference you attend.

**The constellation is the main feature.** It's the graph, drawn for the user, and every other screen is a shortcut into it. One living view, three moments:

- **Plan (morning):** your goals in the center. Suggested sessions, people and booths appear as dim outlined stars linked to the goal they serve. A one-line **steer bar** ("leaving at 3pm", "more tracing, less hiring") reshapes it live.
- **Live (during):** every check-in, note, slide snap or "met someone" lights up its star. Unplanned things you did appear as new bright stars. You can see which goals are covered and which are still dark. Other attendees whose stars overlap yours show up, and you can plan to meet them.
- **Remember (night and after):** the nightly brief and trip report, each line tappable to light up its path. Replay the day. Zoom out to every past conference: your personal record.

### 1.3 Principles (non-negotiable)
- **No chatbot.** LLMs run in the backend only. Steering is a single command line that produces structured changes and a visible diff, never a conversation. *"The agents are invisible. The memory isn't."*
- **Logic lives in Cypher.** Relationships, ranking inputs and "why" paths come from FalkorDB queries. The LLM extracts structure from scraped pages, turns steer text into ops, and writes sentences from paths it's given. It never invents relationships.
- **Every suggestion has a why**, and the why is a real graph path that lights up in the constellation.
- **5-second capture or it won't happen.**
- **Mobile-first** for plan and capture; the full constellation also works on a laptop/projector.
- **Public data only.** Scrape public conference pages, never behind logins. People met are user-entered. Personal goals and problems are never shared.
- **Data quality is visible.** Every scraped item shows its source and "collected Xh ago".

### 1.4 Demo personas
- **Sam**: backend engineer at a startup. Goals: "fix agent tracing for my team", "meet AI infra people", "open to a new role".
- **Emily**: engineering manager at an AI infra company, hiring. Also a Conftellations user. Sam meets her today.
- **Jake**: speaker. Sam met him at a past conference (seeded); he's speaking again here.
- **Mike**: engineer staffing a sponsor booth whose product fits Sam's tracing problem. Sam met him at lunch.

---

## 2. Features

Scoped for **2 builders, ~6 hours**. Must = the demo breaks without it. All social data (other users, shared notes, past conference) is seeded, so those features only have to read, not scale.

| # | Feature | Priority |
|---|---|---|
| F1 | **Add a conference**: paste URL → Bright Data (Scraper Studio for JS catalogs, Web Unlocker for simple pages) → LLM extraction → shared conference graph, every row stamped with source + collectedAt. Sessionize JSON fast path. Demo conferences pre-ingested. | Must |
| F2 | **Onboarding**: 1–3 goals (free text + topic chips), team problem, "open to" tags (hiring, job hunting, buying, learning). | Must |
| F3 | **Game plan (multi-hop)**: per goal → **Sessions**, **People** (speakers, sponsor staff, other users), **Booths** (first-class: 1–2 sentence "what they do" + why from your team problem). Every item has a why-path. Built into a **time-blocked itinerary**: best sessions by time, free gaps filled with booth visits in walking order. | Must |
| F4 | **Steer bar**: one line → structured ops (add/remove/reweight goal, time window, block time, booth time, exclude, boost, pin) → graph writes → re-plan → diff toast ("−2 sessions, +Jake's workshop"). | Must |
| F5 | **Card feedback**: "not for me" / "more like this" on any card → `SKIPPED` / `BOOSTED` edge → re-rank. | Must (tiny) |
| F6 | **Capture**: one-tap check-in (session or booth), text note, slide photo (auto-attached to the current session by time), "met someone". | Must |
| F7 | **Constellation (main feature)**: 2D force graph. Plan / Live / Remember states, goal coverage glow, live update on steer and capture, path highlight, replay day, zoom out to all conferences, other users' overlapping stars. | Must |
| F8 | **Nightly brief**: what you learned, who to follow up with and why, what connects to your team problem, seen before. Every line cited to a path and tappable. | Must |
| F9 | **Warm intros + met before**: "Emily, who you met today, was at Jake's workshop; Jake speaks on your problem tomorrow." "You met Jake at AI Engineer Summit in June." | Must |
| F10 | **Attendee network + meet requests**: see other users whose stars overlap yours; send a meet request with a short note proposing a shared session, a free slot from both plans, or a place (Expo Hall); accept / decline / suggest another; accepted meets become stars in both plans. | Must (seeded users) |
| F11 | **Session community layer**: each session page has a Community tab: notes and slide snaps others chose to publish, a **crowd summary** (GraphRAG over published notes, each line cited), and **hot moments** (when most people captured, counts only). Covers sessions you missed due to a clash. | Must (seeded notes) |
| F12 | **Personal record**: one profile with every conference you've attended (sessions, people, moments), its brief and trip report, and the all-conferences constellation. Each user's own conference brain. | Must (same graph, filtered) |
| F13 | **Trip report**: one tap → manager-ready markdown from the same paths. | Should |
| F14 | **Community signal**: Bright Data Reddit scraper on "is {conference} worth it?" threads → small ranking boost + optional why-line ("past attendees rated the workshops highly"). | Should |
| F15 | Timeline list view (the constellation's Live mode mostly covers it). | Should |
| F16 | Voice notes, Conference Wrapped share card, badge-photo OCR, follow-up drafts. | Stretch |

**What's next (pitch only, not built):** the **team brain**: colleagues at the same event split talks and booths ("you cover observability, I'll take security") and get one merged trip report. That's also the revenue path, since companies already pay for the tickets.

Out of scope: real auth (use a demo user switcher), chat, LinkedIn import, organizer features, native app.

---

## 3. Architecture

```
Phone / laptop browser
   │
Next.js 14 (App Router, TS, Tailwind) ── API routes (server)
   │              │                         │
   │        lib/agents/*              Bright Data
   │   Scout · Planner · Scribe ·     (Scraper Studio, Web Unlocker,
   │   Recapper  → OpenAI              SERP, Reddit scraper; via CLI/REST)
   │
FalkorDB (Docker)  ── one graph "conftellations": shared conference layer + personal layer
```

- **Web**: Next.js 14 + TypeScript + Tailwind, single repo, API routes as backend. Run on **port 3001** (FalkorDB Browser uses 3000).
- **Graph**: FalkorDB in Docker, Node client `falkordb`.
- **Constellation**: `react-force-graph-2d` (client-only, dynamic import `ssr: false`).
- **LLM**: OpenAI. Embeddings `text-embedding-3-small` (1536 dims). Small chat model via `OPENAI_MODEL` for extraction, steer ops, brief, crowd summary, trip report. Structured outputs everywhere.
- **Scraping**: Bright Data. Install the **Bright Data CLI** first (also sets up their MCP server and agent skills for your coding agents).
- **Media**: `public/uploads/` is fine for the demo.

### 3.1 Backend agents (invisible to the user, sharing one graph)
| Agent | Job | Reads | Writes |
|---|---|---|---|
| **Scout** | Ingest a conference via Bright Data → extract → normalize → MERGE | URL | Conference layer, source/collectedAt |
| **Planner** | Build the itinerary; apply steering ops and feedback; re-plan and diff | Goals, problems, Steer, SKIPPED/BOOSTED, conference layer | `PLANS` edges, Steer nodes |
| **Scribe** | On each capture: attach by time, tag topics, link people | Moment, plan, topics | `AT`, `MENTIONS`, `MET` |
| **Recapper** | GraphRAG writing: brief, trip report, crowd summaries | Path sets from queries | Brief/Summary nodes |

They never call each other; they coordinate only through the graph. Each is a function in `lib/agents/` that reads the graph, calls OpenAI with structured output, and writes Cypher.

### 3.2 Env
```
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini              # or whichever small model the credits allow
OPENAI_EMBED_MODEL=text-embedding-3-small
BRIGHTDATA_API_KEY=
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1
BRIGHTDATA_SERP_ZONE=
DEMO_MODE=true                        # serve precomputed brief/plan for Sam
```

### 3.3 Run
```bash
docker run -p 6379:6379 -p 3000:3000 --rm falkordb/falkordb:latest
npm run seed            # graph + indexes + demo conferences + users + Sam's day + precompute
npm run dev -- -p 3001
```

---

## 4. Sponsor tool map

| Tool | Where in Conftellations | Priority |
|---|---|---|
| **FalkorDB graph + Cypher** | The whole product: both layers, all queries (§6), agents' shared state | Core |
| **FalkorDB vector index** | Plain-English search; goal/problem → topic matching; resolving steer text ("less hiring") to node ids; topic dedupe | Core |
| **FalkorDB algorithms** (`CALL algo.<name>()`) | Shortest path for "how you're connected" in warm intros; PageRank as a tie-breaker so hundreds of booths rank sensibly; CDLP communities for constellation clusters | Should (start with shortest path) |
| **FalkorDB Browser** (port 3000) | 10 seconds in the demo: the raw graph and one live Cypher query | Must (demo) |
| **FalkorDB MCP server** | Build time: let your coding agents inspect the schema and test queries | Nice to have |
| **Bright Data CLI** | Build time and ingest scripts: SERP search, Web Unlocker reads to files; installs MCP + skills | Must (dev) |
| **Bright Data Scraper Studio** | JS-heavy session catalogs (e.g. GitHub Universe): describe fields in plain words → it writes, tests and runs the scraper; second scraper for session pages → speakers | Must |
| **Bright Data Web Unlocker** | Simple agenda / sponsor / expo pages → markdown → extraction | Must |
| **Bright Data SERP API** | Discovery (catalog and sponsor URLs) and enrichment (what a booth company does when only a name is listed) | Should |
| **Bright Data Web Scraper API** (ready-made) | Reddit "worth it?" threads → community signal (F14) | Should |
| **Bright Data LinkedIn/people scrapers** | Not used, for privacy | Skip |
| **OpenAI** | Backend agents: embeddings, extraction, steer ops, brief, crowd summary, trip report | Must |
| **TrueFoundry TrueForge** | Not used: it's a harness for user-facing chat agents, and we have none | Skip |
| **Qodo** | GitHub app on the repo reviews every small PR from your coding agents; show one catch + fix if entering its track | If multi-track |

**FalkorDB judge's three use cases, all covered:** agent memory (the graph persists goals, steering, feedback and people across conferences, read and written by every agent), GraphRAG (brief, trip report, crowd summary written only from retrieved paths, each cited), multi-agent shared context (Scout, Planner, Scribe, Recapper coordinate only through the graph; the team brain extends this to colleagues).

**Tool line for the pitch:** "FalkorDB is the memory, Bright Data is the eyes, OpenAI is the voice."

---

## 5. Graph model (FalkorDB)

One graph, two layers: a **shared conference layer** (scraped once, reused by everyone) and a **personal layer** (per user).

### 5.1 Nodes
| Label | Key | Properties |
|---|---|---|
| `Conference` | `id` (slug) | name, url, startDate, endDate, city, source, collectedAt |
| `Session` | `id` | title, abstract, kind (talk/workshop/keynote/panel), start, end, room, url, `embedding`, source, collectedAt |
| `Person` | `id` | name, title, bio, links, `embedding`, source, collectedAt |
| `Company` | `id` (domain or slug) | name, description, website, `embedding`, source, collectedAt |
| `Booth` | `id` | label ("Booth 14"), hall, order (for walking order), conferenceId |
| `Topic` | `id` (normalized) | name, `embedding` |
| `User` | `id` | name, availFrom, availTo (from steering) |
| `Goal` | `id` | text, kind (learn/meet/hire/job/buy), weight (0..1), `embedding` |
| `Problem` | `id` | text, `embedding` |
| `Moment` | `id` | kind (checkin/note/photo/met/voice), at, text, mediaUrl, shared (bool) |
| `Steer` | `id` | at, text, ops (JSON) |
| `Meet` | `id` | at, place, status |
| `Summary` | `id` | kind (brief/trip/crowd), text, citations, updatedAt |

### 5.2 Relationships
Shared layer:
- `(Conference)-[:HAS_SESSION]->(Session)`
- `(Person)-[:SPEAKS_AT]->(Session)`
- `(Session)-[:ABOUT]->(Topic)`
- `(Person)-[:WORKS_AT]->(Company)`
- `(Company)-[:SPONSORS]->(Conference)`
- `(Company)-[:HAS_BOOTH]->(Booth)<-[:HAS_BOOTH]-(Conference)`
- `(Company)-[:OFFERS]->(Topic)`
- `(Topic)-[:SENTIMENT {score, quote, source, collectedAt}]->(Conference)` (community signal, F14)

Personal layer:
- `(User)-[:IS]->(Person)`, `(User)-[:ATTENDS]->(Conference)`
- `(User)-[:HAS_GOAL]->(Goal)-[:ABOUT]->(Topic)`, `(User)-[:HAS_PROBLEM]->(Problem)-[:ABOUT]->(Topic)`
- `(User)-[:PLANS {goalId, score, status, slotStart, slotEnd}]->(Session|Person|Booth)`; status = planned | done | skipped
- `(User)-[:SKIPPED]->(...)`, `(User)-[:BOOSTED]->(...)`
- `(User)-[:STEERED]->(Steer)`
- `(User)-[:CAPTURED]->(Moment)`, `(Moment)-[:AT]->(Session|Booth)`, `(Moment)-[:MET]->(Person)`, `(Moment)-[:MENTIONS]->(Topic)`, `(Moment)-[:DURING]->(Conference)`
- `(User)-[:MET {at, conferenceId}]->(Person)` (shortcut)
- `(User)-[:REQUESTED_MEET {note, proposal, status}]->(User)`; accepted → `(Meet)` linked to both users and the session/slot
- `(Moment {shared:true})` or `(Moment)-[:SHARED_WITH]->(User)` (opt-in; Goal/Problem never shared)
- `(Session)-[:HAS_SUMMARY]->(Summary {kind:'crowd'})`, `(User)-[:HAS_SUMMARY]->(Summary {kind:'brief'|'trip'})`

### 5.3 Identity resolution (makes cross-conference memory work)
- `Person.id = slug(name) + "@" + companySlug` (fallback `slug(name)`).
- `Company.id = domain` when known, else `slug(name)`.
- `Topic.id` = lowercase, trimmed, singular; also merge new topics into an existing one when embedding cosine ≥ 0.9.
- Always `MERGE` on id, never `CREATE`. That's what makes "Jake spoke at 3 events this year" free.

### 5.4 Indexes
```cypher
CREATE INDEX FOR (n:Session) ON (n.id)
CREATE INDEX FOR (n:Person) ON (n.id)
CREATE INDEX FOR (n:Company) ON (n.id)
CREATE INDEX FOR (n:Topic) ON (n.id)
CREATE VECTOR INDEX FOR (s:Session) ON (s.embedding) OPTIONS {dimension:1536, similarityFunction:'cosine'}
CREATE VECTOR INDEX FOR (p:Person)  ON (p.embedding) OPTIONS {dimension:1536, similarityFunction:'cosine'}
CREATE VECTOR INDEX FOR (c:Company) ON (c.embedding) OPTIONS {dimension:1536, similarityFunction:'cosine'}
CREATE VECTOR INDEX FOR (t:Topic)   ON (t.embedding) OPTIONS {dimension:1536, similarityFunction:'cosine'}
```
Store vectors as `vecf32([...])`. Query with `CALL db.idx.vector.queryNodes('Session','embedding',10, vecf32([...])) YIELD node, score`. The docs only show the query vector as an inline literal, so build it in code unless a quick test shows parameters work. Vector search doesn't mix well with property filters: filter by conference in a following `MATCH`. Check whether `score` is a distance or a similarity before sorting.

---

## 6. Key queries (the graph doing real work)

Every "why" is returned as a path: `{ id, nodes: [{id,label,name}], edges: [{from,to,type}] }`, so the UI can render a sentence and highlight it in the constellation.

### Q1. Sessions for a goal
```cypher
MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal {id:$goalId})-[:ABOUT]->(t:Topic)
MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
OPTIONAL MATCH (sp:Person)-[:SPEAKS_AT]->(s)
RETURN s, collect(DISTINCT t.name) AS topics, collect(DISTINCT sp) AS speakers, count(DISTINCT t) AS overlap
ORDER BY overlap DESC, s.start ASC LIMIT 12
```
Union with vector matches on the goal embedding (filtered to the conference), dedupe.

### Q2. People to meet for a goal
```cypher
MATCH (u:User {id:$userId})-[:HAS_GOAL]->(:Goal {id:$goalId})-[:ABOUT]->(t:Topic)
MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
MATCH path = (t)<-[:ABOUT]-(s)<-[:SPEAKS_AT]-(p:Person)
OPTIONAL MATCH (p)-[:WORKS_AT]->(co:Company)
RETURN p, co, s, t, path
UNION
MATCH (u:User {id:$userId})-[:HAS_GOAL]->(:Goal {id:$goalId})-[:ABOUT]->(t:Topic)
MATCH (c:Conference {id:$confId})
MATCH path = (t)<-[:OFFERS]-(co:Company)-[:SPONSORS]->(c)
MATCH (p:Person)-[:WORKS_AT]->(co)
RETURN p, co, null AS s, t, path
```
App-code bonus: goal kind `hire` ↔ people open to a job; `job` ↔ companies hiring.

### Q3. Booths for a team problem
```cypher
MATCH (u:User {id:$userId})-[:HAS_PROBLEM]->(pr:Problem)-[:ABOUT]->(t:Topic)
MATCH (co:Company)-[:OFFERS]->(t)
MATCH (c:Conference {id:$confId})-[:HAS_BOOTH]->(b:Booth)<-[:HAS_BOOTH]-(co)
OPTIONAL MATCH (u)-[:MET]->(p:Person)-[:WORKS_AT]->(co)
RETURN pr, t, co, b, collect(p) AS peopleYouMet
ORDER BY size(peopleYouMet) DESC
```
→ "For your tracing problem: Booth 14 (Acme Trace). You met their engineer Mike at lunch." Union with vector matches of the problem embedding against Company embeddings for companies with thin topic data.

### Q4. Plan with steering applied
```cypher
MATCH (u:User {id:$userId})-[:HAS_GOAL]->(g:Goal)-[:ABOUT]->(t:Topic)
MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)-[:ABOUT]->(t)
WHERE NOT (u)-[:SKIPPED]->(s) AND NOT (u)-[:SKIPPED]->(t)
  AND (u.availFrom IS NULL OR s.start >= u.availFrom)
  AND (u.availTo IS NULL OR s.end <= u.availTo)
OPTIONAL MATCH (u)-[b:BOOSTED]->(s)
RETURN s, sum(g.weight) AS goalScore, count(b) AS boosted
```
Same pattern for people and booths. **Itinerary builder** (Planner, app code): `score = goalScore + 0.5·boosted + 0.3·vectorSim (+ small sentiment / PageRank bonus)`; place top sessions by time with greedy clash resolution; respect blocked times; fill free gaps with top booths in walking order (`Booth.hall`, `Booth.order`; default 10 min each, `booth_time` overrides); rewrite `PLANS` edges; return a diff vs. the previous plan.

### Q5. Warm intro
```cypher
MATCH (u:User {id:$userId})-[:MET]->(a:Person)<-[:IS]-(au:User)
MATCH (au)-[:CAPTURED]->(:Moment)-[:AT]->(s:Session)<-[:SPEAKS_AT]-(b:Person)
MATCH (b)-[:SPEAKS_AT]->(s2:Session)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(:Problem)<-[:HAS_PROBLEM]-(u)
WHERE NOT (u)-[:MET]->(b)
RETURN a, b, s, s2, t LIMIT 5
```
Optionally show the connection with `algo.SPpaths` / `shortestPath` from `u` to `b` for the highlight.

### Q6. Met before (across conferences)
```cypher
MATCH (c:Conference {id:$confId})-[:HAS_SESSION]->(s:Session)<-[:SPEAKS_AT]-(p:Person)
MATCH (u:User {id:$userId})-[m:MET]->(p)
WHERE m.conferenceId <> $confId
MATCH (prev:Conference {id:m.conferenceId})
RETURN p, prev, s
```
Same for other users at this conference: "3 people you've met before are here."

### Q7. Network overlap (other users)
```cypher
MATCH (u:User {id:$userId})-[:PLANS|CAPTURED*1..2]->(x)<-[:PLANS|CAPTURED*1..2]-(o:User)-[:ATTENDS]->(:Conference {id:$confId})
WHERE o <> u AND (x:Session OR x:Booth)
RETURN o, collect(DISTINCT x) AS shared, count(DISTINCT x) AS overlap
ORDER BY overlap DESC LIMIT 10
```
Plus goal-topic overlap via `(u)-[:HAS_GOAL]->()-[:ABOUT]->(t)<-[:ABOUT]-()<-[:HAS_GOAL]-(o)`. Free slots for meet proposals = gaps in both users' `PLANS` slots.

### Q8. Brief paths (Recapper input)
For the day: (a) moments grouped by topic, (b) Q3 per problem, (c) people met ranked by goal overlap, (d) Q5, (e) Q6, (f) accepted meets. Return paths only; the LLM cites a path id per sentence.

### Q9. Session community layer
```cypher
MATCH (s:Session {id:$sessionId})<-[:AT]-(m:Moment {shared:true})<-[:CAPTURED]-(u:User)
RETURN m, u.name AS author ORDER BY m.at
```
Hot moments: `MATCH (:Session {id:$sessionId})<-[:AT]-(m:Moment) RETURN m.at` → 2-minute bins in app code, counts only (no private content). Crowd summary = Recapper over the shared moments, each sentence cited to a moment.

### Q10. Personal record
```cypher
MATCH (u:User {id:$userId})-[:ATTENDS]->(c:Conference)
OPTIONAL MATCH (u)-[m:MET]->(p:Person) WHERE m.conferenceId = c.id
OPTIONAL MATCH (u)-[:CAPTURED]->(mo:Moment)-[:DURING]->(c)
RETURN c, count(DISTINCT p) AS people, count(DISTINCT mo) AS moments
ORDER BY c.startDate DESC
```

### Q11. Constellation subgraph
```cypher
MATCH (u:User {id:$userId})
OPTIONAL MATCH p1 = (u)-[:HAS_GOAL|HAS_PROBLEM]->()-[:ABOUT]->(:Topic)
OPTIONAL MATCH p2 = (u)-[:PLANS]->()
OPTIONAL MATCH p3 = (u)-[:CAPTURED]->(:Moment)-[:AT|MET|MENTIONS]->()
OPTIONAL MATCH p4 = (u)-[:MET]->(:Person)-[:SPEAKS_AT|WORKS_AT]->()
OPTIONAL MATCH p5 = (u)-[:ATTENDS]->(:Conference)
RETURN p1, p2, p3, p4, p5
```
Filter by `$confId` unless "all conferences". Flatten to `{nodes, links}`. Each node carries `type` (color), `state` (planned = dim outline, done = lit, unplanned = bright, skipped = hidden), `goalId` (cluster), `at` (replay order), `conferenceId`. Add Q7 users as small stars on shared nodes. Non-plan conference nodes render as faint background dust (no labels) so hundreds of sessions and booths still look clean.

---

## 7. Ingestion (Scout, F1)

**Data quality rule:** every scraped node stores `source` (URL), `collectedAt` (ISO) and `via` (studio | unlocker | serp | scraper-api | sessionize). Cards show "collected 2h ago".

**Demo conferences:** **GitHub Universe** (this week, ~157 sessions, JS-loaded catalog; the same example Bright Data used in their workshop) and **Patch the Conference**. Plus one small seeded past conference (AI Engineer Summit, June) for "met before".

Routing:
1. `POST /api/conferences {url}`. If `Conference {url}` already exists, return it (shared layer, scraped once).
2. Sessionize JSON URL → fetch directly.
3. JS-heavy session catalog → **Scraper Studio** scraper (fields: title, day, time, room, url), then a second Studio scraper over session pages → speakers. Run ahead of time; re-run once live on stage if stable.
4. Simple agenda / sponsor / expo pages → **Web Unlocker** markdown:
   ```bash
   curl -X POST https://api.brightdata.com/request \
     -H "Authorization: Bearer $BRIGHTDATA_API_KEY" -H "Content-Type: application/json" \
     -d '{"zone":"web_unlocker1","url":"<url>","format":"raw","data_format":"markdown"}'
   ```
   Follow up to 5 same-domain links that look like `/agenda`, `/schedule`, `/speakers`, `/sponsors`, `/expo`.
5. Gaps (company with only a name, missing catalog URL) → **SERP API**.
6. LLM extraction (structured output, schema below) → normalize ids (§5.3) → embed → `MERGE`.
7. Optional (F14): Reddit scraper on "is {conference} worth it" → SENTIMENT edges.

Extraction schema:
```json
{
  "conference": {"name": "", "startDate": "", "endDate": "", "city": ""},
  "sessions": [{"title": "", "abstract": "", "kind": "talk|workshop|keynote|panel", "start": "ISO", "end": "ISO", "room": "", "url": "", "speakers": [""], "topics": [""]}],
  "people": [{"name": "", "title": "", "company": "", "bio": "", "links": [""]}],
  "companies": [{"name": "", "website": "", "description": "", "sponsorTier": "", "booth": "", "hall": "", "topics": [""]}]
}
```
Rules: only facts on the page; empty string if unknown; topics are 1–3 word noun phrases; no marketing adjectives.

---

## 8. Capture (Scribe, F6)

- **Auto-attach by time:** a note/photo with no explicit target attaches to the most recent check-in, else to the planned session whose `[start,end]` contains now.
- **On save:** tag 1–3 topics (reuse existing Topic names; merge by embedding) → `MENTIONS`; set the matching `PLANS` edge to `done`; new targets become "unplanned" stars.
- **Met someone:** search Persons at this conference (speakers, sponsor staff, users) or add new (name, company) → `MET` edges.
- **Share:** toggle on a note/photo → `shared:true` (or share with specific people). Triggers a crowd-summary refresh for that session.

---

## 9. Steering (Planner, F4–F5)

`POST /api/users/:id/steer {confId, text}` → LLM structured output given current goals, conference topics and time now:
```json
{"ops": [
  {"op": "add_goal", "text": "", "kind": "learn|meet|hire|job|buy"},
  {"op": "remove_goal", "goalId": ""},
  {"op": "reweight_goal", "goalId": "", "weight": 0.0},
  {"op": "set_window", "from": "ISO|null", "to": "ISO|null"},
  {"op": "block_time", "from": "ISO", "to": "ISO", "label": "lunch|meeting|free"},
  {"op": "booth_time", "minutes": 0},
  {"op": "exclude", "kind": "session|person|booth|topic", "match": ""},
  {"op": "boost", "kind": "session|person|booth|topic", "match": ""},
  {"op": "pin", "targetId": ""}
]}
```
The LLM only emits ops. The server resolves `match` text to node ids via the vector index, applies ops as Cypher writes, stores a `Steer` node, re-runs the planner, and returns `{ops, diff:{added, removed, moved}, summary}`. No ops → "Didn't catch that. Try 'leaving at 3pm'." No conversation state.

Card feedback: `POST /api/users/:id/feedback {targetId, kind:"skip"|"boost"}` → edge → re-plan.

---

## 10. Writing (Recapper, F8, F11, F13)

**Brief prompt:**
> Write a short end-of-day conference brief for {user}. Use ONLY the facts in the paths below. End every sentence with the path id it came from, like [p3]. Sections: "What you learned" (max 3), "Follow up with" (max 3, each with why), "For your team's problem" (max 2), "Seen before" (max 2). No buzzwords, no adjectives like "exciting". Omit a section with no paths.

UI strips `[pN]` and makes each sentence tappable → highlights path pN in the constellation.

**Crowd summary:** same rules over a session's shared moments, citing moment ids; max 5 sentences.
**Trip report:** same paths, manager audience: "Top takeaways", "Relevant to our work", "Vendors worth a follow-up", "Contacts", "Recommended next steps". Markdown + copy button.
`DEMO_MODE=true` → precomputed brief, trip report and crowd summaries for the demo; a "regenerate" button proves it's live.

---

## 11. API routes

| Method | Route | Body / params | Returns |
|---|---|---|---|
| POST | `/api/conferences` | `{url}` | `{conference, counts}` |
| GET | `/api/conferences/:id` | | conference + sessions + booths |
| POST | `/api/users/:id/onboarding` | `{confId, goals[], problems[], openTo[]}` | goals/problems with matched topics |
| GET | `/api/users/:id/plan?confId=` | | `{itinerary:[{slot, item, why, path}], byGoal:[{goal, sessions[], people[], booths[]}]}` |
| POST | `/api/users/:id/steer` | `{confId, text}` | `{ops, diff, summary}` |
| POST | `/api/users/:id/feedback` | `{targetId, kind}` | updated plan |
| GET | `/api/search?confId=&q=` | | sessions/booths by vector match |
| POST | `/api/users/:id/moments` | multipart: kind, text?, file?, targetId?, personId? / newPerson? | moment |
| POST | `/api/moments/:id/share` | `{to: userIds[] \| "network"}` | moment |
| GET | `/api/users/:id/constellation?confId=` | | `{nodes, links}` (all conferences if omitted) |
| GET | `/api/users/:id/brief?confId=&date=` | | `{sections:[{title, lines:[{text, pathId}]}], paths}` |
| GET | `/api/users/:id/trip-report?confId=` | | `{markdown}` |
| GET | `/api/users/:id/intros?confId=` | | warm intros + met before, with paths |
| GET | `/api/users/:id/network?confId=` | | overlapping users with shared items + free slots |
| POST | `/api/users/:id/meet` | `{toUserId, note, proposal:{sessionId? \| slot? \| place?}}` | meet request |
| POST | `/api/meets/:id/respond` | `{action: accept \| decline \| counter, proposal?}` | meet |
| GET | `/api/sessions/:id/community` | | `{sharedNotes[], crowdSummary, hotMoments[]}` |
| GET | `/api/users/:id/record` | | every conference with counts, brief/trip links |

---

## 12. Screens

Mobile-first (390px). Bottom tabs: **Plan · Capture · Sky · Brief**. Avatar (top-right) → **My record**. Sky is the constellation.

1. **Add conference**: URL field → "Pull agenda"; fallbacks (Sessionize URL, upload .ics). Result card with counts and "collected just now".
2. **Onboarding**: up to 3 goals (free text + topic chips from this conference), "A problem your team has", "Open to" tags.
3. **Plan**: steer bar pinned on top ("Steer your day…") with a diff toast. Toggle **Day | By goal**. Day = time-blocked itinerary (sessions, booth runs in walking order, meets). By goal = three compact sections: Sessions (rows: time, title, room, why), People (cards, ~3 per screen: name, role @ company, why, "Request meet"), Booths (cards: company, 1–2 sentence description, why, booth number). Every card: "not for me" / "more like this", and "collected Xh ago" on scraped items.
4. **Capture**: big buttons: Check in · Note · Photo · Met someone. Shows "Now: {session}" so users see where captures attach. Share toggle on each note/photo.
5. **Sky (constellation)**: full screen, dark canvas. Modes Plan / Live / Remember (auto by time of day, switchable). Planned = dim outline; captured = lit with a short pulse; unplanned = bright; steering animates stars in and out. Colors: Goal/Problem gold, Session violet, Person orange, Company/Booth green, Moment small white, other users teal, Conference large ring. Controls: Replay day (reveal by `at` over ~8 s), Zoom out (all conferences), Today / All. Tapping a star opens its card; tapping a brief line highlights its path and dims everything else to 15%.
6. **Brief**: sections with tappable lines; buttons: Trip report, Open in Sky.
7. **Session page**: title, time, room, speakers, source + collectedAt; your notes; **Community** tab: crowd summary with tappable citations, hot-moment strip, others' shared notes and snaps.
8. **Person card / meet request**: profile summary, why, "Request meet" → note + proposal (shared session / free slot / place); incoming requests: Accept · Decline · Suggest another.
9. **My record**: one card per conference (dates, sessions, people, moments) → its brief, trip report or Sky; "All conferences" opens the full Sky.

Design: clean white UI, one accent (violet), system font, generous spacing, tap only (no swipes or long-press).

---

## 13. Seed data (`seed/`)

- `gh-universe.json`: GitHub Universe sessions + speakers via Scraper Studio (real, ~157 sessions), with source/collectedAt.
- `ptc.json`: Patch the Conference: schedule, sponsor workshops (FalkorDB, Bright Data, TrueFoundry, Qodo), sponsors as booths with descriptions and topics.
- `ai-eng-summit-june.json`: small past conference (6 sessions) where Sam met Jake, with 2 seeded moments.
- `users.json`: Sam, Emily (user, hiring, attended a Jake session), Mike (booth staff), 4–6 other users with plans and a few shared notes so the network and community tabs look alive.
- `sam-today.json`: Sam's day (check-ins, 3 notes, 2 slide photos, met Emily, met Mike, one accepted meet), so the brief and Sky are rich even if live capture on stage is short.
- Optional `big-expo.json`: a large public expo list (200–300 booths) to show the planner at scale.
- `npm run seed`: wipe graph → indexes → load all → embed → precompute Sam's brief, trip report and crowd summaries for `DEMO_MODE`.

---

## 14. Repo layout

```
conftellations/
  CLAUDE.md                 // §1.3 principles + run commands, for coding agents
  app/
    (tabs)/plan/page.tsx
    (tabs)/capture/page.tsx
    (tabs)/sky/page.tsx
    (tabs)/brief/page.tsx
    add/page.tsx
    onboarding/page.tsx
    sessions/[id]/page.tsx
    people/[id]/page.tsx
    me/page.tsx
    api/...                 // routes from §11
  lib/
    falkor.ts               // client singleton, query helper, vecf32 literal builder
    queries/*.ts            // Q1–Q11, each returns {rows, paths}
    agents/scout.ts         // Bright Data + Sessionize → extract → MERGE
    agents/planner.ts       // itinerary, steer ops, feedback, diff
    agents/scribe.ts        // capture attach, topic tags, MET
    agents/recapper.ts      // brief, crowd summary, trip report (GraphRAG)
    brightdata.ts           // Web Unlocker, SERP, scraper calls
    llm.ts                  // embeddings, structured chat
    types.ts                // shared API + graph types (the contract)
  components/
    SessionRow.tsx, PersonCard.tsx, BoothCard.tsx, WhyLine.tsx, SteerBar.tsx,
    FeedbackButtons.tsx, MeetSheet.tsx, CommunityTab.tsx, Sky.tsx (react-force-graph-2d, ssr:false)
  seed/*.json, seed/seed.ts
```

---

## 15. Build plan for 2 people

Each person drives their own coding agents. Lock the contract first, then build in parallel. Small PRs (Qodo-friendly).

**Person A: graph and backend** (FalkorDB, Bright Data, OpenAI, agents, API).
**Person B: product and UI** (screens, Sky, demo polish).

| Time (PT) | Person A | Person B |
|---|---|---|
| 11:00–11:30 | Together: agree on §5 schema and §11 API shapes; write `types.ts` and mock JSON for every route. Install Bright Data CLI; start FalkorDB. | ← same |
| 11:30–12:45 | `falkor.ts`, indexes, seed loaders. Scout: Scraper Studio run for GitHub Universe, Web Unlocker for PTC pages. `npm run seed` with embeddings. | App shell + tabs; Add, Onboarding, Plan (By goal) on mocks. Card components with why-line, feedback, collectedAt. |
| 12:45–14:00 | Q1–Q4 + Planner itinerary → `/plan`. Scribe + `/moments`. `/feedback`. | Capture wired to real API. Sky v1 on mocks: colors, states, goal clusters, tap → card. Plan Day view. |
| 14:00–15:15 | `/steer`. Q5–Q7 → `/intros`, `/network`, `/meet`, `/respond`. Q11 → `/constellation`. | Steer bar + diff toast. Sky on real data: plan/live states, pulse on capture, live re-plan, other users. Person card + meet sheet. |
| 15:15–16:15 | Recapper: brief (Q8), crowd summary (Q9), trip report. `/record` (Q10). DEMO_MODE precompute. | Brief screen + path highlight. Session page + Community tab. Replay + Zoom out. My record. |
| 16:15–16:45 | Bug bash together on the exact demo path. | ← same |
| 16:45–17:15 | Freeze. Record backup video. Rehearse twice. Submit. | ← same |

**Cut order if behind at 14:00:** Wrapped/voice/OCR (already stretch) → community signal (F14) → timeline (F15) → hot moments → trip report → live scrape on stage (show pre-ingested).
**Never cut:** Sky with why-paths, steering, capture lighting up stars, brief → path highlight, network + one meet request. That's the graph story.

---

## 16. Demo script (3 min)

1. **Pain (20 s):** "Raise your hand if you owe someone a trip report Monday. Every conference ends with a camera roll of slides and a pocket of badges. You never manage to plan talks, people and booths together, and every event's app forgets you when it's over."
2. **Add (20 s):** paste the GitHub Universe link → 157 sessions and speakers land in FalkorDB via Bright Data, each stamped "collected just now". Flash the FalkorDB Browser for 5 seconds.
3. **Plan in the Sky (25 s):** Sam's goals in the center, dim stars around them: sessions, Jake (speaking tomorrow), Booth 14. Tap Booth 14 → its why-path lights up.
4. **Steer (20 s):** "Leaving at 3pm, more tracing, less hiring." Stars fade and appear; toast: "−2 sessions, +Jake's workshop."
5. **Live + network (35 s):** check in, snap a slide, "met Emily" → stars light up, the tracing goal glows. Emily's overlapping stars appear; Sam requests a meet after Jake's talk; Emily accepts on a second phone; the meet becomes a star. Sam opens a session that clashed: the Community tab shows a crowd summary from 5 attendees.
6. **Remember (40 s):** tonight's brief. Tap "Booth 14: you met Mike at lunch" → path lights up. Replay the day. Zoom out → June's conference: "met Jake before". Warm intro: "Emily was at Jake's workshop."
7. **Close (20 s):** one-tap trip report. "Conftellations. Plan it, live it, remember it. Every conference you've been to, connected. Next: the team brain."

Backup: screen recording of the full flow, open in a tab.

---

## 17. Judging map

| Criterion (FalkorDB track) | How we hit it |
|---|---|
| Graph at the core | Plan, steering, booths, intros, met-before, network, community and brief are multi-hop Cypher (Q1–Q11) with vector search in the same DB; agents write back into the graph. Covers agent memory, GraphRAG and multi-agent shared context. |
| Explainable answers | Every suggestion and brief sentence carries its path; the Sky highlights it. |
| Real conference problem | Forgetting, trip reports, planning talks + people + booths together, and app lock-in across events. |
| Working live demo | Pre-ingested data, DEMO_MODE precompute, backup video. |

Bright Data track (if multi-track): live web data at the core (any conference via Scraper Studio / Web Unlocker / SERP), data quality (source + collectedAt on every row), usefulness (it's what makes the app work at any event).

## 18. Open questions for organizers
- Can one project be judged in more than one track (Bright Data, Qodo)?
- Submission format (repo link, form, video)? Demo slot length?

## Sources
- Hackathon page: https://www.wemakedevs.org/hackathons/ptc
- FalkorDB getting started: https://docs.falkordb.com/getting-started.md
- FalkorDB vector index: https://docs.falkordb.com/cypher/indexing/vector-index.md
- FalkorDB algorithms: https://docs.falkordb.com/algorithms.md
- FalkorDB Browser: https://docs.falkordb.com/browser/index.md
- FalkorDB MCP server: https://docs.falkordb.com/genai-tools/mcpserver/index.md
- Bright Data Web Unlocker REST: https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website.md
- Bright Data SERP API: https://docs.brightdata.com/products/serp-api/introduction.md
- Bright Data MCP FAQ: https://docs.brightdata.com/ai/mcp-server/faqs.md
- Sessionize API: https://sessionize.com/playbook/developers/api
- TrueForge: https://github.com/truefoundry/trueforge
- Qodo GitHub install: https://docs.qodo.ai/install-qodo/github/qodo-multi-tenant
- Bright Data workshop demo (GitHub Universe example): notes recorded at the event
