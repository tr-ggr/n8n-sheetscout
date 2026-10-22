import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WORKFLOWS_DIR } from './code-node.js';
import { applySetupInfo, parseSetupInfo } from './setup-info.js';
import { validateWorkflow } from './validate-workflow.js';

const WORKFLOW_PATH = join(WORKFLOWS_DIR, 'resume-summarizer.json');

function workflow(): Record<string, unknown> {
  return JSON.parse(readFileSync(WORKFLOW_PATH, 'utf8')) as Record<string, unknown>;
}

function setupNotes(value: Record<string, unknown>): unknown[] {
  const nodes = value.nodes;
  if (!Array.isArray(nodes)) throw new Error('workflow has no nodes array');
  return nodes.filter(
    (node) => node !== null && typeof node === 'object' && 'name' in node && node.name === 'Setup notes',
  );
}

describe('SETUP_INFO workflow generation', () => {
  it('defaults to false, accepts booleans, and rejects invalid values', () => {
    expect(parseSetupInfo(undefined)).toBe(false);
    expect(parseSetupInfo('')).toBe(false);
    expect(parseSetupInfo('false')).toBe(false);
    expect(parseSetupInfo('true')).toBe(true);
    expect(() => parseSetupInfo('yes')).toThrow(/Invalid SETUP_INFO value.*true.*false/);
  });

  it('removes setup notes when false and includes exactly one when true', () => {
    const hidden = workflow();
    applySetupInfo(hidden, false);
    expect(setupNotes(hidden)).toHaveLength(0);

    const shown = workflow();
    applySetupInfo(shown, true);
    applySetupInfo(shown, true);
    expect(setupNotes(shown)).toHaveLength(1);
    expect(validateWorkflow(shown)).toEqual([]);
  });

  it('is deterministic, keeps connections unchanged, and still validates', () => {
    const first = workflow();
    const connections = JSON.stringify(first.connections);
    applySetupInfo(first, false);

    const second = workflow();
    applySetupInfo(second, false);

    expect(JSON.stringify(first, null, 2)).toBe(JSON.stringify(second, null, 2));
    expect(JSON.stringify(first.connections)).toBe(connections);
    expect(validateWorkflow(first)).toEqual([]);
  });
});
