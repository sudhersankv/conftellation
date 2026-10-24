# Conftellations demo: flow + script

**The one idea to repeat:** every conference gets its own **conf brain** (a conftellation): what you planned, what you did, who you met, what you learned, all one graph. The app is a window onto it: the calendar is the brain as a plan, the Conftellation page is the brain as a trace, the brief is the brain written up, Ask is the brain answering, and your record is every brain you have ever built.

Two recordings: **PC (3:30)** for the full story, **Phone (1:00)** for capture + the two-phone meet. Live app: https://conftellations.fly.dev. Demo clock is pinned to 13:05 PT on Oct 24, so the plan, graph and captures agree no matter when you record.

## Before you hit record

1. PC browser, two tabs: `https://conftellations.fly.dev/?as=sam` and the FalkorDB Browser for the hosted instance (open it, paste the query below, run it once so it's warm).
2. Phone 1: `https://conftellations.fly.dev/plan?as=sam`. Phone 2: `https://conftellations.fly.dev/network?as=emily`.
3. Conference switcher (left sidebar) on **Patch the Conference**.
4. Don't steer or capture as Sam while rehearsing; the recording does one steer + Undo (restores) and 2–3 captures (fine to keep). If Sam's goals ever show duplicates: `npx tsx scripts/fix-sam-goals.ts --apply`.
5. FalkorDB Browser query (paste, don't type on camera):
   ```cypher
   MATCH p=(u:User {id:"sam"})-[:HAS_GOAL]->(g:Goal)-[:ABOUT]->(t:Topic)<-[:ABOUT]-(s:Session)<-[:HAS_SESSION]-(c:Conference {id:"ptc-2026"})
   RETURN p LIMIT 25
   ```

## Judging map (say these words at least once each)

| FalkorDB criterion | Where it's shown | The line |
|---|---|---|
| Graph at the core: **agent memory** | Conferences + Me + Network "People you've met" | "Four agents, one graph. Nothing is remembered in a prompt; it's remembered in FalkorDB, across conferences." |
| Graph at the core: **GraphRAG** | Brief, Ask, Community crowd summary | "The model never invents a relationship. It only writes from paths we hand it, and every sentence cites the path." |
| Graph at the core: **multi-agent shared context** | Scout → Planner → Scribe → Recapper | "Scout writes the conference, Planner writes the plan, Scribe writes what I did, Recapper reads all of it. They never call each other; they coordinate through the graph." |
| **Explainable answers** | Why lines, tap-to-highlight in the Conftellation | "Every suggestion has a why, and the why is a real path you can light up." |
| **Real conference problem** | Opening 20 s + trip report | "Talks, people and booths planned together; a trip report on Monday; it carries to the next conference." |
| **Working live demo** | Everything is the deployed app on real scraped data | counts on the cards, "Collected 3h ago" chips |
| Bright Data: live web data + quality | Conferences page, name import, provenance chips, photos | "Paste a link or just a name. Scout finds the schedule with Bright Data, reads it, and stamps every row with source and time." |

---

## PC recording (3:30)

**0:00 Pain (20 s)** — on the Conferences page, don't click yet.
> "Every conference ends the same way: a camera roll of slides, a pocket of badges, and a trip report due Monday. Every event's app is different, locked to that one event, and forgets you when it's over. Conftellations gives you a conf brain for each conference you attend: one graph of what you planned, what you did, who you met and what you learned. It's yours, and it carries to the next one."

**0:20 Scout: live web data (35 s)** — `Conferences` in the sidebar.
- Point at the cards: "Nine real conferences, scraped from their public schedule pages: KubeCon with 591 sessions and 985 speakers, PyTorch, AgntCon. Each card says when it was collected."
- Type **`PyTorch Conference 2026`** in the box (a name, not a link) → Pull agenda. (It matches the catalogue and returns in a second; to show a real Bright Data search on camera, type a conference that is NOT in the list, e.g. `All Things Open 2026`, and expect 20–60 s.)
> "You don't even need the URL. Scout searches with Bright Data, finds the schedule page, and reads it into sessions, speakers and sponsors. This one's already in the graph, so it comes back in a second; the first import of KubeCon took about a minute, zero credits, because Scout prefers the platforms' own feeds and only falls back to the Unlocker for plain websites."
- Click **Open plan** on Patch the Conference.

**0:55 Planner (40 s)** — `/plan`, Day view.
> "Sam told it three goals and one team problem: 'we can't see why our agents fail in production'. The Planner turned that into a day: sessions, a booth run in walking order, and a meet."
- Click the **Tracing multi-agent systems** block → drawer → read the why line: "Matches your goal 'fix agent tracing' via topic Agent tracing".
> "Every item has a why, and the why is a graph path, not a model's opinion."
- Click **By goal** → scroll to Booths: "Acme Trace, Booth 14, offers agent tracing: it matched the team problem, not the goal. Companies are first-class."
- Back to **Day**.

**1:35 Steer (25 s)** — steer bar.
- Type **`leaving at 3pm, more tracing, less hiring`** → Steer.
> "One line, no chat. The model only emits structured ops; the server applies them as graph writes and re-plans. There's the diff."
- Show the proposal panel (−1 session, moves…) → click **Undo** → "and it's reversible."

**2:00 The Conftellation (35 s)** — `Conftellation` in the sidebar (Trace mode).
> "This is Sam's conf brain for today, the conftellation: goals on top, time left to right, and the thick line is what he actually did. Planned things are outlined; done things are filled. Not a knowledge graph of everything, just his path."
- Click **Replay day** (let it run ~5 s while you talk).
- Click **Web** → "the same graph as a web: Sam, his goals, the sessions and people, and the companies that fit his problem. Everything else fades to background."
- Click the yellow **Fix agent tracing** goal node → drawer shows its neighbours → close.

**2:35 Ask + Brief: GraphRAG (35 s)** — `Brief`.
> "Tonight's brief. Four sections, every line written only from graph paths, every line cites one."
- Click the line **"Acme Trace (Booth 14) offers agent tracing…"** → lands on the graph with the path highlighted (everything else dimmed). Back.
- In **Ask your conference brain**, click the chip **"Who should I follow up with and why?"** → read one answer line, point at the `[p6]` citation.
> "Same mechanism as the brief: retrieve paths, write from them, cite them. If the graph has nothing, it says so."
- Click **Trip report** tab → **Copy markdown**. "Monday's write-up is done."

**3:10 Memory across conferences (15 s)** — `Network`, scroll to **People you've met**.
> "Jake, from AI Engineer Summit in June. Shenoy and Ryan, from AgntCon last week, with their public photos and LinkedIn. The graph remembers; the next conference starts with the people you already know."

**3:25 FalkorDB flash + close (10 s)** — switch to the FalkorDB Browser tab, hit Run on the prepared query, let the graph render.
> "FalkorDB is the memory, Bright Data is the eyes, OpenAI is the voice. Conftellations: plan it, live it, remember it."

---

## Phone recording (1:00) — screen-record Phone 1 (Sam), with Phone 2 (Emily) in frame for the accept

**0:00 Capture (25 s)** — Sam's phone, `/plan` → tap **Capture now** (opens the session page for the current session).
- Tap **Check in** → toast "Checked in · N stars lit".
- Tap **Note** → type **`Span per tool call; sample at the agent boundary.`** → Save.
> "Five seconds. The note attaches to the session I'm in, gets topics, and lights up the graph."
- Tap **Graph** in the bottom nav → the session is now filled on the trace.

**0:25 Two phones: a meet (25 s)** — Emily's phone: `/network?as=emily`, incoming request from Sam ("Catch up after Jake's talk?") → **Accept**.
- Sam's phone: back to **Plan** → within ~10 s the teal **Meet · Emily Chen** block appears at 3:00 PM.
> "Emily accepted on her phone; it's on both calendars. Meets are nodes in the same graph."

**0:50 Community (10 s)** — Sam's phone: **Sessions** tab → open **GraphRAG for agent memory** → **Community** tab.
> "The session I missed: five attendees' shared notes, a crowd summary that cites each note, and the hot moment at 11:52."

---

## If something goes wrong

- Page slow on first load: Fly machine warming; reload once.
- Steer returns "Didn't catch that": rephrase; or use the ops path by clicking Undo on the previous toast.
- Emily's accept says "slot is in the past": the demo clock isn't active in that tab. Open `https://conftellations.fly.dev/network?as=emily&now=2026-10-24T13:05:00-07:00`.
- Name import takes >20 s: it's doing a live Bright Data search + import; say so, or use a conference already in the catalogue.
- Backup: the recordings themselves.
