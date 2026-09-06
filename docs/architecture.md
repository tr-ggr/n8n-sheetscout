# Architecture: Resume Summarizer → Google Sheets

```text
[On form submission]  n8n Form Trigger, one required PDF file field named `resume`
        │
        ▼
[Extract from PDF]    Extract From File node, operation `pdf`, binary property `resume` → `$json.text`
        │
        ▼
[OpenRouter: summarize]   HTTP Request → POST https://openrouter.ai/api/v1/chat/completions
        │                 Header Auth credential "OpenRouter"; response_format json_object
        ▼
[Parse LLM response]  Code node (run once per item) – body generated from src/parse-llm-response.ts
        │
        ▼
[Append to Candidates]  Google Sheets node, Append Row, Map Automatically
```

## Node-by-node configuration

| # | Node name | Type / version | Key parameters |
|---|-----------|----------------|----------------|
| 1 | `On form submission` | `n8n-nodes-base.formTrigger` 2.2 | form title "Upload a resume"; one field, type `file`, label/name `resume`, `acceptFileTypes: .pdf`, `multipleFiles: false`, required |
| 2 | `Extract from PDF` | `n8n-nodes-base.extractFromFile` 1 | `operation: pdf`, `binaryPropertyName: resume` |
| 3 | `OpenRouter: summarize` | `n8n-nodes-base.httpRequest` 4.2 | `method: POST`, `url: https://openrouter.ai/api/v1/chat/completions`, `authentication: genericCredentialType`, `genericAuthType: httpHeaderAuth`, `sendBody: true`, `specifyBody: json`, `jsonBody` = expression below, `options.retryOnFail`/`maxTries: 3` at node level |
| 4 | `Parse LLM response` | `n8n-nodes-base.code` 2 | `mode: runOnceForEachItem`, `jsCode` synced from `src/parse-llm-response.ts` |
| 5 | `Append to Candidates` | `n8n-nodes-base.googleSheets` 4.5 | `operation: append`, `documentId: {mode: id, value: ={{ $env.GOOGLE_SHEET_ID }}}`, `sheetName: {mode: name, value: Candidates}`, `columns.mappingMode: autoMapInputData` |

Plus one Sticky Note node telling the importer which credentials to create.

### Why the file lands in `resume`, not `data`

The Form Trigger stores an uploaded file in the binary property named after the form
field. The blueprint's default of `data` applies to the Webhook trigger; with the Form
Trigger the Extract node must read `resume`. The validator test asserts this.

### HTTP Request JSON body (expression)

```json
={{ JSON.stringify({
  model: $env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: "You are an HR parsing assistant. Extract candidate information from the resume text into valid JSON with these exact keys: candidate_name, email, phone, current_title, years_of_experience, top_skills (comma-separated string), summary (2-sentence executive summary)." },
    { role: "user", content: "Resume Text:\n" + $json.text }
  ]
}) }}
```

Using `JSON.stringify` inside the expression avoids broken JSON when the resume text
contains quotes or newlines. Do **not** interpolate `{{ $json.text }}` into a raw JSON
template.

### Parse step contract

Input: the raw OpenRouter response (`choices[0].message.content` is a JSON string, possibly
wrapped in a ```json fence). Output: exactly one item whose keys equal the sheet headers:

| Output key | Source | Fallback |
|------------|--------|----------|
| `Candidate Name` | `candidate_name` | `N/A` |
| `Email` | `email` | `N/A` |
| `Phone` | `phone` | `N/A` |
| `Current Title` | `current_title` | `N/A` |
| `Years Exp` | `years_of_experience` (number or numeric string → number) | `N/A` |
| `Top Skills` | `top_skills` (array → comma-joined string) | `N/A` |
| `Executive Summary` | `summary` | `N/A`, or `PARSE_ERROR: <first 200 chars>` when the content is not JSON |

The parse step must never throw; a bad LLM answer still produces a row so the failure is
visible in the sheet.

## Target Google Sheets schema

Create a spreadsheet with a tab named `Candidates` and this header row in row 1:

| Candidate Name | Email | Phone | Current Title | Years Exp | Top Skills | Executive Summary |
|---|---|---|---|---|---|---|
| Jane Doe | jane@example.com | +123456789 | Senior Fullstack Eng | 6 | Node.js, React, PostgreSQL | Proven fullstack engineer with 6 years experience scaling microservices. |

## Credentials (created inside n8n, never committed)

| Credential | Type | Value |
|------------|------|-------|
| `OpenRouter` | Header Auth | name `Authorization`, value `Bearer <OPENROUTER_API_KEY>` |
| `Google Sheets` | Google Sheets OAuth2 API | Google Cloud OAuth client with Sheets scope; redirect URL from the n8n credential dialog |

The exported workflow JSON must contain no credential ids or secrets. The importer selects
the credentials on nodes 3 and 5 after import.

## Alternatives (not in MVP)

- **Webhook trigger**: `n8n-nodes-base.webhook` with `multipart/form-data`; file arrives in
  binary `data` (or the multipart field name). Swap node 1 and change `binaryPropertyName`.
- **Google Drive trigger**: watch a folder, then Google Drive → Download, then node 2.
- **DOCX**: Extract From File does not support DOCX. Add a Switch on `mimeType`, and for DOCX a
  Code node using `mammoth` (`NODE_FUNCTION_ALLOW_EXTERNAL=mammoth` in docker env).
- **Model**: `google/gemini-flash-1.5` from the original blueprint is deprecated on OpenRouter;
  use `openai/gpt-4o-mini` or `google/gemini-2.5-flash`.
