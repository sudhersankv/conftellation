# Conftellations

Attendee-owned conference brain. Hackathon build (Patch the Conference, Oct 24 2026; demo 17:30 PT).
Full spec: `conftellations-spec.md`. API/graph contract: `lib/types.ts`. Agent-to-agent notes: `COMMS.md`.

## Principles (non-negotiable)
- **No chatbot.** LLMs run in the backend only. Steering is one command line → structured ops → visible diff.
- **Logic lives in Cypher.** Relationships, ranking inputs and "why" paths come from FalkorDB. The LLM extracts structure, turns steer text into ops, and writes sentences from paths it is given. It never invents relationships.
- **Every suggestion has a why**, and the why is a real graph path (`WhyPath`) that the Sky can highlight.
- **5-second capture** or it won't happen. **Mobile-first** (390px).
- **Public data only.** Every scraped node stores `source`, `collectedAt`, `via`.
- Always `MERGE` on id, never `CREATE` (identity rules: spec §5.3).

## Team & ownership
- **Sudhersan** (`sudhersankv`): graph + backend: `lib/falkor.ts`, `lib/queries/`, `lib/agents/`, `lib/brightdata.ts`, `lib/llm.ts`, `app/api/**`, `seed/`, `scripts/`.
- **Ryan** (`RyanV27`): product + UI: `app/(tabs)/**`, `app/add`, `app/onboarding`, `app/sessions`, `app/people`, `app/me`, `components/**`.
- Shared, change only by PR + note in COMMS.md: `lib/types.ts`, `lib/client.ts`, `mocks/index.ts`.

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
