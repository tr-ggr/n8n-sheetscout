# Sprints

Three short sprints take the blueprint in `../architecture.md` from an empty repo to an
importable, tested n8n workflow. Work them in order; each one ends in a green
`pnpm typecheck && pnpm test` and a conventional commit.

| Sprint | File | Outcome |
|--------|------|---------|
| 01 | [sprint-01-foundation.md](sprint-01-foundation.md) | Tooling, parser function + tests, local n8n via docker, fixture PDF |
| 02 | [sprint-02-workflow.md](sprint-02-workflow.md) | `workflows/resume-summarizer.json` + structural validator |
| 03 | [sprint-03-hardening.md](sprint-03-hardening.md) | Failure handling, form completion message, docs polish |

## Definition of done (every sprint)

- Every task checkbox in the sprint file is ticked (edit the file in the same commit).
- `pnpm typecheck` and `pnpm test` exit 0. From sprint 02 on, `pnpm validate` too.
- No secrets, credential ids, or n8n instance ids in any committed file.
- Commit message uses a conventional prefix (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- `README.md` still describes how to run what exists.

## Conventions

- Package manager: `pnpm`. Node 20+.
- TypeScript strict, no `any`. Tests with `vitest`, scripts run with `tsx`.
- The Code node body inside the workflow JSON is **generated** from
  `src/parse-llm-response.ts` by `pnpm sync`; never hand-edit it in the JSON.
- The sheet header names are the single source of truth and live in
  `src/parse-llm-response.ts` as `SHEET_COLUMNS`.
