/**
 * Generates the body of the workflow's Code node from `parse-llm-response.ts`.
 *
 * The workflow JSON is never hand-edited: `pnpm sync` regenerates the `jsCode`
 * from this module and `pnpm validate` fails when the JSON has drifted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Source file the Code node body is extracted from. */
export const PARSER_SOURCE_PATH = fileURLToPath(new URL('./parse-llm-response.ts', import.meta.url));

/** Directory holding the exported workflow JSON files. */
export const WORKFLOWS_DIR = fileURLToPath(new URL('../workflows/', import.meta.url));

const START_MARKER = '// @n8n-code-start';
const END_MARKER = '// @n8n-code-end';

/** Appended so the Code node returns one item per input item. */
const TRAILER = 'return { json: parseLlmResponse($input.item.json) };';

/**
 * TypeScript-only tokens that must not survive into the generated JavaScript.
 * Anything matching here means the marked block used syntax the stripper does
 * not understand, so we fail loudly rather than ship broken JS.
 */
const RESIDUAL_TYPE_SYNTAX =
  /(:\s*(unknown|CandidateRow|Record<|Array<|readonly\b))|(\bas\s+(unknown|const|Record<))|(^\s*(interface|type|enum)\s)|(\bimport\b)|(\bexport\b)/m;

/**
 * Matches a single-line function declaration, capturing its head, its parameter
 * list and any return type annotation, e.g.
 * `function toYears(value: unknown): string | number {`.
 */
const FUNCTION_DECLARATION =
  /^(\s*function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\()([^)]*)(\))\s*(?::[^{]*)?(\{)\s*$/;

/** Removes the `name: Type` annotations from one parameter list. */
function stripParameterTypes(parameterList: string): string {
  if (parameterList.trim() === '') {
    return '';
  }
  return parameterList
    .split(',')
    .map((parameter) => {
      const colon = parameter.indexOf(':');
      return (colon === -1 ? parameter : parameter.slice(0, colon)).trim();
    })
    .join(', ');
}

/**
 * Strips the parameter and return type annotations from function declarations
 * so the block is plain JavaScript. Throws when anything else TypeScript-only
 * is left behind.
 */
export function stripTypeAnnotations(block: string): string {
  const stripped = block
    .split('\n')
    .map((line) => {
      const match = FUNCTION_DECLARATION.exec(line);
      if (match === null) {
        return line;
      }
      const [, head = '', parameters = '', close = ')', brace = '{'] = match;
      return `${head}${stripParameterTypes(parameters)}${close} ${brace}`;
    })
    .join('\n');

  const residue = RESIDUAL_TYPE_SYNTAX.exec(stripped);
  if (residue !== null) {
    throw new Error(
      `Generated Code node body still contains TypeScript-only syntax: ${JSON.stringify(residue[0])}. ` +
        'Keep the marked block to plain JavaScript plus function signature annotations.',
    );
  }
  return stripped;
}

/** Pulls the text between the `@n8n-code-start` / `@n8n-code-end` markers. */
export function extractMarkedBlock(source: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    throw new Error(`Missing ${START_MARKER} / ${END_MARKER} markers in the parser source.`);
  }
  if (end < start) {
    throw new Error(`${END_MARKER} appears before ${START_MARKER} in the parser source.`);
  }
  return source.slice(start + START_MARKER.length, end);
}

/**
 * The exact string that belongs in the Code node's `jsCode`: the marked block
 * with its type annotations removed, plus the n8n return trailer.
 */
export function buildCodeNodeJs(source?: string): string {
  const text = source ?? readFileSync(PARSER_SOURCE_PATH, 'utf8');
  const block = stripTypeAnnotations(extractMarkedBlock(text)).trim();

  const body = `${block}\n\n${TRAILER}\n`;

  // Cheap syntax check: if this throws, the generated body is not valid JS.
  new Function(body);

  return body;
}
