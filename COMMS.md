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
