# Skills quick-install reference

Reference for Claude: how to get the Bright Data and FalkorDB skills available in this project. Run commands from the project root. Ask the user before running anything that installs, starts a container, or logs in.

Status legend: **[done]** already set up in this project, **[from skill]** taken from the Bright Data onboarding skill but not run here, **[unverified]** behavior not confirmed.

---

## FalkorDB

### Skills [done]
- Source: clone of https://github.com/FalkorDB/skills at `skills/` (own `.git`, MIT). Do not modify.
- Overview file: `skills/SKILL.md` (Cypher, UDF, Docker, ingestion). Loaded into context via the `@skills/SKILL.md` import in `CLAUDE.md`.
- Per-topic detail: `skills/<category>-skills/<name>/skill.md`
  - `cypher-skills/` (16), `udf-skills/` (5), `operations-skills/` (6, Docker), `ingestion-skills/` (4)

### Re-fetch or update the skills
```bash
git clone https://github.com/FalkorDB/skills skills      # if missing
git -C skills pull                                       # to update
```

### Database (Docker) — not started yet
Dev (data lost on stop because of `--rm`):
```bash
docker run -p 6379:6379 -p 3000:3000 -it --rm falkordb/falkordb:latest
```
- Browser UI: http://localhost:3000, DB: port 6379
- Password: `-e REDIS_ARGS="--requirepass <password>"`
- Tuning: `-e FALKORDB_ARGS="THREAD_COUNT 4 TIMEOUT 5000"`
- Persistence / repeatable stack: use a compose file (example in `skills/SKILL.md`, Operations 5). The user declined a `docker-compose.yml` earlier; ask first.

### Python client
```bash
pip install falkordb
```
```python
from falkordb import FalkorDB
g = FalkorDB(host="localhost", port=6379).select_graph("conference")
```

---

## Bright Data

### CLI [done]
Installed locally as a dev dependency (v0.4.0). Run via `npx bdata <command>` from the project root. Requires Node >= 20.

Reinstall:
```bash
npm install --save-dev @brightdata/cli
```
No-install alternative [from skill]:
```bash
npx --yes --package @brightdata/cli brightdata <command>
```

### Authentication — not done yet
Preferred, interactive [from skill]:
```bash
npx bdata login            # browser OAuth
npx bdata login --device   # headless / SSH
```
Project-local key instead of the CLI's saved config:
```dotenv
# .env  (keep out of version control)
BRIGHTDATA_API_KEY=...
BRIGHTDATA_UNLOCKER_ZONE=cli_unlocker
BRIGHTDATA_SERP_ZONE=cli_unlocker
```
`bdata login` saves the key to a config file whose location is [unverified]; it may be outside the project.

Verify [from skill]:
```bash
npx bdata version
npx bdata config
npx bdata zones      # expect cli_unlocker, cli_browser
npx bdata budget
```
Non-zero exit, or output containing `unauthorized`, `invalid api key`, `not logged in`, `zone not found`: treat as failure and fix auth before continuing.

Free tier: 5,000 credits/month shared across Unlocker, SERP, Web Scraper API and Scraper Studio; the Browser API and proxies are not covered.

### Skills

Entry-point skill [done]: `.claude/skills/brightdata-agent-onboarding/SKILL.md`. It routes to the narrower skills below.

Install the rest with the CLI [from skill; destination directory unverified, check where it writes before running]:
```bash
npx bdata skill list                 # see everything available
npx bdata skill add                  # interactive picker
npx bdata skill add scrape
npx bdata skill add search
npx bdata skill add data-feeds
npx bdata skill add discover-api
npx bdata skill add scraper-builder
npx bdata skill add scraper-studio
npx bdata skill add brightdata-cli
npx bdata skill add bright-data-mcp
```
Other skills named by the onboarding skill: `competitive-intel`, `price-comparison`, `brand-listening`, `live-research`, `rag-pipeline`, `seo-audit`, `design-mirror`, `python-sdk-best-practices`, `js-sdk-best-practices`, `proxy`, `bright-data-best-practices`, `brd-browser-debug`.

### Likely useful for this project
- `data-feeds`: structured LinkedIn / Crunchbase records (attendee and company profiles, booth matching).
- `scrape`, `search`: speaker bios, company pages, session info.
- `js-sdk-best-practices` or `python-sdk-best-practices`: once the app stack is chosen.

### MCP alternative [from skill]
```
https://mcp.brightdata.com/mcp?token=YOUR_BRIGHTDATA_API_TOKEN
```
Limit tools with `&groups=` (`scrapers`, `browser`, `advanced_scraping`, `geo`) or `&tools=`. MCP requests draw from the same free-credit pool. Do not commit a URL containing a real token.

---

## Suggested order
1. FalkorDB skills: already present, nothing to do.
2. Start the FalkorDB container (ask first).
3. Authenticate Bright Data and run the verify commands.
4. `npx bdata skill list`, then add only the skills needed.
