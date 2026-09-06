/**
 * Parsing step for the "Resume Summarizer -> Google Sheets" workflow.
 *
 * Everything between the `@n8n-code-start` / `@n8n-code-end` markers below is
 * copied verbatim into the `jsCode` of the workflow's Code node by
 * `pnpm sync` (see `scripts/sync-code-node.ts`). That block must therefore stay
 * plain, dependency-free JavaScript: no imports, no `export`, and no TypeScript
 * syntax other than the parameter / return type annotations on the function
 * declarations, which the sync script strips.
 *
 * Types and exports live OUTSIDE the markers.
 */

/** The Google Sheets header row - the single source of truth for column names. */
export const SHEET_COLUMNS = [
  'Candidate Name',
  'Email',
  'Phone',
  'Current Title',
  'Years Exp',
  'Top Skills',
  'Executive Summary',
] as const;

export type SheetColumn = (typeof SHEET_COLUMNS)[number];

/** One row appended to the `Candidates` tab; keys equal the sheet headers. */
export type CandidateRow = { [K in SheetColumn]: string | number };

// @n8n-code-start
/** Placeholder written whenever a field is missing or unusable. */
const NOT_AVAILABLE = 'N/A';

/** How much of the offending payload to echo into a PARSE_ERROR row. */
const PREVIEW_LENGTH = 200;

/** Reads a property off a value that may not be an object at all. */
function readField(source: unknown, key: string): unknown {
  if (source === null || typeof source !== 'object') {
    return undefined;
  }
  return Reflect.get(source, key);
}

/** `JSON.parse` that reports failure as `undefined` instead of throwing. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** True for a plain (non-array) object. */
function isRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Best-effort string form of anything, for error previews. */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : String(value);
  } catch {
    return String(value);
  }
}

/** First `PREVIEW_LENGTH` characters, whitespace-normalised. */
function preview(value: unknown): string {
  return safeStringify(value).replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}

/** Removes a surrounding ```json ... ``` fence, if the model added one. */
function stripCodeFence(raw: string): string {
  let text = raw.trim();
  if (text.slice(0, 3) !== '```') {
    return text;
  }
  text = text.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, '');
  const closing = text.lastIndexOf('```');
  if (closing !== -1) {
    text = text.slice(0, closing);
  }
  return text.trim();
}

/** Digs `choices[0].message.content` out of an OpenRouter chat completion. */
function readContent(response: unknown): unknown {
  const choices = readField(response, 'choices');
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const message = readField(choices[0], 'message');
  return readField(message, 'content');
}

/** Explains why there was no usable content (API error body, empty response, ...). */
function describeMissingContent(response: unknown): string {
  const errorField = readField(response, 'error');
  const errorMessage = readField(errorField, 'message');
  if (typeof errorMessage === 'string' && errorMessage.trim() !== '') {
    return preview(errorMessage);
  }
  if (typeof errorField === 'string' && errorField.trim() !== '') {
    return preview(errorField);
  }
  if (errorField !== undefined) {
    return preview(errorField);
  }
  if (response === undefined || response === null) {
    return 'empty response from OpenRouter';
  }
  return 'no message content in OpenRouter response: ' + preview(response);
}

/** Normalises a field to a non-empty string; arrays are comma-joined. */
function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim() === '' ? NOT_AVAILABLE : value.trim();
  }
  if (typeof value === 'number' && isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (const entry of value) {
      const text = toText(entry);
      if (text !== NOT_AVAILABLE) {
        parts.push(text);
      }
    }
    return parts.length === 0 ? NOT_AVAILABLE : parts.join(', ');
  }
  return NOT_AVAILABLE;
}

/** Years of experience as a number when numeric, otherwise `N/A`. */
function toYears(value: unknown): string | number {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) {
    return Number(value.trim());
  }
  return NOT_AVAILABLE;
}

/** A row with every sheet column present and set to `N/A`. */
function blankRow(): CandidateRow {
  return {
    'Candidate Name': NOT_AVAILABLE,
    Email: NOT_AVAILABLE,
    Phone: NOT_AVAILABLE,
    'Current Title': NOT_AVAILABLE,
    'Years Exp': NOT_AVAILABLE,
    'Top Skills': NOT_AVAILABLE,
    'Executive Summary': NOT_AVAILABLE,
  };
}

/**
 * Turns an OpenRouter chat completion into exactly one sheet row.
 * Never throws: an unusable answer still produces a row whose
 * `Executive Summary` starts with `PARSE_ERROR:`, so the failure is visible
 * in the spreadsheet instead of vanishing.
 */
function parseLlmResponse(response: unknown): CandidateRow {
  const row = blankRow();

  const content = readContent(response);
  if (typeof content !== 'string' || content.trim() === '') {
    row['Executive Summary'] = 'PARSE_ERROR: ' + describeMissingContent(response);
    return row;
  }

  const parsed = tryParseJson(stripCodeFence(content));
  if (!isRecord(parsed)) {
    row['Executive Summary'] = 'PARSE_ERROR: ' + preview(content);
    return row;
  }

  row['Candidate Name'] = toText(readField(parsed, 'candidate_name'));
  row.Email = toText(readField(parsed, 'email'));
  row.Phone = toText(readField(parsed, 'phone'));
  row['Current Title'] = toText(readField(parsed, 'current_title'));
  row['Years Exp'] = toYears(readField(parsed, 'years_of_experience'));
  row['Top Skills'] = toText(readField(parsed, 'top_skills'));
  row['Executive Summary'] = toText(readField(parsed, 'summary'));

  return row;
}
// @n8n-code-end

export { parseLlmResponse };
