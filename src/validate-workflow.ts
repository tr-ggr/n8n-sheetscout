/**
 * Structural validator for the exported n8n workflow JSON.
 *
 * `validateWorkflow` returns a list of human-readable problems (empty when the
 * workflow is fine). Run as a script (`pnpm validate`) it checks every
 * `workflows/*.json` and exits 1 if any of them has a problem.
 *
 * The expectations here mirror `docs/architecture.md`; when the design changes,
 * change both.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORKFLOWS_DIR, buildCodeNodeJs } from './code-node.js';

interface ExpectedNode {
  readonly name: string;
  readonly type: string;
  readonly typeVersion: number;
}

/** The linear chain of nodes, in execution order. */
export const EXPECTED_CHAIN: readonly ExpectedNode[] = [
  { name: 'On form submission', type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2 },
  { name: 'Extract from PDF', type: 'n8n-nodes-base.extractFromFile', typeVersion: 1 },
  { name: 'OpenRouter: summarize', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 },
  { name: 'Parse LLM response', type: 'n8n-nodes-base.code', typeVersion: 2 },
  { name: 'Append to Candidates', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5 },
];

const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Strings that must never appear in a committed workflow export. */
const FORBIDDEN_SUBSTRINGS: readonly { readonly needle: string; readonly why: string }[] = [
  { needle: '"credentials"', why: 'credential ids must not be committed' },
  { needle: 'sk-or-', why: 'looks like an OpenRouter API key' },
  { needle: 'instanceId', why: 'n8n instance ids must not be committed' },
];

/** Narrows an unknown value to a plain object, or `undefined`. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/** Reads `record[key]` as a plain object, or `undefined`. */
function childRecord(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return record === undefined ? undefined : asRecord(record[key]);
}

/** Reads `record[key]` as a string, or `undefined`. */
function childString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** Describes a value compactly for an error message. */
function show(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/** Checks the top-level shape of the export. */
function checkTopLevel(workflow: Record<string, unknown>, problems: string[]): void {
  if (typeof workflow.name !== 'string' || workflow.name.trim() === '') {
    problems.push('workflow: "name" must be a non-empty string');
  }
  if (asRecord(workflow.connections) === undefined) {
    problems.push('workflow: "connections" must be an object');
  }
  if (asRecord(workflow.pinData) === undefined) {
    problems.push('workflow: "pinData" must be an object (use {})');
  }
  const settings = asRecord(workflow.settings);
  if (settings === undefined) {
    problems.push('workflow: "settings" must be an object');
  } else if (settings.executionOrder !== 'v1') {
    problems.push(`workflow: settings.executionOrder must be "v1", found ${show(settings.executionOrder)}`);
  }
  for (const key of ['id', 'versionId', 'meta']) {
    if (key in workflow) {
      problems.push(`workflow: remove the instance-specific "${key}" key before committing`);
    }
  }
}

/** Indexes the nodes by name and reports type/version/coverage problems. */
function checkNodes(
  nodes: readonly unknown[],
  problems: string[],
): Map<string, Record<string, unknown>> {
  const byName = new Map<string, Record<string, unknown>>();

  for (const entry of nodes) {
    const node = asRecord(entry);
    if (node === undefined) {
      problems.push('nodes: every entry must be an object');
      continue;
    }
    const name = childString(node, 'name');
    if (name === undefined) {
      problems.push(`nodes: node without a name (type ${show(node.type)})`);
      continue;
    }
    if (byName.has(name)) {
      problems.push(`nodes: duplicate node name "${name}"`);
      continue;
    }
    byName.set(name, node);
  }

  const expectedNames = new Set(EXPECTED_CHAIN.map((node) => node.name));
  for (const expected of EXPECTED_CHAIN) {
    const node = byName.get(expected.name);
    if (node === undefined) {
      problems.push(`nodes: missing node "${expected.name}" (${expected.type})`);
      continue;
    }
    if (node.type !== expected.type) {
      problems.push(
        `node "${expected.name}": expected type ${show(expected.type)}, found ${show(node.type)}`,
      );
    }
    if (node.typeVersion !== expected.typeVersion) {
      problems.push(
        `node "${expected.name}": expected typeVersion ${expected.typeVersion}, found ${show(node.typeVersion)}`,
      );
    }
  }

  for (const [name, node] of byName) {
    if (!expectedNames.has(name) && node.type !== STICKY_NOTE_TYPE) {
      problems.push(`nodes: unexpected node "${name}" (${show(node.type)})`);
    }
  }

  return byName;
}

/** Asserts the nodes are wired as one straight line, in order. */
function checkConnections(workflow: Record<string, unknown>, problems: string[]): void {
  const connections = asRecord(workflow.connections);
  if (connections === undefined) {
    return;
  }

  for (let index = 0; index < EXPECTED_CHAIN.length - 1; index += 1) {
    const from = EXPECTED_CHAIN[index]?.name ?? '';
    const to = EXPECTED_CHAIN[index + 1]?.name ?? '';
    const outputs = asRecord(connections[from])?.main;

    if (!Array.isArray(outputs) || outputs.length !== 1) {
      problems.push(`connections: "${from}" must have exactly one main output leading to "${to}"`);
      continue;
    }
    const targets = outputs[0];
    if (!Array.isArray(targets) || targets.length !== 1) {
      problems.push(`connections: "${from}" main[0] must have exactly one target ("${to}")`);
      continue;
    }
    const target = asRecord(targets[0]);
    if (childString(target, 'node') !== to) {
      problems.push(
        `connections: "${from}" must connect to "${to}", found ${show(target?.node)}`,
      );
    }
  }

  const last = EXPECTED_CHAIN[EXPECTED_CHAIN.length - 1]?.name ?? '';
  if (last in connections) {
    problems.push(`connections: "${last}" is the final node and must have no outgoing connection`);
  }

  for (const name of Object.keys(connections)) {
    if (!EXPECTED_CHAIN.some((node) => node.name === name)) {
      problems.push(`connections: unknown source node "${name}"`);
    }
  }
}

/** Form trigger: one required PDF file field whose name the Extract node reads. */
function checkFormAndExtract(
  byName: Map<string, Record<string, unknown>>,
  problems: string[],
): void {
  const form = byName.get('On form submission');
  const extract = byName.get('Extract from PDF');
  if (form === undefined || extract === undefined) {
    return;
  }

  const formParams = childRecord(form, 'parameters');
  if (typeof form.webhookId !== 'string' || form.webhookId.trim() === '') {
    problems.push('node "On form submission": needs a node-level "webhookId"');
  }
  if (childString(formParams, 'formTitle') === undefined) {
    problems.push('node "On form submission": needs a "formTitle"');
  }

  const values = childRecord(formParams, 'formFields')?.values;
  if (!Array.isArray(values) || values.length !== 1) {
    problems.push('node "On form submission": expected exactly one form field');
    return;
  }
  const field = asRecord(values[0]);
  const fieldLabel = childString(field, 'fieldLabel');

  if (childString(field, 'fieldType') !== 'file') {
    problems.push(`node "On form submission": field must be of type "file", found ${show(field?.fieldType)}`);
  }
  if (childString(field, 'acceptFileTypes') !== '.pdf') {
    problems.push(
      `node "On form submission": acceptFileTypes must be ".pdf", found ${show(field?.acceptFileTypes)}`,
    );
  }
  if (field?.multipleFiles !== false) {
    problems.push('node "On form submission": multipleFiles must be false');
  }
  if (field?.requiredField !== true) {
    problems.push('node "On form submission": requiredField must be true');
  }

  const extractParams = childRecord(extract, 'parameters');
  if (childString(extractParams, 'operation') !== 'pdf') {
    problems.push(
      `node "Extract from PDF": operation must be "pdf", found ${show(extractParams?.operation)}`,
    );
  }
  const binaryProperty = childString(extractParams, 'binaryPropertyName');
  if (binaryProperty !== fieldLabel) {
    problems.push(
      `node "Extract from PDF": binaryPropertyName ${show(binaryProperty)} must equal the form file field name ${show(fieldLabel)}`,
    );
  }
}

/** HTTP Request node: endpoint, header auth and the JSON.stringify body expression. */
function checkHttpRequest(byName: Map<string, Record<string, unknown>>, problems: string[]): void {
  const node = byName.get('OpenRouter: summarize');
  if (node === undefined) {
    return;
  }
  const parameters = childRecord(node, 'parameters');

  if (childString(parameters, 'method') !== 'POST') {
    problems.push(`node "OpenRouter: summarize": method must be "POST", found ${show(parameters?.method)}`);
  }
  if (childString(parameters, 'url') !== OPENROUTER_URL) {
    problems.push(`node "OpenRouter: summarize": url must be "${OPENROUTER_URL}", found ${show(parameters?.url)}`);
  }
  if (childString(parameters, 'authentication') !== 'genericCredentialType') {
    problems.push('node "OpenRouter: summarize": authentication must be "genericCredentialType"');
  }
  if (childString(parameters, 'genericAuthType') !== 'httpHeaderAuth') {
    problems.push(
      `node "OpenRouter: summarize": genericAuthType must be "httpHeaderAuth", found ${show(parameters?.genericAuthType)}`,
    );
  }
  if (parameters?.sendBody !== true) {
    problems.push('node "OpenRouter: summarize": sendBody must be true');
  }
  if (childString(parameters, 'specifyBody') !== 'json') {
    problems.push('node "OpenRouter: summarize": specifyBody must be "json"');
  }

  const body = childString(parameters, 'jsonBody');
  if (body === undefined) {
    problems.push('node "OpenRouter: summarize": jsonBody is missing');
  } else {
    if (!body.startsWith('={{')) {
      problems.push('node "OpenRouter: summarize": jsonBody must be an expression starting with "={{"');
    }
    for (const needle of ['JSON.stringify', '$json.text', 'response_format']) {
      if (!body.includes(needle)) {
        problems.push(`node "OpenRouter: summarize": jsonBody must reference ${needle}`);
      }
    }
  }

  if (node.retryOnFail !== true) {
    problems.push('node "OpenRouter: summarize": retryOnFail must be true');
  }
  if (node.maxTries !== 3) {
    problems.push(`node "OpenRouter: summarize": maxTries must be 3, found ${show(node.maxTries)}`);
  }
}

/** Code node: correct mode, and `jsCode` exactly what `pnpm sync` generates. */
function checkCodeNode(byName: Map<string, Record<string, unknown>>, problems: string[]): void {
  const node = byName.get('Parse LLM response');
  if (node === undefined) {
    return;
  }
  const parameters = childRecord(node, 'parameters');

  if (childString(parameters, 'mode') !== 'runOnceForEachItem') {
    problems.push(
      `node "Parse LLM response": mode must be "runOnceForEachItem", found ${show(parameters?.mode)}`,
    );
  }
  if (childString(parameters, 'jsCode') !== buildCodeNodeJs()) {
    problems.push(
      'node "Parse LLM response": jsCode is stale - run `pnpm sync` to regenerate it from src/parse-llm-response.ts',
    );
  }
}

/** Google Sheets node: append with automatic column mapping. */
function checkSheetsNode(byName: Map<string, Record<string, unknown>>, problems: string[]): void {
  const node = byName.get('Append to Candidates');
  if (node === undefined) {
    return;
  }
  const parameters = childRecord(node, 'parameters');

  if (childString(parameters, 'operation') !== 'append') {
    problems.push(
      `node "Append to Candidates": operation must be "append", found ${show(parameters?.operation)}`,
    );
  }
  const documentId = childRecord(parameters, 'documentId');
  if (documentId?.__rl !== true || documentId.mode !== 'id') {
    problems.push('node "Append to Candidates": documentId must be a resource locator in "id" mode');
  }
  const sheetName = childRecord(parameters, 'sheetName');
  if (sheetName?.__rl !== true || sheetName.mode !== 'name') {
    problems.push('node "Append to Candidates": sheetName must be a resource locator in "name" mode');
  }
  const mappingMode = childString(childRecord(parameters, 'columns'), 'mappingMode');
  if (mappingMode !== 'autoMapInputData') {
    problems.push(
      `node "Append to Candidates": columns.mappingMode must be "autoMapInputData", found ${show(mappingMode)}`,
    );
  }
}

/** Guards against committing credentials or instance-specific ids. */
function checkNoSecrets(workflow: Record<string, unknown>, problems: string[]): void {
  const serialized = JSON.stringify(workflow);
  for (const { needle, why } of FORBIDDEN_SUBSTRINGS) {
    if (serialized.includes(needle)) {
      problems.push(`workflow: contains ${JSON.stringify(needle)} - ${why}`);
    }
  }
}

/** Returns every structural problem with a workflow export; empty means valid. */
export function validateWorkflow(json: unknown): string[] {
  const problems: string[] = [];
  const workflow = asRecord(json);

  if (workflow === undefined) {
    return ['workflow: expected a JSON object'];
  }
  if (!Array.isArray(workflow.nodes)) {
    return ['workflow: "nodes" must be an array'];
  }

  checkTopLevel(workflow, problems);
  const byName = checkNodes(workflow.nodes, problems);
  checkConnections(workflow, problems);
  checkFormAndExtract(byName, problems);
  checkHttpRequest(byName, problems);
  checkCodeNode(byName, problems);
  checkSheetsNode(byName, problems);
  checkNoSecrets(workflow, problems);

  return problems;
}

/** CLI: validate every `workflows/*.json`, exit 1 on the first bad file. */
function main(): void {
  const files = readdirSync(WORKFLOWS_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('validate: no workflow JSON in workflows/ - nothing to check.');
    return;
  }

  let failed = false;
  for (const file of files) {
    const path = join(WORKFLOWS_DIR, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      failed = true;
      console.error(`✗ ${basename(path)}: not valid JSON - ${String(error)}`);
      continue;
    }

    const problems = validateWorkflow(parsed);
    if (problems.length === 0) {
      console.log(`✓ ${basename(path)}`);
      continue;
    }
    failed = true;
    console.error(`✗ ${basename(path)}`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
