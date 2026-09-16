# n8n-SheetScout

Here is a simple, end-to-end MVP blueprint for building a **Resume Summarizer to Google Sheets** workflow in **n8n** using **OpenRouter** as the LLM engine.

---

### MVP Architecture Overview

```text
[Webhook / File Trigger]
       │
       ▼
[Extract File Text] (Read Binary / PDF parser)
       │
       ▼
[HTTP Request / OpenRouter API] (Structured JSON Output)
       │
       ▼
[Google Sheets] (Append Row)

```

---

### Step-by-Step Node Configuration

1. **Trigger (Ingestion):** Accept PDF/DOCX resumes.
Use an **n8n Form Trigger** or a **Webhook Node** with file upload enabled (`multipart/form-data`). Alternatively, monitor a specific folder using a **Google Drive Trigger** for incoming resume files.


2. **Extract Text from Document:** Extract raw text from PDF.
Add the **Extract from File** node (operation: `Extract from PDF` or `Extract from DOCX`).

* **Source Binary Field:** `data`
* **Output Property:** `text`


3. **OpenRouter LLM Node:** Generate structured summary via OpenRouter.
Add an **HTTP Request** node (or the n8n **AI Agent / OpenRouter** integration):

* **Method:** `POST`
* **URL:** `[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)`
* **Authentication:** Header Auth
* `Authorization: Bearer YOUR_OPENROUTER_API_KEY`


* **Model Recommendation:** `google/gemini-flash-1.5` or `openai/gpt-4o-mini` (cost-effective, high context window, reliable JSON mode).
* **JSON Body:** Force structured schema output to make mapping to Google Sheets frictionless:

```json
{
  "model": "google/gemini-flash-1.5",
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "You are an HR parsing assistant. Extract candidate information from the resume text into valid JSON with these exact keys: candidate_name, email, phone, current_title, years_of_experience, top_skills (comma-separated string), summary (2-sentence executive summary)."
    },
    {
      "role": "user",
      "content": "Resume Text:\n{{ $json.text }}"
    }
  ]
}

```


4. **Parse LLM Response:** Prepare flat fields for sheet insertion.
Add a **Code** node to parse the LLM's raw JSON response:

```javascript
const rawContent = $json.choices[0].message.content;
const parsed = JSON.parse(rawContent);

return [{
  json: {
    candidate_name: parsed.candidate_name || 'N/A',
    email: parsed.email || 'N/A',
    phone: parsed.phone || 'N/A',
    current_title: parsed.current_title || 'N/A',
    years_of_experience: parsed.years_of_experience || 'N/A',
    top_skills: parsed.top_skills || 'N/A',
    summary: parsed.summary || 'N/A'
  }
}];

```


5. **Google Sheets (Append Row):** Log candidate into spreadsheet.
Add the **Google Sheets** node:

* **Resource:** `Document`
* **Operation:** `Append Row`
* **Document:** Select your target spreadsheet.
* **Sheet:** Select your sheet tab (e.g., `Candidates`).
* **Mapping Column Mode:** `Map Automatically` (or manually map each parsed JSON field to your header columns).


---

### Target Google Sheets Schema

Create a sheet with the following header row:

| Candidate Name | Email | Phone | Current Title | Years Exp | Top Skills | Executive Summary |
| --- | --- | --- | --- | --- | --- | --- |
| Jane Doe | jane@example.com | +123456789 | Senior Fullstack Eng | 6 | Node.js, React, PostgreSQL | Proven fullstack engineer with 6 years experience scaling microservices. |

---

## Stack

n8n + google sheets

Unless the stack above says otherwise, the default stack for this project is the **T3 stack**:

- Next.js (App Router) + TypeScript (strict)
- tRPC for the API layer
- Tailwind CSS for styling
- Drizzle ORM
- **Local Postgres first**: develop against a local Postgres database (`postgresql://localhost:5432/n8n-sheetscout`). Do NOT set up Neon, cloud databases, or hosting yourself — production binding to Neon + Vercel is handled later by the software factory's deploy wizard.

## Conventions

- Package manager: `pnpm`. Scaffold with `pnpm create t3-app@latest` when starting from scratch.
- Strict TypeScript everywhere; avoid `any`.
- Conventional commits (`feat:`, `fix:`, `chore:`, …). Never add co-author lines to commits.
- Keep secrets in `.env` (git-ignored); maintain an up-to-date `.env.example`.
- Write a short `README.md` early: what the project is, how to run it.
- Before finishing any task: typecheck (and tests, if present) must pass.

---

## Repo layout & commands

```text
n8n-sheetscout/
├── CLAUDE.md                     # this file: blueprint + conventions
├── README.md                     # how to run it, import it, troubleshoot it
├── docker-compose.yml            # local n8n (n8nio/n8n:latest, ./n8n_data volume)
├── .env.example                  # every env var the workflow reads (.env is git-ignored)
├── docs/
│   ├── architecture.md           # authoritative node-by-node design + sheet schema
│   └── sprints/                  # the three build sprints
├── src/
│   ├── parse-llm-response.ts     # SHEET_COLUMNS, CandidateRow, parseLlmResponse (+ test)
│   ├── code-node.ts              # extracts/strips the marked block into Code-node JS (+ test)
│   └── validate-workflow.ts      # validateWorkflow() + `pnpm validate` CLI (+ test)
├── scripts/
│   ├── sync-code-node.ts         # writes the generated body into workflows/*.json
│   └── make-fixture.ts           # regenerates fixtures/sample-resume.pdf with pdf-lib
├── fixtures/                     # sample resume PDF + sample OpenRouter responses
└── workflows/
    └── resume-summarizer.json    # the importable n8n workflow (no credentials, no ids)
```

| Command | What it does |
|---------|--------------|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm validate` | Structural checks on every `workflows/*.json`; exits 1 on problems |
| `pnpm sync` | Regenerates the Code node's `jsCode` from `src/parse-llm-response.ts` |
| `pnpm fixture` | Rewrites `fixtures/sample-resume.pdf` (deterministic; pinned PDF dates) |

### The sync rule

The Code node's `jsCode` inside `workflows/resume-summarizer.json` is **generated**, never
hand-edited. It is the text between `// @n8n-code-start` and `// @n8n-code-end` in
`src/parse-llm-response.ts`, with function-signature type annotations stripped and
`return { json: parseLlmResponse($input.item.json) };` appended.

- Keep that marked block plain JavaScript plus function-signature annotations; types, constants
  and `export`s live outside the markers. `pnpm sync` throws if anything else TypeScript-only
  survives.
- After editing the parser: `pnpm sync`, then `pnpm test && pnpm validate`, then commit both
  files. `pnpm validate` fails with "jsCode is stale" when the JSON drifts.
- Never commit credentials, credential ids, API keys, or an n8n `instanceId`; the validator
  rejects all three.
