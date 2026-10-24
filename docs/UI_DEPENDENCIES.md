# UI dependencies

Libraries that support `docs/DESIGN.md`. Versions and peer dependencies were checked with `npm view` on 2026-10-24 against this repo's stack: **Next 14.2, React 18, Tailwind 3.4**. Everything listed here supports React 18.

Already installed: `react-force-graph-2d@1.29.2` (the Sky), `next`, `tailwindcss@3`.

## Install now (core, used by several issues)

```bash
npm install motion vaul sonner lucide-react clsx tailwind-merge @radix-ui/react-toggle-group @radix-ui/react-tabs
```

| Package | Version | Peer deps | Used for | Issues |
|---|---|---|---|---|
| `motion` | 14.6.0 | react ^18 \|\| ^19 | Fly-in title hand-off (`layoutId`), sheet and toast motion, star flare on Capture tiles, `AnimatePresence` for rows leaving after "Not for me". Import from `motion/react` (the framer-motion successor, same API). Client components only. | #11 #12 #13 #14 #16 |
| `vaul` | 1.1.2 | react ^16.8–^19 | Bottom sheets with snap points: star card (0.4 → 0.9), note/photo/met drawers, MeetSheet, trip report. Built on Radix Dialog, so focus trapping and Escape work out of the box. | #12 #14 #15 #17 |
| `sonner` | 2.0.8 | react ^18 \|\| ^19 | Diff toast after steer (with Undo action), "Lit up in your sky", "Copied", "Request sent". | #11 #13 #14 #15 #17 |
| `lucide-react` | 1.61.0 | react ^16.5–^19 | Tab icons (`CalendarClock`, `CirclePlus`, `Sparkles`, `MoonStar`), capture tile icons, why-line `Sparkles`. Tree-shaken per icon. | all |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.7.0 | none | A `cn()` helper for conditional Tailwind classes (states like planned/done). Use **tailwind-merge 3.x**, which supports Tailwind v3 and v4 class names. | all |
| `@radix-ui/react-toggle-group` | 1.2.1 | react ^16.8–^19 | Accessible **Day \| By goal** segmented control and **Today \| All** in the Sky. | #12 #13 |
| `@radix-ui/react-tabs` | 1.2.1 | react ^16.8–^19 | **My notes \| Community** tabs on the session page. | #18 |

## Install when you reach the issue

| Package | Version | Install | Used for | Issue |
|---|---|---|---|---|
| `d3-force` + `@types/d3-force` | 3.0.0 | `npm i d3-force && npm i -D @types/d3-force` | `forceX` / `forceY` to pull stars toward their goal sun (and toward their conference in galaxy mode). Pass them in with `fgRef.current.d3Force("x", …)`. `react-force-graph-2d` already ships its own d3 engine, but doesn't export these helpers. | #12 |
| `cmdk` | 1.1.1 | `npm i cmdk` | Accessible type-ahead list for **Met someone** (search results plus an "Add as new person" row) and the "Change session" picker. | #14 |
| `react-markdown` + `remark-gfm` | 10.1.0 / 4.0.1 | `npm i react-markdown remark-gfm` | Rendering the trip report markdown (headings, lists, tables) inside the drawer. | #15 |
| `zustand` | 5.0.16 (react ≥18) | `npm i zustand` | Optional. The `skyStore` (highlight, pulses, mode, confId) shared by the persistent `SkyStage` and every screen. A plain React context works too; zustand avoids re-rendering every screen on each pulse. | #11 #12 |

## Fonts (no package needed)

Load these with `next/font/google` in `app/layout.tsx`:

```ts
import { Libre_Caslon_Display, Libre_Caslon_Text } from "next/font/google";
const caslonDisplay = Libre_Caslon_Display({ subsets: ["latin"], weight: "400", variable: "--font-caslon-display" });
const caslonText = Libre_Caslon_Text({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-caslon-text" });
```

Geist is already local (`app/fonts/GeistVF.woff`). Remove `GeistMonoVF`, since the design uses no monospace.

## Stretch only

| Package | Version | Used for |
|---|---|---|
| `html-to-image` | 1.11.13 | "Conference Wrapped" share card: render a hidden DOM node to PNG, then `navigator.share`. (Idea 9 in DESIGN.md §9.) |
| `date-fns` | 4.4.0 | Only if `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` become painful for slot times and "collected 2h ago". Prefer `Intl` first: it's zero kB. |

## Considered and rejected

| Package | Why not |
|---|---|
| `@tsparticles/react` + `@tsparticles/slim` (4.4.0) | A second animation loop and canvas next to the force graph. The starfield is cheaper to paint in the Sky's own `onRenderFramePre`, and `/add`'s small sky needs only a few dozen dots. |
| `three`, `@react-three/fiber`, `@react-three/drei`, `react-force-graph-3d` | We chose a 2D Sky. 3D adds a large bundle, is harder to tap on phones and makes labels harder to read. |
| `framer-motion` | Superseded by `motion` (same API, import from `motion/react`). Don't install both. |
| `canvas-confetti`, `use-sound` | Off-theme or unwelcome in quiet session rooms. |
| shadcn/ui CLI | Fine, but it generates a light, generic look we'd restyle anyway. We use its underlying primitives (Radix, vaul, sonner, cmdk) directly. Note: shadcn's newer Drawer moved off vaul to Base UI. Plain `vaul` is what we want here. |
| Tailwind v4 plugins | The repo is on Tailwind **3.4**. Don't install anything that requires v4 (for example `tw-animate-css`). |

## Reference links

- react-force-graph (props and methods: `zoom`, `centerAt`, `zoomToFit`, `nodeCanvasObject`, `nodePointerAreaPaint`, `onRenderFramePre`, `autoPauseRedraw`, `emitParticle`, `pauseAnimation`): https://github.com/vasturiano/react-force-graph and https://github.com/vasturiano/force-graph
- Motion for React (`motion/react`, `layoutId`, `AnimatePresence`): https://motion.dev/docs/react
- Vaul drawer and snap points: https://vaul.emilkowal.ski
- Sonner: https://sonner.emilkowal.ski
- Radix primitives: https://www.radix-ui.com/primitives
- cmdk: https://cmdk.paco.me
- Libre Caslon on Google Fonts: https://fonts.google.com/specimen/Libre+Caslon+Display
