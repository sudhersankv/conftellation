# Conftellations: UI design reference

The source of truth for how every UI issue (#11–#18) should look, move and read. Pair it with `lib/types.ts` (data) and `conftellations-spec.md` §12 (screen inventory). Where this doc and the spec disagree on **visuals**, this doc wins. On **data and behaviour**, the spec and the contract win.

Libraries are listed in `docs/UI_DEPENDENCIES.md`.

---

## 0. Decisions (settled with Ryan, 2026-10-24)

| Question | Decision | Overrides |
|---|---|---|
| Theme scope | **Dark everywhere.** The whole app is the night sky. | Issue #11 and spec §12 say "white UI, one violet accent, system font". Violet stays as the accent; white and the system font go. Post this in `COMMS.md`. |
| Entry point | **Galaxy home → fly in.** `/` shows every conference as its own constellation. Tap one and the camera flies into it. | Issue #11's "redirect `/` to `/plan`". |
| Renderer | **2D, custom painted.** `react-force-graph-2d` with our own canvas painting (glow sprites, twinkle, pulses) and animated `zoom`/`centerAt` for the fly-in. No three.js. | Nothing. Matches the spec. |

---

## 1. The idea in one paragraph

Conftellations treats the user's conference life as a **star atlas**. Every conference is a constellation, and all of them together are your galaxy. Inside a constellation, every talk, booth, person and moment is a star. **Brightness means fit:** the better something matches your goals, the brighter it shines, the way astronomers rank stars by magnitude. Your goals are the suns at the centre. During the day, each check-in or note **lights its star**, and your day draws itself as a line across the sky. At night the brief reads like a sky chart: tap any sentence and the path behind it lights up. The metaphor lives in the **visuals and motion**. The **words stay plain**: buttons say "Check in", not "Ignite star".

### Design principles (use these to settle arguments)
1. **The sky is always there.** One persistent canvas sits behind every screen. Plan, Capture and Brief are glass sheets laid over it. Switching to Sky lifts the sheet away; it never loads a new page. (See §5.)
2. **Brightness is information.** Glow, size and opacity encode state and relevance (§6.2). Nothing glows for decoration.
3. **One cinematic moment per flow.** The fly-in, a star lighting on capture, a path tracing itself. Everything else is quiet and fast. No staggered fade-ins on lists.
4. **Thumb first, 5 seconds.** Primary actions sit in the bottom third. One tap to open, one tap to save. Targets are at least 48px.
5. **Built for a conference hall.** Bright expo floors, dark keynote rooms, bad Wi-Fi, one hand holding coffee. High contrast, a dark-hall mode (§9.1), optimistic saves.
6. **Every suggestion shows its why.** The `WhyLine` is a first-class component, not a footnote, and it always links to the Sky.
7. **Plain words.** Sentence case, active verbs, no puns in labels, no all-caps eyebrows.

---

## 2. Vocabulary

Use these words consistently in code names and (where marked) in UI copy.

| Concept | In the UI copy | In code / design talk |
|---|---|---|
| All your conferences | "Your conferences" | galaxy |
| One conference | its name, e.g. "Patch the Conference" | constellation |
| A session / person / booth / moment | "session", "person", "booth", "note" | star |
| How well it fits | (shown visually only) | magnitude |
| Your goal | "goal" | sun |
| The reason behind a suggestion | "Why: …" | WhyPath / path |
| Your day's itinerary drawn in the Sky | "Your day" | asterism |
| Steering | "Steer your day…" | steer |
| Accepted meet | "Meet" | binary star |
| Hot moments strip | "When people took notes" | light curve |

---

## 3. Design tokens

### 3.1 Colour

The sky isn't black. A dark-site night sky is a very deep blue, so the base is ink-blue rather than a neutral `#0B0B0B`. Star colours follow the spec's type mapping, tinted the way real starlight looks (warm gold, ember, cool teal) rather than flat UI swatches.

**Surfaces and text**

| Token | Hex | Use |
|---|---|---|
| `--sky-abyss` | `#05071A` | Page background, Sky canvas clear colour |
| `--sky-ink` | `#0E1433` | Sheets and cards (use at 72% opacity + blur over the canvas) |
| `--sky-nebula` | `#1C2452` | Raised elements: pressed states, inputs, the active tab pill |
| `--sky-hairline` | `#2A3366` | 1px borders and dividers, constellation lines at rest |
| `--text-star` | `#F2F0FF` | Primary text (cool white, 17:1 on abyss) |
| `--text-dust` | `#8C93B8` | Secondary text, timestamps, "collected 2h ago" (6.6:1 on abyss, AA) |

**Accent and star types** (fixed by issue #12; hues tuned for glow)

| Token | Hex | Star type | UI use |
|---|---|---|---|
| `--polaris` | `#A78BFA` | Session | **The only UI accent**: primary buttons, focus rings, active tab, links |
| `--sun` | `#FFC861` | Goal / Problem | Goal chips, coverage rings. Never used for buttons. |
| `--ember` | `#FF8A5B` | Person | Person card avatar ring |
| `--aurora` | `#5EEAA8` | Company / Booth | Booth number badge |
| `--comet` | `#5CE1E6` | Other users | Network list overlap badge |
| `--moment` | `#FFFFFF` | Moment | Lit pulse |
| `--flare` | `#FF6B8B` | (none) | Destructive or error only: "Decline", failed save |

Rules:
- Type colours mark **what something is**, and appear only as small marks (a dot, a ring, a badge), never as a card fill. A booth card is ink with an aurora "Booth 14" badge, not a green card.
- `--polaris` is the only colour that means "you can press this".
- Glow is `--color` at 0.35–0.6 alpha in a radial falloff. Never use a CSS `box-shadow` glow on cards; glow belongs to stars.

### 3.2 Type

Classic star atlases (Flamsteed's *Atlas Coelestis*, 1729) were engraved in Caslon-era type, with **constellation names set in italic**. We borrow that convention, and it is the one typographic flourish in the app.

| Role | Face | Where |
|---|---|---|
| Display | **Libre Caslon Display** (Google Fonts, 400) | Screen titles, the conference name on the galaxy, the brief's section titles. 28px and up only. |
| Names | **Libre Caslon Text Italic** (400) | Conference and constellation names wherever they appear inline, the italic star labels in the Sky. |
| Everything else | **Geist** (already in `app/fonts/GeistVF.woff`) | Body, buttons, cards, inputs, times. Use `font-variant-numeric: tabular-nums` for times and counts. |

No monospace anywhere in the UI. Load the Caslons with `next/font/google` (no package needed).

**Scale** (mobile; ×1.125 on ≥768px)

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display-xl` | 44 / 48 | Caslon Display 400 | Galaxy hero (conference name during fly-in) |
| `display` | 30 / 36 | Caslon Display 400 | Screen title ("Tonight's brief") |
| `title` | 20 / 26 | Geist 600 | Card titles, session titles |
| `body` | 16 / 24 | Geist 400 | Abstracts, notes, brief lines |
| `meta` | 14 / 20 | Geist 450 | Room, role @ company, why-line |
| `micro` | 12 / 16 | Geist 500 | Badges, "collected 2h ago", tab labels |

Keep line length at 65ch or less (the brief and abstracts), sentence case everywhere, and no letter-spaced caps.

### 3.3 Space, radius, depth

- Spacing: 4px base. Use `4 8 12 16 24 32 48`. Screen gutter is 16px; the gap between cards is 12px.
- Radius follows hierarchy rather than one value for everything: sheets 28px (top corners only), cards 18px, chips and buttons fully round, inputs 14px.
- Depth comes from **blur and opacity, not shadows**: sheets use `bg-[--sky-ink]/72 backdrop-blur-xl`, and cards inside them are `--sky-ink` solid with a 1px `--sky-hairline` border. No grey drop shadows.

### 3.4 Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Fly-in, sheets, star flares |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Path tracing, replay |
| `dur-tap` | 120ms | Press feedback |
| `dur-sheet` | 320ms | Sheets and toasts |
| `dur-fly` | 1100ms | Galaxy → constellation |
| `dur-light` | 900ms | Star lights on capture (pulse) |
| `dur-replay` | 8000ms | Replay day |

`prefers-reduced-motion: reduce` turns off the fly-in (cut instead), twinkle, pulses (show the final state) and replay (it becomes a slider you drag).

### 3.5 Tailwind and CSS starter

Replace the create-next-app defaults in `app/globals.css` and `tailwind.config.ts` (issue #11).

```css
/* app/globals.css */
:root {
  --sky-abyss: #05071a; --sky-ink: #0e1433; --sky-nebula: #1c2452; --sky-hairline: #2a3366;
  --text-star: #f2f0ff; --text-dust: #8c93b8;
  --polaris: #a78bfa; --sun: #ffc861; --ember: #ff8a5b; --aurora: #5eeaa8;
  --comet: #5ce1e6; --moment: #ffffff; --flare: #ff6b8b;
  color-scheme: dark;
}
html, body { background: var(--sky-abyss); color: var(--text-star); }
body { font-family: var(--font-geist-sans), system-ui, sans-serif; }
:focus-visible { outline: 2px solid var(--polaris); outline-offset: 2px; }
```

```ts
// tailwind.config.ts → theme.extend
colors: {
  abyss: "var(--sky-abyss)", ink: "var(--sky-ink)", nebula: "var(--sky-nebula)", hairline: "var(--sky-hairline)",
  star: "var(--text-star)", dust: "var(--text-dust)",
  polaris: "var(--polaris)", sun: "var(--sun)", ember: "var(--ember)", aurora: "var(--aurora)",
  comet: "var(--comet)", moment: "var(--moment)", flare: "var(--flare)",
},
fontFamily: {
  sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
  display: ["var(--font-caslon-display)", "serif"],
  name: ["var(--font-caslon-text)", "serif"], // use with `italic`
},
borderRadius: { card: "18px", sheet: "28px", input: "14px" },
transitionTimingFunction: { expo: "cubic-bezier(0.16, 1, 0.3, 1)" },
```

Also export the same hex values from `lib/ui/tokens.ts`, because the canvas can't read CSS variables cheaply on every frame:

```ts
export const STAR = { goal: "#FFC861", problem: "#FFC861", session: "#A78BFA", person: "#FF8A5B",
  company: "#5EEAA8", booth: "#5EEAA8", moment: "#FFFFFF", user: "#5CE1E6", meet: "#5CE1E6",
  conference: "#F2F0FF", topic: "#8C93B8" } as const satisfies Record<SkyNodeType, string>;
```

---

## 4. Information architecture

```
/                       Galaxy: all conferences as constellations (home)
  ↓ tap a constellation → fly-in → conference context set → /sky
/add                    Add a conference (also reachable from the galaxy's "+")
/onboarding             Goals, team problem, open-to tags (after /add, or first visit)
/plan    ┐
/capture │  tabs, inside a conference (bottom tab bar)
/sky     │
/brief   ┘
/sessions/[id]          Session page + Community tab   (sheet over the sky)
/people/[id]            Person card + meet sheet        (sheet over the sky)
/me                     My record (avatar, top right)
```

Global chrome inside a conference:

```
┌──────────────────────────────────────┐
│ ‹✦  Patch the Conference      (S)    │  ← tap the name/glyph: zoom back out to the galaxy
│                                      │    (S) avatar → /me; long names truncate
│                                      │
│          screen content              │
│                                      │
│                                      │
├──────────────────────────────────────┤
│  Plan    Capture    Sky    Brief     │  ← 64px plus safe-area; the active tab is a nebula pill
└──────────────────────────────────────┘
```

- The conference name is set in **Caslon italic** next to a tiny glyph of that conference's constellation shape (the same seeded shape as on the galaxy, §7.1). It's the "you are here" marker and the way back out.
- The tab bar uses lucide icons (`CalendarClock`, `CirclePlus`, `Sparkles`, `MoonStar`), each with a label. Icons alone are not enough.
- **Demo user switcher** (#11): in `/me` and as a small hidden control (tap the avatar 3 times, or `?as=emily`), never in the main chrome, because the demo uses two real phones. Store `userId` and `confId` in a cookie plus a React context (`lib/ui/session-context.tsx`).

---

## 5. Architecture of the look: the persistent sky

This is the most important structural decision, and it's what makes "every screen is a shortcut into the constellation" (spec §1.2) literal.

```
app/
  layout.tsx            fonts, <SessionProvider>, <Toaster>
  (sky)/
    layout.tsx          <SkyStage> (fixed, full-screen canvas, z-0)  +  {children} (z-10)
    page.tsx            galaxy mode   → <SkyStage mode="galaxy">, no sheet
    (tabs)/
      layout.tsx        top bar + bottom tab bar
      plan/page.tsx     <Sheet> over the sky
      capture/page.tsx  <Sheet>
      sky/page.tsx      no sheet; Sky controls float over the canvas
      brief/page.tsx    <Sheet>
    sessions/[id]/page.tsx, people/[id]/page.tsx, me/page.tsx
  add/, onboarding/     outside (sky): they have their own small starfield
```

- `<SkyStage>` mounts **once** and keeps the force graph alive across route changes, so the galaxy-to-conference zoom and the tab-to-Sky reveal are camera moves, not page loads.
- A small zustand store (or React context) called `skyStore` holds `{ mode: "galaxy" | "conference", confId, highlight: pathIds | null, pulses: string[], dim: boolean }`. Screens talk to the sky only through it: `highlight(path)`, `pulse(ids)`, `flyTo(confId)`.
- When a sheet covers the screen, call `fg.pauseAnimation()`. Resume on `/sky`. This keeps the CPU cool and the backdrop blur cheap.
- **Fallback:** if the frame rate drops below ~40fps on a phone (measure it in `onRenderFramePost`), replace the live canvas behind sheets with a static blurred PNG (`canvas.toDataURL()`) of the last frame.

### Sheet behaviour
- Sheets rise from the bottom and stop 56px below the top bar, so a strip of live sky always shows. That strip is the cue that the sky is underneath.
- Tapping a `WhyLine` anywhere: the sheet slides down (`dur-sheet`), the sky highlights the path, and a "Back to plan" pill appears at the bottom. This replaces "navigate to /sky" in #13 and #15.

---

## 6. The Sky (issue #12): rendering spec

### 6.1 Canvas setup (react-force-graph-2d)

```tsx
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

<ForceGraph2D
  ref={fgRef}
  graphData={data}                 // nodes: SkyNode[], links: SkyLink[]
  backgroundColor="rgba(0,0,0,0)"  // the starfield is painted in onRenderFramePre
  autoPauseRedraw={false}          // REQUIRED: twinkle and pulses animate after the layout settles
  nodeCanvasObject={paintStar}     // §6.3
  nodeCanvasObjectMode={() => "replace"}
  nodePointerAreaPaint={paintHitArea} // hit radius ≥ 22 screen px however small the star looks
  linkCanvasObject={paintLink}
  nodeVisibility={(n) => n.state !== "skipped"}
  onRenderFramePre={paintBackdrop} // starfield, nebula wash, goal coverage halos
  onNodeClick={openStarCard}
  onBackgroundClick={clearHighlight}
  enableNodeDrag={false}           // tap-only UI; avoids accidental drags on phones
  cooldownTicks={120}
  minZoom={0.3} maxZoom={8}
/>
```

Forces:
- `d3Force("charge").strength(-60)`.
- Goal clustering: an extra `forceX`/`forceY` pulls each node towards its `goalId` sun's position. Suns get fixed positions (`fx`, `fy`) on a circle of radius 120 around the origin, so the layout is stable between steers.
- Galaxy mode: the same forces keyed by `conferenceId` instead of `goalId` (§7.1).

### 6.2 Visual encoding

**Size and brightness** (magnitude): `r = base[type] × (0.7 + 0.6 × fit)`, where `fit` is the plan item's `score` normalised to 0–1. If no score is available, `fit = 0.5`.

| Type | Base radius (graph px) | Label |
|---|---|---|
| goal / problem | 9 (a sun) | always, Caslon italic |
| conference | 14 ring | galaxy mode only |
| session, person, booth, company | 4.5 | at zoom ≥ 1.6, or when highlighted or tapped |
| user (other attendee) | 3 | no |
| moment | 2 | no |
| meet | 4 (binary pair) | at zoom ≥ 1.6 |
| topic | 2.5, dust colour | at zoom ≥ 3 |

**State** (from `SkyNodeState`)

| State | Look | Why |
|---|---|---|
| `planned` | 1.25px outline ring in the type colour at 60% alpha, hollow centre, no glow | A star you're heading to but haven't reached |
| `done` | Solid core + glow sprite at 100%, gentle twinkle (±8% alpha, 3–6s period, random phase) | You were there |
| `unplanned` | Solid core + glow at 100% plus 4 tiny diffraction spikes | Something you did that wasn't in the plan stands out |
| `skipped` | Hidden (`nodeVisibility`). On steer it shrinks to 0 and fades over 400ms before hiding. | |
| `dust` | 1px dot, `--text-dust` at 25%, no label, no hit area | The hundreds of sessions you won't attend, as background sky |
| `anchor` | The user's own position at the centre: a 2px white dot with a slow 12s rotating halo | "You are here" |

**Goal coverage glow** (from `coverage[]`): each sun gets a halo with `radius = 18 + 30 × (covered / planned)` and `alpha = 0.15 + 0.45 × (covered / planned)`. A goal with nothing covered draws only a thin gold ring, which the spec calls "still dark". This should be the first thing your eye goes to: which suns are bright and which are dark.

**Links**
- At rest: `--sky-hairline` at 50% alpha, 0.6px, straight lines.
- **Your day (asterism):** connect `PLANS` targets in `slotStart` order with a 1.2px `--polaris` line. Done segments are solid; future segments are dashed `[3,4]`. This is the itinerary from Plan, drawn as a constellation shape.
- `MET`: `--ember` at 70%. `REQUESTED_MEET` and accepted meets: `--comet`, with one `emitParticle` travelling along the link when a meet is accepted.
- Highlighted path: 2px in the source node's type colour, every other node and link at **15% alpha** (spec). The path draws itself segment by segment over 600ms (`--ease-in-out`).

### 6.3 Painting stars cheaply

Canvas `shadowBlur` is slow on phones. Instead, **pre-render one glow sprite per colour** into an offscreen canvas once, then `drawImage` it scaled for each star.

```ts
const sprites = new Map<string, HTMLCanvasElement>();
function glowSprite(hex: string) {
  if (sprites.has(hex)) return sprites.get(hex)!;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(0.25, hex + "99"); grd.addColorStop(1, hex + "00");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); sprites.set(hex, c); return c;
}
function paintStar(node, ctx, scale) {
  const t = performance.now(), color = STAR[node.type], r = radius(node);
  const a = alphaFor(node, t);              // state × highlight dimming × twinkle
  ctx.globalAlpha = a;
  if (node.state !== "planned") ctx.drawImage(glowSprite(color), node.x - r * 3, node.y - r * 3, r * 6, r * 6);
  ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
  if (node.state === "planned") { ctx.strokeStyle = color; ctx.lineWidth = 1.25 / scale; ctx.stroke(); }
  else { ctx.fillStyle = "#fff"; ctx.fill(); }  // hot white core, colour comes from the glow
  paintPulse(node, ctx, t);                 // §6.4
  if (showLabel(node, scale)) paintLabel(node, ctx, scale);
  ctx.globalAlpha = 1;
}
```

- Labels: Geist 500, `12 / scale` px, `--text-star` at 85%, offset below the star. Goal labels are Caslon italic at `13 / scale`. Measure each label once and cache it.
- Backdrop (`onRenderFramePre`): about 220 static background stars generated from a seeded RNG (positions stored in graph space, so they parallax slightly with pan), plus 1–2 very faint nebula washes (`--polaris` and `--comet` radial gradients at 4–6% alpha) behind the goal clusters. Nothing else.

### 6.4 Live behaviour

| Trigger | What the sky does |
|---|---|
| `CreateMomentResponse.lit` | Each id: an expanding ring from r to r×4, alpha 0.8→0, over `dur-light`, then the star switches to `done` with a short flare (scale 1→1.4→1). Moment dots fade in on a link to their target. If `navigator.vibrate` exists, `vibrate(12)`. |
| Steer diff `removed` | Shrink and fade out (400ms), then hide |
| Steer diff `added` | Fade in from 0 with a 1.6× flare, then settle |
| Steer diff `moved` | Their asterism segments re-draw |
| Meet accepted | The two stars form a binary pair (two 2.5px dots orbiting a shared centre, 6s period) and one comet particle travels the link |
| `highlight(pathIds)` | Dim the rest to 15%, trace the path, and `zoomToFit(700, 80, n => pathIds.has(n.id))` |

### 6.5 Controls (floating over the canvas)

```
┌──────────────────────────────────────┐
│ ‹✦  Patch the Conference      (S)    │
│ ┌──────────────┐                     │
│ │Today │  All  │       (legend ⓘ)    │ ← segmented control, top left
│ └──────────────┘                     │
│            ·   ✦ fix agent           │
│        ○      tracing   ●            │
│     ·     ○       ●   ·      ·       │
│            ✦ meet AI infra           │
│    ·    ○      ○          ·          │
│                                      │
│   ┌───────────────┐  ┌───────────┐   │
│   │ ▶ Replay day  │  │ Zoom out  │   │ ← glass pills above the tab bar
│   └───────────────┘  └───────────┘   │
├──────────────────────────────────────┤
│  Plan    Capture    Sky    Brief     │
└──────────────────────────────────────┘
```

- **Star card (tap a star):** a bottom sheet at about 40% height (vaul snap point `0.4`, swipe up to 0.9). It shows the same card component as Plan (`SessionRow` / `PersonCard` / `BoothCard`) with its `WhyLine`s, plus "Open session" or "Open profile". The tapped star stays centred above the sheet: `centerAt(node.x, node.y + offset, 500)`.
- **Replay day:** a planetarium time-lapse. Reset every star with an `at` to hidden, then reveal them in `at` order over `dur-replay`. A thin time scrubber shows the clock ("10:40") under the controls, and the asterism line draws along with it. Tap anywhere to stop.
- **Zoom out:** runs the fly-in in reverse (§7.2) back to the galaxy.
- **Legend:** an ⓘ popover with 6 rows (type colours) and 3 rows (hollow = planned, solid = done, spiked = unplanned). Show it automatically once, on the first visit.
- **Mode (Plan / Live / Remember):** chosen automatically by time of day, so there's no toggle. It changes the default framing: Plan is centred on the suns, Live is centred on the "now" region of the asterism, Remember shows everything with the replay pill pulsing once.

---

## 7. Galaxy home and the fly-in (`/`)

### 7.1 The galaxy

```
┌──────────────────────────────────────┐
│                                (S)   │
│  Your conferences                    │ ← Caslon display 30
│                                      │
│        ✦                             │
│     ✦  ·  ✦      AI Engineer Summit  │ ← past: smaller, dimmer, further out
│      ✦         June 2026             │
│                                      │
│              ✦───✦                   │
│             /  ★  \    Patch the     │ ← today: brightest, centre, slow twinkle
│            ✦───✦──✦    Conference    │   name in Caslon italic
│                        Today         │
│                                      │
│    ✦ ✦      GitHub Universe          │
│     ✦✦      Oct 28–29                │ ← upcoming: rising from the bottom edge
│                                      │
│                 ( + Add conference ) │ ← polaris pill
└──────────────────────────────────────┘
```

- Data: `api.record(userId)` for the list, plus `api.constellation(userId)` (no `confId`) for the stars.
- **Position means time.** Today's conference sits at the centre. Past conferences drift outward and get dimmer the older they are (light from the past). Upcoming ones sit low, "rising". Placement uses a fixed slot per conference, ordered by `startDate`.
- **Shape:** each constellation's outline is its 5–8 highest-fit stars, connected in a minimum-spanning-tree order (cheap to compute, and it always looks like a real constellation). Seed by conference id so it never changes between visits. Reuse the same shape as the tiny glyph in the top bar.
- Under each name show a single dust-coloured line of counts from `RecordConference` ("14 sessions, 6 people"), not a stat block.
- **Empty state** (new user): a sky with no constellations, a few dust stars, the line "Add a conference to start your sky" and the + pill. No illustration.

### 7.2 The fly-in (the signature moment)

On tap, 1100ms, `--ease-out-expo`:
1. 0–150ms: the tapped constellation's lines brighten to 100%. Other constellations start fading to 0 and blur (CSS `filter: blur()` on an overlay snapshot, or just fade them).
2. 150–1100ms: `fg.zoomToFit(950, 60, n => n.conferenceId === id)`. As zoom passes 1.6, the dust stars fade in and labels appear, so the constellation's anchor stars "resolve" into its sessions, people and booths.
3. 700–1100ms: the conference name moves from its galaxy label to the top bar (a shared `layoutId` in motion), and the tab bar slides up.
4. `router.replace("/sky")`. The canvas never unmounts, so nothing flashes.

Reverse it for "Zoom out" and for tapping the top-bar name. With reduced motion, cross-fade for 200ms.

---

## 8. Screen specs by issue

Each spec gives the layout, the data mapping and states. Every list needs a loading state (skeleton rows in nebula at 60%, no shimmer), an empty state (one plain sentence plus an action) and an error state (what failed and what to do, plus a "Try again" button).

### #11 App shell, tabs, user switcher, tokens
- Apply §3.5 tokens, load the fonts with `next/font`, and set up the §5 route structure.
- `SessionProvider`: `{ userId: "sam" | "emily", confId: "ptc-2026" }` in a cookie. The switcher lives in `/me` ("Viewing as Sam · Switch to Emily").
- Install the `<Toaster />` (sonner) in the root layout, positioned `top-center` with `offset` below the top bar, and theme it with the ink/hairline tokens.
- Add the `<SkyStage>` shell now, even before #12, rendering just the backdrop starfield.
- Tab bar: `nav` with `aria-current="page"`, a 48px minimum target per tab, and `env(safe-area-inset-bottom)` padding.

### #12 Sky
Everything in §6 and §7. Build in this order: v1 is colours, states, clusters and tap → card on mocks. Then highlight, then lit pulses and the steer animation, then replay and zoom-out.

### #13 Plan

```
┌──────────────────────────────────────┐
│ ‹✦  Patch the Conference      (S)    │
│ ░░░░░░░░ live sky strip ░░░░░░░░░░░░ │
│╭────────────────────────────────────╮│
││ ⟡ Steer your day…                  ││ ← pinned SteerBar, nebula input
││ ┌────────────┐                     ││
││ │ Day │By goal│                    ││ ← Radix ToggleGroup
││ └────────────┘                     ││
││ Next · in 12 min                   ││ ← "Next up" card: the most useful thing
││ ┌────────────────────────────────┐ ││   on the screen at a conference
││ │ Tracing LLM agents in prod     │ ││
││ │ 2:00–2:40 · Room B · Jake Lee  │ ││
││ │ ✦ Why: matches your goal "fix  │ ││ ← WhyLine (tap → Sky)
││ │   agent tracing" via Tracing   │ ││
││ └────────────────────────────────┘ ││
││ 2:40 ─ Booth run (3 booths) ─────  ││ ← itinerary slots on a time rail
││ 3:15 ─ Meet Emily · Expo Hall ───  ││
│╰────────────────────────────────────╯│
├──────────────────────────────────────┤
│  Plan    Capture    Sky    Brief     │
└──────────────────────────────────────┘
```

- **SteerBar.** Placeholder "Steer your day… e.g. leaving at 3pm". Rotate between 3 example placeholders every 4s while empty (not animated, just swap the text). Submit → `api.steer`. While it's pending, a thin polaris progress line runs along the bar's bottom edge. On the response, show a **diff toast** with `summary` as the title, and the added items (aurora "+") and removed items (dust "−", struck through) as one compact line each, with an "Undo" action (send the inverse steer text, or re-fetch the plan). On an empty `ops` result, show the spec's message: "Didn't catch that. Try 'leaving at 3pm'."
- **Day view.** A vertical time rail on the left (a 1px hairline) with times in tabular Geist. The "now" marker is a polaris dot plus a horizontal line across the rail, and the list auto-scrolls to it on open. Slot types:
  - session → `SessionRow`
  - booth run → a compact grouped card: "Booth run · 3 booths · 30 min", which expands to the booths in walking order, numbered 1-2-3 (a real sequence, so numbering is justified)
  - meet → a comet-dot row
  - block → a plain dust row ("Lunch")
- **By goal view.** One section per goal, headed by a goal chip (a gold dot plus the goal text in Geist 600) and a coverage meter: a row of 5 small stars, filled = covered/planned. Then Sessions (rows), People (horizontal snap carousel, cards at 85% width so about 1.2 show, plus a "See all" link) and Booths (stacked cards, about 3 per screen, per the meeting decision).
- **`SessionRow`.** Time (tabular), title (`title`), room and speakers (`meta`), one `WhyLine`, and `FeedbackButtons` behind a `⋯` to keep the row calm. Status: planned = hollow polaris ring at the left, done = a solid lit dot.
- **`PersonCard`.** An avatar circle with initials on nebula and an ember ring, name, "role @ company", `WhyLine`, a "Request meet" button (secondary, polaris outline), and an `openTo` badge if relevant ("Hiring").
- **`BoothCard`.** Company name, an aurora badge with "Booth 14 · Hall A", a 1–2 sentence `description` (clamped to 2 lines), a `WhyLine`, and `collectedAt`.
- **`WhyLine`.** A small star glyph in the colour of the path's first node, then the `text` in `meta` size, with a trailing "Show in sky" affordance (a lucide `Sparkles` icon, 16px, with an accessible label). If an item has more than one why, show the first and "+1 more reason".
- **`FeedbackButtons`.** "Not for me" and "More like this", as text buttons in the overflow menu. The row responds instantly: skip collapses it with a 200ms height animation, boost brightens the left dot. Then call `api.feedback` and reconcile.
- **Provenance.** "Collected 2h ago" in `micro` dust, linking to `source`. Use `Intl.RelativeTimeFormat`.

### #14 Capture

```
┌──────────────────────────────────────┐
│ ‹✦  Patch the Conference      (S)    │
│╭────────────────────────────────────╮│
││ Now                                ││
││ Tracing LLM agents in prod         ││ ← Geist 600 20px (not Caslon: this is a tool)
││ Room B · until 2:40 · Change       ││ ← "Change" opens a session picker
││                                    ││
││ ┌──────────────┐ ┌──────────────┐  ││
││ │      ✓       │ │      ✎       │  ││
││ │   Check in   │ │     Note     │  ││ ← 2×2 grid of large tiles,
││ └──────────────┘ └──────────────┘  ││   each ≥ 140px tall, in the thumb zone
││ ┌──────────────┐ ┌──────────────┐  ││
││ │      ◉       │ │      ✦       │  ││
││ │    Photo     │ │ Met someone  │  ││
││ └──────────────┘ └──────────────┘  ││
││                                    ││
││ Today: 4 check-ins, 3 notes, 2 ppl ││ ← dust; tap → Sky (Live)
│╰────────────────────────────────────╯│
├──────────────────────────────────────┤
```

- The "Now" header comes from the current itinerary slot (`api.plan`), else the latest check-in. If nothing is on, show "Nothing scheduled now" and make Check in open search.
- **Check in:** one tap saves immediately (optimistic). The tile flips to a "Checked in ✓" state with a small star flare drawn inline on the tile (the same pulse as the sky, a 600ms CSS ring).
- **Note:** a vaul drawer at 0.6 height with the textarea already focused (keyboard up), a **Share** switch (off by default, with the label "Share with attendees of this session"), and Save. Two taps total.
- **Photo:** `<input type="file" accept="image/*" capture="environment">` opens the camera directly. On return, show the thumbnail and the share switch, plus Save. It attaches to "Now" automatically.
- **Met someone:** a drawer with a search field (cmdk list, 250ms debounce, `api.search`) showing people results first. The last row is always "Add "{query}" as new person", which expands to name + company. One tap on a result saves.
- After any save, a toast with "Lit up in your sky" and a "View" action. The moment's `lit` ids are pushed to `skyStore.pulses` so the pulse plays when the user next opens Sky (queue it if Sky is paused).
- **Offline:** if `fetch` fails, keep the moment in a local queue (an IndexedDB array, or localStorage), show "Saved on this phone, will sync" and retry on `online`. Conference Wi-Fi is the norm, not the edge case.

### #15 Brief + trip report

```
┌──────────────────────────────────────┐
│╭────────────────────────────────────╮│
││ Tonight's brief                    ││ ← Caslon display 30
││ Saturday, Oct 24 · generated 9:02pm││
││                                    ││
││ What you learned                   ││ ← Caslon display 22
││ ✦ OpenTelemetry spans can carry    ││ ← each line is a button; the star glyph
││   LLM token counts.                ││   is the colour of the path's first node
││ ✦ ...                              ││
││                                    ││
││ Follow up with                     ││
││ ✦ Emily Chen: hiring for AI infra; ││
││   you both attended Jake's talk.   ││
││                                    ││
││ Seen before / warm intros          ││ ← IntroCard (comet edge)
││ ┌────────────────────────────────┐ ││
││ │ You met Jake at AI Engineer    │ ││
││ │ Summit in June. He speaks      │ ││
││ │ tomorrow on your problem.      │ ││
││ └────────────────────────────────┘ ││
││                                    ││
││ [Trip report] [Open in sky] [↻]    ││ ← sticky footer actions
│╰────────────────────────────────────╯│
```

- Lines: tap → the sheet lowers, the sky highlights `paths[pathId]`, and the line's text shows in a floating caption at the bottom of the sky ("Back to brief" to return). This is the demo's key moment, so make the trace slow enough to watch (900ms).
- Intros: `api.intros`. `met_before` uses the heading "Seen before"; `warm_intro` uses "Warm intro". Each card's tap highlights `path` the same way.
- **Trip report:** a full-height drawer that renders the markdown (react-markdown + remark-gfm) on an ink background with comfortable reading measure, plus a "Copy" button (polaris, full width at the bottom) → `navigator.clipboard.writeText(markdown)` → toast "Copied".
- **Regenerate** (`↻`, with "Regenerate" as its accessible name): while pending, the lines dim to 40% and the sky behind the sheet is unchanged. Afterwards, update `generatedAt`.
- If `precomputed` is true, show nothing. The regenerate button is how the demo proves it's live.

### #16 Add conference + onboarding

**`/add`.** Full-screen sky (small local starfield, not the stage).

```
┌──────────────────────────────────────┐
│  Add a conference                    │ ← Caslon display
│  Paste the agenda or website link.   │
│ ┌──────────────────────────────────┐ │
│ │ https://                         │ │
│ └──────────────────────────────────┘ │
│        ( Pull agenda )               │
│                                      │
│  Sessionize link or .ics also work.  │
└──────────────────────────────────────┘
```

- **Loading (30–60s): "Charting the sky."** The real scrape is a black box, so make the wait look alive without faking progress. Stars appear one by one at random positions every ~400ms and slowly join into a growing constellation, with a single dust line underneath that cycles through honest steps ("Reading the agenda page…", "Finding speakers…", "Matching sponsors…"). When the response lands, the stars snap into the real counts, which count up over 600ms (`157 sessions · 212 people · 34 booths`), followed by "Collected just now". If `cached` is true, say "Already in Conftellations, collected 3h ago" and skip the animation.
- Result card actions: "Set my goals" (primary) → `/onboarding`.
- Error: "Couldn't read that page. Try the Sessionize or agenda link instead." with the field kept filled.

**`/onboarding`.** One scrollable page with three sections and a mini sky at the top.

- **Your goals (up to 3):** a text field, plus topic chips from `api.conference(id).topics` (tap a chip to add it to the goal being typed). Kind picker as small chips: Learn / Meet / Hire / Find a job / Buy. **Each confirmed goal adds a gold sun to the mini sky above**, so by the end the user has drawn the centre of their constellation. That's the onboarding's single moment.
- **A problem your team has:** a textarea ("e.g. our agent traces are unreadable"). Hint: "Used to pick booths. Never shared."
- **Open to:** toggle chips: Hiring, Job hunting, Buying, Learning.
- Footer: "Build my plan" → `api.onboarding` → fly into the conference (`/` galaxy with an auto fly-in, or straight to `/plan`).

### #17 Person card, meet sheet, network list

**`/people/[id]`** (sheet over the sky; the sky behind centres on this person's star)
- Header: avatar (initials, ember ring), name in Geist 600 22, "role @ company", links as icon buttons.
- "Why you should meet": every `WhyLine`.
- "Seen before" badge if the intros contain this person.
- Primary action: **Request meet** → `MeetSheet`.

**`MeetSheet`** (vaul, snap at 0.75)
```
  Meet Emily Chen
  ┌──────────────────────────────────┐
  │ Add a note (optional)            │ ← 140-char limit, counter in dust
  └──────────────────────────────────┘
  When and where
  ( After "Tracing LLM agents" · 2:40 )  ← shared session from network.shared
  ( Free: 3:15–3:45 )                    ← from freeSlots (both plans)
  ( Expo Hall )                          ← place
  [ Send request ]
```
- Proposals are radio chips; the first one is preselected. Keep the note optional (low-friction networking gets used, long forms don't).
- After sending: toast "Request sent to Emily", and the star gets a pending comet link in the sky.

**Network list** (a section in `/me`, and also "People here" under By goal):
- Rows: avatar, name, a comet badge with the overlap count ("4 in common"), and shared items as one dust line ("Jake's workshop, Booth 14").
- **Incoming requests** pinned at the top as cards: the note in quotes, the proposal, and three buttons: **Accept** (polaris), **Suggest another** (outline; opens `MeetSheet` in counter mode) and **Decline** (text, flare colour). Accept → both phones show the binary-star animation in the sky.

### #18 Session page + Community tab, My record

**`/sessions/[id]`**
```
  Tracing LLM agents in prod           ← title 22
  Sat 2:00–2:40 · Room B               ← tabular
  Jake Lee · Acme Trace                ← tappable → /people/[id]
  Collected 2h ago · agenda page       ← provenance
  ┌───────────────────────────┐
  │  My notes  │  Community   │       ← Radix Tabs
  └───────────────────────────┘
```
- **My notes:** your moments as a vertical list (time, text, photo thumbnail), with the share state as a small icon. Empty: "No notes yet" plus a "Take a note" button that opens Capture → Note pre-targeted at this session.
- **Community:**
  - **Light curve** (hot moments): a slim 48px-tall chart across the session's duration. Each 2-minute bin is a vertical bar whose height and brightness scale with `count`, with a polaris glow on the peak. The x-axis has just the start and end times. A label under the peak reads "Most notes at 2:14". This is an astronomer's light curve, and it's honest (counts only).
  - **Crowd summary:** lines with superscript citation stars. Tapping a line scrolls to and briefly highlights the cited shared note below. Header: "From 5 attendees' shared notes · updated 4 min ago".
  - **Shared notes and snaps:** a masonry-ish 2-column grid of photos (tap → fullscreen) and note cards with author first names.

**`/me`: My record**
- Header: name, "Viewing as Sam · Switch", and a mini galaxy (a static render of the user's galaxy, tap → `/`).
- One card per conference (`RecordConference`): the name in Caslon italic, dates, one dust line of counts, and actions: **Brief**, **Trip report** (disabled with "Not yet" if `!hasTrip`), **Sky**.
- "All conferences" → `/` (the galaxy, zoomed out).
- The network list (#17) sits below.

---

## 9. Ideas that make a conference day smoother

Ranked by value for effort. ★ = do it if there's time on the day; ☆ = pitch or stretch.

1. ★ **"Next up" card at the top of Plan.** At a conference, the question is almost always "where do I go next?". Answer it before anything else: title, room, "starts in 12 min".
2. ★ **Dark-hall mode.** Astronomers use red light to keep their night vision. In a dark keynote room, a bright phone annoys everyone. A moon toggle on Capture drops the UI to 40% brightness with a warm red tint (`filter: sepia(1) hue-rotate(-50deg) saturate(3) brightness(.45)` on the app root), so you can take notes without lighting up your row. It's a real, specific pain, and it fits the theme.
3. ★ **Optimistic capture with an offline queue** (§8 #14). Conference Wi-Fi fails exactly when the talk is good.
4. ★ **Booth runs as numbered walks.** Group booth slots into one "Booth run" card with the walking order. Ends the "I skipped talks because I couldn't plan the expo" problem the spec opens with.
5. ★ **Path tracing on WhyLines.** Watching the reason draw itself in the sky is the product's explainability, made visible.
6. ★ **Undo on steer toasts.** Steering is low-risk only if it's reversible.
7. ☆ **Light curve on every session** (#18), including ones you missed, to see when the room reacted.
8. ☆ **Clash rescue.** When two planned sessions overlap, the second appears as a *ghost* row ("Also at 2:00: …, community notes available after") linking to its Community tab, so the clash doesn't feel like a loss.
9. ☆ **Conference Wrapped share card** (spec F16): a 1080×1350 PNG of the night's constellation with 3 numbers, rendered with `html-to-image` from a hidden DOM node, shared via `navigator.share`.
10. ☆ **Add to calendar** for the itinerary as an `.ics` download (meeting-notes feature; no library needed).
11. ☆ **Shooting star on accepted meets.** A single streak across the top of both phones when a meet is accepted. It reads well on stage with two phones.

Rejected (don't build): sound effects (conferences are quiet rooms), swipe gestures on cards (spec: tap only), confetti (off-theme), a 3D galaxy (decided 2D), hold-to-expand cards (rejected in the meeting).

---

## 10. Copy guide

| Context | Write | Not |
|---|---|---|
| Steer placeholder | "Steer your day… e.g. leaving at 3pm" | "Ask the AI anything" |
| Steer no-op | "Didn't catch that. Try 'leaving at 3pm'." | "Sorry, I couldn't understand" |
| Diff toast | "−2 sessions, +Jake's workshop" (from `summary`) | "Your plan has been updated successfully!" |
| Capture toast | "Lit up in your sky" | "Moment created" |
| Empty brief | "Your brief appears after your first check-in." | "Nothing here yet 🌌" |
| Scrape error | "Couldn't read that page. Try the Sessionize or agenda link instead." | "Something went wrong" |
| Feedback | "Not for me" / "More like this" | thumbs icons alone |
| Meet | "Request meet" → toast "Request sent to Emily" | "Ping" (internal word) |

No emoji in UI copy. "Why:" always begins a why-line. Name buttons by their result ("Build my plan", "Copy report"), never "Submit" or "OK".

---

## 11. Accessibility and quality floor

- Contrast: body text is `--text-star` on ink or abyss (≥15:1), secondary is `--text-dust` (≥6:1). Never put dust text on nebula at less than 14px.
- The Sky is a canvas, so it needs a parallel accessible view. Give the stage `role="img"` with an `aria-label` summary ("3 goals, 9 planned, 4 done"), plus a visually hidden list of the stars as buttons for screen readers and keyboard users. Each button calls the same `openStarCard`.
- Every icon-only button has an `aria-label`. Focus rings use polaris at 2px.
- Respect `prefers-reduced-motion` (§3.4).
- Test widths: 360, 390 and 430px phones, and 1280px (the projector demo, where the Sky goes full width with sheets as a 420px right-side panel instead of bottom sheets).
- Before each PR, take a screenshot at 390px and look at it next to this doc.

---

## 12. Per-issue checklist

- [ ] #11 Tokens and fonts in, white theme removed, `(sky)` route group, `SkyStage` with backdrop only, tab bar, session context, user switcher, toaster.
- [ ] #12 Star painting (sprites), states, goal clusters and coverage halos, tap → star card, highlight + trace, lit pulse, steer in/out, replay, galaxy + fly-in + zoom out, accessible star list.
- [ ] #13 SteerBar + diff toast + undo, Day/By goal toggle, Next up, time rail, SessionRow / PersonCard / BoothCard / WhyLine / FeedbackButtons, provenance.
- [ ] #14 Now header, 2×2 capture tiles, note/photo/met drawers, share switch, optimistic save + queue, pulses queued to the sky, dark-hall mode.
- [ ] #15 Brief lines → trace, intro cards, trip report drawer + copy, regenerate.
- [ ] #16 /add with "charting the sky" loading, cached path, errors; /onboarding with suns appearing in the mini sky.
- [ ] #17 Person page, MeetSheet with proposal chips, network list, incoming request actions, binary star on accept.
- [ ] #18 Session page, My notes / Community tabs, light curve, cited crowd summary, shared grid, /me record cards.
