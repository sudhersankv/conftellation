# AGENTS.md

Project rules for any coding agent (Cursor, Codex, Claude Code…).

1. Read `HANDOFF.md` for current state and next steps, and keep it updated as you work (TL;DR, Next steps, Log); commit it with each change. Agents switch harnesses mid-day.
2. Follow `CLAUDE.md`: principles, ownership, run commands, verified FalkorDB facts. It is the source of truth.
3. `lib/types.ts` is the API contract; the UI calls the backend only via `lib/client.ts`; fixtures live in `mocks/index.ts`.
4. Leave notes for the other builder's agent in `COMMS.md` (append-only).
5. Work from GitHub issues (`gh issue list -R sudhersankv/conftellation`); parent spec is #21.
6. The repo is public: never commit `.env.local` or any key.
