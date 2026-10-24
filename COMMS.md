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

### 12:11 PT � sudhersan ? ryan � contract additions (all additive, mocks updated)
Closes gaps found while checking issues #11�#18 against the contract:
- **#17 person card**: new `GET /api/people/:id?confId=&userId=` ? `PersonDetail { person, sessions, why, metBefore? }`. Client: `api.person(personId, { confId, userId })`. Mocks: `jake-morales@falkordb`, `emily-chen@tensorgrid`, `mike-okafor@acmetrace`; unknown id ? 404 `{error}`.
- **#14 "Now: {session}"**: `PlanResponse.now?: { targetId, title, type, from?, to? } | null` = where an untargeted capture attaches (same rule as the backend). Mock: `s-tracing`.
- **#14 capture form**: `CreateMomentFields` type + `momentForm(fields)` helper in `lib/client.ts`; pass its result to `api.createMoment`.
- **#18 my notes**: `api.community(sessionId, userId?)`; `myMoments` is empty without `userId`.
- **#13 steer**: `ops: []` = not understood ? show `summary` as a hint, plan unchanged.
- **#12 Sky**: highlight why-paths by `edges[].from/to`. Real paths use any `EdgeType` (mocks only use `ABOUT`).
