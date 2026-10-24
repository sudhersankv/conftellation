# Conftellations

Attendee-owned conference brain. Hackathon build (Patch the Conference, Oct 24 2026; demo 17:30 PT).
Full spec: `conftellations-spec.md`. API/graph contract: `lib/types.ts`. Agent-to-agent notes: `COMMS.md`.
**Current state + next steps: `HANDOFF.md`. Keep it updated as you code (any harness); commit it with the work.**

## Principles (non-negotiable)
- **No chatbot.** LLMs run in the backend only. Steering is one command line → structured ops → visible diff.
- **Logic lives in Cypher.** Relationships, ranking inputs and "why" paths come from FalkorDB. The LLM extracts structure, turns steer text into ops, and writes sentences from paths it is given. It never invents relationships.
- **Every suggestion has a why**, and the why is a real graph path (`WhyPath`) that the Sky can highlight.
- **5-second capture** or it won't happen. **Mobile-first** (390px).
- **Public data only.** Every scraped node stores `source`, `collectedAt`, `via`.
- Always `MERGE` on id, never `CREATE` (identity rules: spec §5.3).

## Team & ownership
- **Sudhersan** (`sudhersankv`): graph + backend: `lib/falkor.ts`, `lib/queries/`, `lib/agents/`, `lib/brightdata.ts`, `lib/llm.ts`, `app/api/**`, `seed/`, `scripts/`.
- **Ryan** (`RyanV27`): product + UI: `app/(sky)/**` (galaxy, tabs, sessions, people, me), `app/add`, `app/onboarding`, `app/layout.tsx`, `app/globals.css`, `components/**`, `lib/ui/**`, `docs/DESIGN.md`, `docs/UI_DEPENDENCIES.md`. Route layout: `docs/DESIGN.md` §5. `app/api/**` stays outside `(sky)`.
- Shared, change only by PR + note in COMMS.md: `lib/types.ts`, `lib/client.ts`, `mocks/index.ts`.

## UI design docs (required for all frontend work)
For **any** frontend issue or implementation (pages, components, styling, copy, motion, Sky, tokens, `lib/ui/**`, UI GitHub issues #11–#18), read these first and follow them:
- `docs/DESIGN.md`: visual direction, routes (§5), components, interaction and copy rules. It overrides the spec's and older notes' visual guidance where they differ.
- `docs/UI_DEPENDENCIES.md`: the approved UI libraries and versions. Use these; don't add alternatives (for example `framer-motion`, `three`, Tailwind v4 plugins).
If a task needs something the docs don't cover or conflicts with them, don't improvise silently: update the doc (Ryan owns it) or flag it in `COMMS.md`. Backend-only agents need not read them except to follow the route and ownership notes.

## Git workflow (branch per issue, PRs)
- **Stay in sync with the remote while you work.** Run `git fetch origin` before starting and at natural checkpoints (before each commit, before opening a PR, and roughly every 20-30 minutes of work). If `origin/main` has moved, integrate it (`git rebase origin/main`, or merge if the rebase gets messy) and re-run `npm run typecheck`. Check `COMMS.md` on every sync.
- **One branch per issue, never commit to `main` directly.** Branch from an up-to-date `main`, named `<type>/<issue#>-<short-slug>` (for example `ui/12-sky-stage`, `fix/21-client-error-parsing`). One issue per branch; don't mix unrelated changes.
- **Deliver by pull request.** Push the branch; Ryan opens and merges the PR (`gh` isn't installed). Never merge into `main` yourself. In your final message give the branch name, the compare link (`https://github.com/sudhersankv/conftellation/pull/new/<branch>`), and a suggested PR title/body (what changed, `Closes #N`, how to verify). Append the `COMMS.md` entry on the same branch.
- Never force-push a shared branch or `main`. Never commit secrets (the repo is public).

## Working with the other agent (COMMS.md)
Two people, two coding agents (Sudhersan = backend, Ryan = UI). `COMMS.md` is how the agents hand work to each other. The other agent has none of your chat context, so anything it needs must be written there.

**Before you start:** `git pull`, then read the entries in `COMMS.md` newer than your last session. Act on anything addressed to you or `all`.

**After you implement a change, append an entry to `COMMS.md` in the same commit/PR** if it touches anything the other side relies on:
- `lib/types.ts`, `lib/client.ts`, `mocks/index.ts`, or an API route's request/response/params/errors
- a route going mock → real (`route X is live`) or real → mock
- an id, enum value, or data convention (node ids, edge types, timezone, demo user ids)
- a blocker, a deviation from the spec/contract, or something the other side must change

Write each entry so the other agent can act without asking:
1. **What changed**: files and the exact shape (type name, field, example value).
2. **What the other side must do or can now do**: concrete (`call api.x(...)`, "return field y", "no change needed").
3. **Assumptions** you made, and what breaks if they are wrong.
4. **Corrections** to existing code/mocks that will interfere with the other side's work, with file and reason.
5. **How to verify**: URL, `curl`, or test name.

Rules: append-only, newest at the bottom, never edit or delete the other side's entries (reply in a new one). Header format `### HH:MM PT · <from> → <to|all> · <topic>`. No secrets. Short entries by default; a big handoff may use several entries by topic. UI contract changes are additive (optional fields) plus a mock update, per the rule below. File is `COMMS.md` (not `COMM.md`).

## How UI and backend stay in sync
- UI calls **only** `api.*` from `lib/client.ts`. Never raw `fetch`.
- Every API route exists from day one and returns `mocks/` data. Backend replaces the stub body with the real handler keeping the same response type, so the UI never has to change.
- If you need a field that isn't in `lib/types.ts`, add it (optional) + to the mock in the same PR, and post in COMMS.md.

## Run
```bash
npm install
cp .env.example .env.local   # fill in values (repo is PUBLIC: never commit secrets)
npm run falkor:ping          # connectivity + vector index sanity check
npm run seed                 # wipe graph → indexes → demo data → embeddings → precompute
npm run dev                  # http://localhost:3001
npm test                     # vitest (queries against live FalkorDB use graph "<FALKORDB_GRAPH>_test")
npm run smoke                # hits every API route
```
Set `USE_MOCKS=true` in `.env.local` to force every route to serve fixtures.

## FalkorDB facts (verified against the hackathon instance)
- Hosted instance, TLS on. Configured via `FALKORDB_HOST/PORT/USERNAME/PASSWORD/TLS` in `.env.local`.
- Query parameters work, **including** `vecf32($v)` inside `db.idx.vector.queryNodes`.
- Vector `score` is a **cosine distance**: lower = closer. Sort ascending; similarity = `1 - score`.
- Vector search doesn't filter by property: filter by conference in a following `MATCH`.
- FalkorDB skills (Cypher reference): `skills/SKILL.md` if cloned (`git clone https://github.com/FalkorDB/skills skills`; gitignored).

## Conventions
- Next.js 14 App Router, TypeScript, Tailwind. Server code never imported from client components.
- `react-force-graph-2d` only via `dynamic(() => import(...), { ssr: false })`.
- Query modules in `lib/queries/*.ts` return `{ rows, paths }`.
- Small PRs, one issue each, `Closes #N` in the body. Qodo reviews PRs.
- Dates: ISO strings with offset; the conference runs in PT (`-07:00`).
