# n8n-SheetScout

Resume Summarizer → Google Sheets. An [n8n](https://n8n.io) workflow that takes an uploaded PDF
resume, extracts the text, asks an LLM (via [OpenRouter](https://openrouter.ai)) for a structured
summary, and appends the candidate as a row in a Google Sheet.

```text
[On form submission] → [Extract from PDF] → [OpenRouter: summarize]
      → [Parse LLM response] → [Append to Candidates] → [Confirm submission]
```

If the LLM call fails or answers with something that is not JSON, the workflow still writes a row
whose `Executive Summary` starts with `PARSE_ERROR:` — the failure shows up in the sheet rather
than only in the execution log.

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

1. **Import.** In n8n: **Workflows → ⋯ → Import from File…** and pick
   `workflows/resume-summarizer.json`.
2. **Create the OpenRouter credential.** **Credentials → New → Header Auth**, name it
   `OpenRouter`, set **Name** to `Authorization` and **Value** to `Bearer <your key>`.
   Open the **OpenRouter: summarize** node and select it.
3. **Create the Google Sheets credential.** **Credentials → New → Google Sheets OAuth2 API**,
   paste a Google Cloud OAuth client id/secret (the callback URL is shown in the dialog), and
   complete the consent flow. Open the **Append to Candidates** node and select it.
4. **Set the env vars.** Fill `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB` and `OPENROUTER_MODEL` in
   `.env`, then `docker compose up -d --force-recreate` so n8n picks them up. The workflow reads
   them through `$env`, which needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (already in
   `.env.example`).
5. **Activate** the workflow, then open the **On form submission** node and copy the
   **Production URL** (the test URL only listens for one execution).
6. **Try it.** Open the form URL and upload `fixtures/sample-resume.pdf`. The form should answer
   "Resume received — Jane Doe was added to the sheet." and a matching row should appear in the
   `Candidates` tab.

The imported JSON deliberately contains no credential ids, so step 2 and 3 are always required.

### Changing the parser

`src/parse-llm-response.ts` is the source of truth for the Code node. After editing it:

```bash
pnpm sync        # rewrites the Code node's jsCode in workflows/*.json
pnpm test        # unit tests for the parser
pnpm validate    # fails if the JSON drifted from the parser
```

Then re-import the workflow into n8n (or paste the new body into the Code node). Never edit
`jsCode` inside the JSON by hand — `pnpm validate` will reject it.

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest, run once |
| `pnpm validate` | Structural checks on `workflows/*.json` |
| `pnpm sync` | Regenerates the Code node body from `src/parse-llm-response.ts` |
| `pnpm fixture` | Rewrites `fixtures/sample-resume.pdf` |

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Every row is `N/A` and `Executive Summary` starts with `PARSE_ERROR:` | The model did not return JSON, or the OpenRouter call failed. The row is deliberate — read the error text in that cell. Check your OpenRouter credit and that the model supports `response_format: json_object`. |
| `text` is empty after **Extract from PDF** | The PDF is a scanned image with no text layer. There is no OCR in this MVP; re-export the resume as a text PDF or add an OCR step. |
| Expression error: `$env is not defined` / values come out empty | n8n blocks env access in nodes by default. Set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in `.env` and `docker compose up -d --force-recreate`. |
| Google Sheets returns 403 | The OAuth credential is missing the Sheets scope, or the signed-in Google account cannot edit that spreadsheet. Re-run the OAuth flow and share the sheet with that account. |
| Rows land in the wrong columns, or columns stay empty | The sheet headers do not match `SHEET_COLUMNS` in `src/parse-llm-response.ts` character for character. Auto-mapping matches by name; fix the header row (or the constant, then `pnpm sync`). |
| The form says "This webhook is not registered" | The workflow is not active, or you used the test URL. Activate it and use the **Production URL**. |
| `pnpm validate` says `jsCode is stale` | The workflow JSON drifted from the parser. Run `pnpm sync` and commit the result. |

## Cost

One resume is roughly 1–2k input tokens plus a couple of hundred output tokens. On
`openai/gpt-4o-mini` that is a fraction of a US cent per resume (order of $0.001), so a few
thousand resumes cost a few dollars. Switching `OPENROUTER_MODEL` to a larger model changes this
by one to two orders of magnitude.

## Alternatives not taken

`docs/architecture.md` records the paths this MVP deliberately skipped:

- **Webhook trigger** instead of the form (`multipart/form-data`; the file arrives in the `data`
  binary property, so **Extract from PDF** would need `binaryPropertyName: data`).
- **Google Drive trigger** watching a folder, then Drive → Download, then the same chain.
- **DOCX resumes** — the Extract From File node handles PDF only. It needs a Switch on
  `mimeType` and a Code node using `mammoth` (`NODE_FUNCTION_ALLOW_EXTERNAL=mammoth`).
- **OCR** for scanned PDFs, candidate de-duplication, and any UI beyond the n8n form.

## Notes

- Never commit `.env`, credential ids, or an n8n `instanceId`. Only `.env.example` is tracked.
- `fixtures/sample-resume.pdf` is generated and committed. `pnpm fixture` pins the PDF metadata
  dates so regenerating it is byte-identical; if a future pdf-lib version reintroduces
  nondeterminism, a changed PDF with identical text is harmless.
