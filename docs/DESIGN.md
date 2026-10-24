# Conftellations UI: design brief (v2, 2026-10-24 14:30 PT)

This replaces the earlier "galaxy" direction. **Every UI agent reads this before writing a component.** Product spec: `conftellations-spec.md` (§1 problem, §2 features, §12 screens). API contract: `lib/types.ts`; the UI calls the backend only through `api.*` in `lib/client.ts`.

## 1. What the app is, in one flow

1. **Add a conference**: paste a link → Scout reads it (progress steps) → counts + "collected just now".
2. **Set goals**: 1–3 goals + a team problem + what you're open to.
3. **Proposed plan as a calendar**: days as tabs, hours down the side, sessions/booths/meets as blocks. Summary line on top. Every block has a goal tag and a one-line **why** (a real graph path).
4. **Adjust**: steer bar ("leaving at 3pm, more tracing") → the agent **proposes** a diff → **Apply** or **Undo**. "Not for me" / "More like this" on any block. **Finalize** locks the plan.
5. **Graph (the constellation)**: your conference brain. Goals in the centre; sessions, people, booths, notes and other attendees connected to them. Click any node → its card. A **connected graph, not a starfield.**
6. **Session page**: time, room, speakers, your notes/photos, a **memo** (what you learned, follow-ups), Community tab (others' shared notes, crowd summary, hot moments).
7. **Network**: people whose plans overlap yours, meet requests, warm intros, "met before".
8. **Brief + trip report** at the end. Every line cites a path; tapping it highlights the path in the graph.

Primary view = **calendar**. Memory view = **graph**. "Constellation" is an analogy for *connected*, nothing in the UI should look like outer space.

## 2. Look & feel

**Reference feel: neo-brutalist, playful but tidy** (the owner's site, callmekv.netlify.app). Confident, not corporate.

- **Paper and ink.** Background cream `#FFF7E8`, cards white, `surface2` light cream `#FFF1D6`. Borders, text and shadows are ink `#111111`; muted `#5B5566`, faint `#9A93A6`. `color-scheme: light`.
- **Flat colour blocks.** Accent yellow `#FFD23F` (primary buttons: yellow fill, ink text, ink border), plus pink `#FF6FAE`, blue `#4DA3FF`, orange, purple, green as solid fills for bands, stat tiles and avatars. **No stars, galaxies, glows, gradients or blur.** Never put yellow/green text on cream; colour is a fill, text stays ink.
- **Type**: Space Grotesk 500/700 (`font-heading`) for headings, nav, buttons, chips; DM Sans 400/500 (`font-sans`) for body; Caveat 600 (`font-hand`) for exactly ONE handwritten annotation ("your conference brain" on Home). Page titles 28–36px bold, tight.
- **Shape**: 2px ink borders (`border-2 border-border`), cards `rounded-xl` (16px), chips and buttons full pills. **Hard shadows, no blur**: `shadow-hard` (4px 4px 0 #111) on cards and primary buttons, `shadow-hardSm` on small controls. `.press` / `.press-sm` lift on hover and push in on press.
- **Controls**: inputs white with ink border and a 3px yellow focus ring; Segmented and nav = ink fill with cream text when selected; phone bottom nav active = yellow pill. Card `accent` prop = 6px colour bar on the left.
- **Spacing**: 4px grid. Page padding `px-4 md:px-10`, max width `max-w-6xl`. Cards `p-4`. Motion 120–150ms; respect `prefers-reduced-motion`.
- **Node/type colours** (spec §12; dots ringed in ink, block bars, tiles):
  goal `#FFD23F` · session `#A78BFA` · person `#FF8C42` · company/booth `#3DDC97` · moment `#111111` · other user `#4DA3FF` · conference/topic `#B8B2C2` · meet `#FF6FAE`. Use `TYPE_COLOR` from `lib/ui/tokens.ts`, never hard-code.
- **Provenance everywhere scraped data appears**: `<CollectedAgo at={collectedAt} source={source} />`.
- **Conference cues**: time chips (`1:00–1:30 PM`), room/booth chips (`Stage B`, `Booth 14`), goal tags, track-coloured topic tags. These make it a *conference* app, not a generic dashboard.
- **Responsive**: works at **390px** (phone, bottom nav) and at **1280px+** (laptop/projector, left sidebar). The demo runs on both. Calendar: at phone width show one day, a vertical time list; at `md+` show the hour grid.
- **States**: every data view has loading (`<Skeleton/>`), empty (`<EmptyState/>` with a next action), and error (`<ErrorState onRetry/>`). Never show a blank area.
- **Copy**: short, specific, no exclamation marks, no "exciting". Backend agents may be named in status lines ("Scout found 574 sessions", "Planner re-routed: −1 session"), subtly.

## 3. Information architecture & routes

```
/                 Home: your conferences (RecordResponse) + "Add a conference". Empty state → /add.
/add              Paste URL → progress → result card → "Set goals".
/goals            Goals + team problem + open-to → "Build my plan" → /plan.
/plan             Calendar (days, hour grid), summary, steer bar, proposal diff, finalize. Block → session/booth/person sheet.
/graph            The constellation. ?hl=<id,id,...> highlights those nodes (used by WhyLine and Brief). Click node → card → links to its page.
/sessions/[id]    Session page: details, my notes/photos, memo, Community tab. Capture lives here (+ check-in).
/people/[id]      Person card: role, talks, why, met-before, Request meet.
/network          Overlapping attendees, incoming/outgoing meet requests, warm intros.
/brief            Nightly brief (tappable lines → /graph?hl=...), trip report (markdown + copy), Regenerate.
/me               Personal record: every conference with counts → brief / plan / graph.
```

Shell: `app/(app)/layout.tsx` renders the sidebar (md+) / bottom nav (phone) with: **Plan · Graph · Network · Brief**, plus **Add** and the user switcher (Sam / Emily) in the top bar. The home page `/` is inside the shell. `app/layout.tsx` is root only (fonts, providers, toaster).

## 4. Shared code every screen uses (do not re-implement)

- `useSession()` from `lib/ui/session-context.tsx`: `{ userId, confId, setUserId, setConfId, now(), nowIso(), otherUserId }`. `?as=emily` switches user (middleware), `?now=<ISO>` sets a demo clock.
- `useApi(key, fetcher, { pollMs? })` from `lib/ui/use-api.ts`: stale-while-revalidate; `{ data, error, loading, reload, mutate }`. Key convention `apiKey("plan", userId, confId)`.
- `api.*` from `lib/client.ts`; `momentForm()` for captures.
- `lib/ui/format.ts`: `fmtTime`, `fmtRange`, `fmtDay`, `ago`, `fmtIn`. Conference times are ISO with offsets; the venue zone for PTC is `America/Los_Angeles` (default), KubeCon is `America/Denver` (`conference.timezone`).
- `lib/ui/tokens.ts`: `TYPE_COLOR`, `typeOf(label)`.
- Primitives in `components/ui/`: `Button` (`primary | secondary | ghost | danger`, `sm | md | lg`), `Chip` (`time | room | booth | topic | goal | status`), `Card`, `Field` (`Input`, `Textarea`, `Label`), `Drawer` (bottom sheet on phone, right panel on md+), `Skeleton`, `EmptyState`, `ErrorState`, `WhyLine`, `CollectedAgo`, `TypeDot`, `PageHeader`, `Avatar`.
- Toasts: `toast()` from `sonner` (already mounted in root layout). Steer diffs show as a toast with **Undo**.

## 5. Per-screen notes

**/plan (the centrepiece)**
- Header: conference name, date range, summary line: `3 days · 11 sessions · 4 booths · 2 meets` and per-goal counts as goal chips.
- Day tabs from the conference's start→end dates. Default: today if inside the range, else first day.
- Hour grid 8:00–19:00 (clamp to the day's earliest/latest slot ± 1h). Blocks positioned by `from/to`. Overlaps render side by side. Block = title, time, room/booth chip, goal dot, `why[0].text` on hover/expand. `status: done` = filled, `planned` = outlined, meets = teal edge, blocks (`type: "block"`) = hatched grey.
- Steer bar pinned above the grid: input + "Steer". Response → **proposal panel**: the diff (`+ added / − removed / ↔ moved`) with **Apply** (already applied server-side; the panel just confirms) and **Undo** (`api.steer(userId, confId, "undo", undo)`). Keep it honest: the backend applies immediately and returns `undo`; show "Applied · Undo" rather than pretending it's pending.
- **Finalize** button: local state (localStorage `plan:final:<userId>:<confId>`) that hides the steer bar and shows a "Plan locked · Edit" pill. No backend change needed.
- "By goal" toggle: lists `byGoal[]` sections (Sessions / People / Booths) with `FeedbackButtons` (not for me / more like this → `api.feedback`).
- Click a block → Drawer with details + why paths (each a `WhyLine` → `/graph?hl=`), Open session / Open person.

**/graph**
- `react-force-graph-2d` via `dynamic(..., { ssr:false })`, neutral `#0B0B12` canvas, nodes as flat discs (radius by type: goals 9, sessions 6, people 6, booths 6, moments 3, dust 2), labels for non-dust nodes at zoom ≥ 1.2 (always for goals), links as 1px lines at 25% alpha. Colours by `TYPE_COLOR`. States: planned = outline ring, done = filled, unplanned = filled + brighter, dust = 20% alpha no label, other user = teal small disc. Highlight (`?hl=` or a tapped why/brief line): matching nodes + their links at 100%, everything else at 15%. Legend in a corner. Controls: Today / All conferences, "Replay day" (reveal by `at` over ~8 s), Reset view. Click node → Drawer card with links to its page.

**/sessions/[id]**
- Details, speakers (links to /people), `CollectedAgo`. Capture row: **Check in · Note · Photo · Met someone** (`api.createMoment`), shows "lit" nodes count as a subtle toast. My notes list. **Memo** card: a textarea saved as a note with `text` prefixed `memo:` (so no new backend), rendered as the memo; keep the latest `memo:` note. Community tab: `api.community(sessionId, userId)` → crowd summary (lines cite moment ids), hot-moments strip (2-min bins as bars), shared notes with author.

**/network, /people/[id]**
- Network list: avatar, name, overlap count, shared items, shared topics, free slots. "Request meet" → Drawer: note + proposal (shared session / free slot / place) → `api.requestMeet`. Incoming: Accept · Decline · Suggest another (`api.respondMeet`). Intros section from `api.intros`. Person page from `api.person(id, { confId, userId })` with `why` (WhyLines) and `metBefore`.

**/brief, /me, /, /add, /goals**: as in §1 and spec §12. Brief lines are buttons → `/graph?hl=<pathNodeIds>`. Trip report: `react-markdown` + Copy. "Regenerate" calls with `{ regenerate: true }` (live LLM, 3–6 s: show a progress state).

## 6. Demo path the UI must make effortless (spec §16)
Add link → counts → goals → calendar → steer "leaving at 3pm, more tracing" → diff toast → graph → check in + note on a session → graph lights up → Emily (second phone) accepts a meet → brief → tap a line → path highlights → trip report. Two users: `?as=sam`, `?as=emily`.
