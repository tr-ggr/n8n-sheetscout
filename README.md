# n8n-SheetScout

Resume Summarizer → Google Sheets. An [n8n](https://n8n.io) workflow that takes an uploaded PDF
resume, extracts the text, asks an LLM (via [OpenRouter](https://openrouter.ai)) for a structured
summary, and appends the candidate as a row in a Google Sheet.

```text
[On form submission] → [Extract from PDF] → [OpenRouter: summarize] → [Parse LLM response] → [Append to Candidates]
```

See `docs/architecture.md` for the design and `docs/sprints/` for the build plan.

## What is in this repo

| Path | What it is |
|------|------------|
| `docs/architecture.md` | Authoritative node-by-node design and the sheet schema |
| `src/parse-llm-response.ts` | The pure parsing function; its body is the workflow's Code node |
| `src/validate-workflow.ts` | Structural validator for the workflow JSON (`pnpm validate`) |
| `scripts/sync-code-node.ts` | Copies the parser into the workflow JSON (`pnpm sync`) |
| `scripts/make-fixture.ts` | Regenerates `fixtures/sample-resume.pdf` (`pnpm fixture`) |
| `fixtures/` | Sample resume PDF and sample OpenRouter responses used by tests |
| `workflows/` | The exported n8n workflow JSON (added in sprint 02) |

## Prerequisites

- Docker with the Compose plugin (to run n8n locally)
- Node.js 20+ and [pnpm](https://pnpm.io) (for the tests and scripts)
- An OpenRouter API key — <https://openrouter.ai/keys>
- A Google account with a spreadsheet you can write to

## Set up

```bash
cp .env.example .env      # then fill in OPENROUTER_API_KEY and GOOGLE_SHEET_ID
pnpm install
pnpm test
```

Create the target spreadsheet with a tab named `Candidates` whose row 1 is exactly:

| Candidate Name | Email | Phone | Current Title | Years Exp | Top Skills | Executive Summary |
|---|---|---|---|---|---|---|

The header names are mirrored in `SHEET_COLUMNS` in `src/parse-llm-response.ts`; the Google Sheets
node maps by column name, so they must match character for character.

## Run n8n locally

```bash
docker compose up -d          # n8n on http://localhost:5678
docker compose logs -f n8n    # follow the logs
docker compose down           # stop it
```

n8n's data (workflows, credentials, encryption key) lives in `./n8n_data`, which is git-ignored.

## Import the workflow

_Added in sprint 02, once `workflows/resume-summarizer.json` exists._

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest, run once |
| `pnpm validate` | Structural checks on `workflows/*.json` |
| `pnpm sync` | Regenerates the Code node body from `src/parse-llm-response.ts` |
| `pnpm fixture` | Rewrites `fixtures/sample-resume.pdf` |

## Notes

- Never commit `.env`, credential ids, or an n8n `instanceId`. Only `.env.example` is tracked.
- `fixtures/sample-resume.pdf` is generated and committed. `pnpm fixture` pins the PDF metadata
  dates so regenerating it is byte-identical; if a future pdf-lib version reintroduces
  nondeterminism, a changed PDF with identical text is harmless.
