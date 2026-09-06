# Sprint 01 — Foundation

## Goal

A runnable repo: TypeScript tooling, the pure parsing function the workflow's Code node will
use (fully tested), a local n8n via Docker, and a sample resume PDF to test with.

## Tasks

- [ ] `package.json` (name `n8n-sheetscout`, `"private": true`, `"type": "module"`, `packageManager` pinned to pnpm) with scripts:
  - `typecheck` → `tsc --noEmit`
  - `test` → `vitest run`
  - `validate` → `tsx src/validate-workflow.ts` (placeholder that exits 0 with a "no workflows yet" message until sprint 02)
  - `fixture` → `tsx scripts/make-fixture.ts`
  - `sync` → `tsx scripts/sync-code-node.ts` (placeholder until sprint 02)
- [ ] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `module`/`moduleResolution` `NodeNext`, `target` `ES2022`, includes `src`, `scripts`.
- [ ] Dev deps: `typescript`, `vitest`, `tsx`, `@types/node`, `pdf-lib`. Commit `pnpm-lock.yaml`.
- [ ] `src/parse-llm-response.ts` exporting:
  - `SHEET_COLUMNS` — readonly tuple of the 7 header names in `docs/architecture.md`.
  - `type CandidateRow` — object keyed by those names, all `string | number`.
  - `parseLlmResponse(response: unknown): CandidateRow` — reads `choices[0].message.content`; strips a ```json / ``` fence if present; `JSON.parse`; maps to sheet columns with `N/A` fallbacks; coerces `years_of_experience` to a number when it is numeric (string or number), else `N/A`; joins `top_skills` arrays with `, `; never throws — on any failure returns all `N/A` with `Executive Summary` = `PARSE_ERROR: ` + first 200 chars of the raw content (or the error message if there was no content).
  - Write the function so it can be pasted into an n8n Code node: no imports, no top-level `export` inside the body that will be extracted (see sprint 02 for the extraction contract — keep the function between `// @n8n-code-start` and `// @n8n-code-end` marker comments, and keep the exports outside those markers).
- [ ] `src/parse-llm-response.test.ts` (vitest) covering: happy path, fenced content, missing keys, numeric-string years, array skills, non-JSON content, empty/undefined response.
- [ ] `fixtures/sample-openrouter-response.json` — a realistic OpenRouter chat completion payload used by the happy-path test.
- [ ] `scripts/make-fixture.ts` — generates `fixtures/sample-resume.pdf` with `pdf-lib`: a one-page resume for a fictional "Jane Doe" containing name, email, phone, title, a skills line, and two short experience bullets. Commit the generated PDF.
- [ ] `docker-compose.yml` — service `n8n`, image `n8nio/n8n:latest`, `env_file: .env`, port `${N8N_PORT:-5678}:5678`, volume `./n8n_data:/home/node/.n8n`, `restart: unless-stopped`.
- [ ] `README.md` — what the project is, prerequisites (Docker, pnpm, OpenRouter key, Google account), `cp .env.example .env`, `docker compose up -d`, `pnpm install`, `pnpm test`. Leave an "Import the workflow" section that sprint 02 fills in.

## Acceptance criteria

- `pnpm install && pnpm typecheck && pnpm test` green from a clean clone.
- `pnpm fixture` writes a valid PDF whose extracted text contains "Jane Doe" (the sprint 02 validator will not check this; a quick manual `pdftotext` or opening it is enough).
- `docker compose config` succeeds with `.env` copied from `.env.example`.

## Out of scope

- The workflow JSON itself (sprint 02).
- Any real API calls in tests.

## Notes / gotchas

- `.env.example` already exists; keep it in sync if you add variables.
- The parser must produce keys **exactly** equal to the sheet headers (spaces and capitals) because the Sheets node uses auto-mapping.
