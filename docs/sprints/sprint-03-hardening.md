# Sprint 03 — Hardening

## Goal

The MVP fails loudly but never silently, the person submitting the form gets confirmation, and
the docs cover the paths not taken.

## Tasks

- [x] Parse failure visibility: confirm `parseLlmResponse` behaviour on non-JSON content is covered by a fixture `fixtures/sample-openrouter-response-bad.json` and a test; `Executive Summary` must start with `PARSE_ERROR:`.
- [x] Form completion message: add a final `n8n-nodes-base.form` node (typeVersion 1, `operation: "completion"`) after the Sheets node with `completionTitle: "Resume received"` and `completionMessage: "={{ $('Parse LLM response').item.json['Candidate Name'] }} was added to the sheet."`. Update `docs/architecture.md`, the validator's expected chain, and its tests.
- [x] Workflow settings: `settings.executionOrder: "v1"`, `settings.saveManualExecutions: true`. Set the HTTP node `onError: "continueRegularOutput"` so a hard OpenRouter failure still reaches the parse node (which then writes a `PARSE_ERROR` row) — verify the parser handles an error-shaped body (`{ error: {...} }`) and add a test.
- [x] `README.md`: troubleshooting section (empty `text` from PDF = scanned image, no OCR in MVP; `$env` undefined = env access blocked; Sheets 403 = wrong OAuth scope / sheet not shared; header mismatch = check `SHEET_COLUMNS`), cost note (gpt-4o-mini ≈ fractions of a cent per resume), and the DOCX / Webhook / Drive alternatives with a link to `docs/architecture.md`.
- [x] `CLAUDE.md`: append a short "Repo layout & commands" section (tree + the five pnpm scripts + the sync rule). Do not remove the blueprint.
- [x] Tick all checkboxes in sprints 01–03.

## Acceptance criteria

- `pnpm sync` no-op, `pnpm validate`, `pnpm typecheck`, `pnpm test` green.
- Reading `README.md` alone, a new person can go from clone to a row in their sheet.

## Out of scope

- OCR for scanned PDFs, DOCX support, deduplication of candidates, any web UI beyond the n8n form.
