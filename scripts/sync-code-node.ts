/**
 * Copies the parser out of `src/parse-llm-response.ts` into the Code node of
 * every workflow in `workflows/`.
 *
 * Run with `pnpm sync`. It is idempotent: on an up-to-date tree it changes
 * nothing and prints "already in sync". `pnpm validate` fails when a workflow
 * JSON has drifted from the parser source, so the two always agree in CI.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKFLOWS_DIR, buildCodeNodeJs } from '../src/code-node.js';

const CODE_NODE_TYPE = 'n8n-nodes-base.code';

interface WorkflowNode {
  type?: unknown;
  name?: unknown;
  parameters?: { jsCode?: unknown } & Record<string, unknown>;
}

interface WorkflowFile {
  nodes?: unknown;
  [key: string]: unknown;
}

/** Every `*.json` in `workflows/`, sorted for stable output. */
function workflowPaths(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => join(WORKFLOWS_DIR, entry));
}

/** Rewrites one workflow file in place; returns true when it changed. */
function syncFile(path: string, jsCode: string): boolean {
  const original = readFileSync(path, 'utf8');
  const workflow: WorkflowFile = JSON.parse(original);

  if (!Array.isArray(workflow.nodes)) {
    throw new Error(`${path}: expected a "nodes" array.`);
  }

  const codeNodes: WorkflowNode[] = workflow.nodes.filter(
    (node: WorkflowNode) => node !== null && typeof node === 'object' && node.type === CODE_NODE_TYPE,
  );
  if (codeNodes.length === 0) {
    throw new Error(`${path}: no ${CODE_NODE_TYPE} node to sync.`);
  }

  for (const node of codeNodes) {
    if (node.parameters === undefined) {
      throw new Error(`${path}: Code node "${String(node.name)}" has no parameters.`);
    }
    node.parameters.jsCode = jsCode;
  }

  const updated = JSON.stringify(workflow, null, 2) + '\n';
  if (updated === original) {
    return false;
  }
  writeFileSync(path, updated);
  return true;
}

function main(): void {
  const paths = workflowPaths();
  if (paths.length === 0) {
    console.log('sync: no workflow JSON in workflows/ - nothing to sync.');
    return;
  }

  const jsCode = buildCodeNodeJs();
  let changed = 0;
  for (const path of paths) {
    if (syncFile(path, jsCode)) {
      changed += 1;
      console.log(`sync: updated ${path}`);
    }
  }
  console.log(
    changed === 0
      ? `sync: already in sync (${paths.length} workflow${paths.length === 1 ? '' : 's'}).`
      : `sync: rewrote ${changed} workflow file(s).`,
  );
}

main();
