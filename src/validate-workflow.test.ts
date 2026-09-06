import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WORKFLOWS_DIR } from './code-node.js';
import { validateWorkflow } from './validate-workflow.js';

const WORKFLOW_PATH = join(WORKFLOWS_DIR, 'resume-summarizer.json');

/** A fresh deep copy of the real workflow, safe to mutate in one test. */
function loadWorkflow(): Record<string, unknown> {
  return JSON.parse(readFileSync(WORKFLOW_PATH, 'utf8'));
}

/** Finds a node by name in a mutable copy of the workflow. */
function nodeNamed(workflow: Record<string, unknown>, name: string): Record<string, unknown> {
  const nodes = workflow.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('workflow has no nodes array');
  }
  const found = nodes.find(
    (node: Record<string, unknown>) => node !== null && node.name === name,
  );
  if (found === undefined) {
    throw new Error(`no node named ${name}`);
  }
  return found as Record<string, unknown>;
}

/** The `parameters` object of a named node. */
function parametersOf(workflow: Record<string, unknown>, name: string): Record<string, unknown> {
  const parameters = nodeNamed(workflow, name).parameters;
  if (parameters === null || typeof parameters !== 'object') {
    throw new Error(`node ${name} has no parameters`);
  }
  return parameters as Record<string, unknown>;
}

describe('validateWorkflow', () => {
  it('accepts the committed workflow', () => {
    expect(validateWorkflow(loadWorkflow())).toEqual([]);
  });

  it('rejects anything that is not a workflow object', () => {
    expect(validateWorkflow(null)).toEqual(['workflow: expected a JSON object']);
    expect(validateWorkflow([])).toEqual(['workflow: expected a JSON object']);
    expect(validateWorkflow({})).toEqual(['workflow: "nodes" must be an array']);
  });

  it('flags a binary property that does not match the form file field', () => {
    const workflow = loadWorkflow();
    parametersOf(workflow, 'Extract from PDF').binaryPropertyName = 'data';

    expect(validateWorkflow(workflow)).toEqual([
      'node "Extract from PDF": binaryPropertyName "data" must equal the form file field name "resume"',
    ]);
  });

  it('flags a broken chain', () => {
    const workflow = loadWorkflow();
    const connections = workflow.connections as Record<string, unknown>;
    delete connections['Extract from PDF'];

    expect(validateWorkflow(workflow)).toEqual([
      'connections: "Extract from PDF" must have exactly one main output leading to "OpenRouter: summarize"',
    ]);
  });

  it('flags a chain that skips a node', () => {
    const workflow = loadWorkflow();
    const connections = workflow.connections as Record<string, unknown>;
    connections['Extract from PDF'] = {
      main: [[{ node: 'Append to Candidates', type: 'main', index: 0 }]],
    };

    expect(validateWorkflow(workflow)).toEqual([
      'connections: "Extract from PDF" must connect to "OpenRouter: summarize", found "Append to Candidates"',
    ]);
  });

  it('flags a stale Code node body', () => {
    const workflow = loadWorkflow();
    parametersOf(workflow, 'Parse LLM response').jsCode = 'return { json: {} };';

    expect(validateWorkflow(workflow)).toEqual([
      'node "Parse LLM response": jsCode is stale - run `pnpm sync` to regenerate it from src/parse-llm-response.ts',
    ]);
  });

  it('flags a wrong typeVersion', () => {
    const workflow = loadWorkflow();
    nodeNamed(workflow, 'On form submission').typeVersion = 2;

    expect(validateWorkflow(workflow)).toEqual([
      'node "On form submission": expected typeVersion 2.2, found 2',
    ]);
  });

  it('flags a renamed node', () => {
    const workflow = loadWorkflow();
    nodeNamed(workflow, 'Extract from PDF').name = 'Extract PDF';

    expect(validateWorkflow(workflow)).toContain(
      'nodes: missing node "Extract from PDF" (n8n-nodes-base.extractFromFile)',
    );
    expect(validateWorkflow(workflow)).toContain(
      'nodes: unexpected node "Extract PDF" ("n8n-nodes-base.extractFromFile")',
    );
  });

  it('flags a body expression that is plain text instead of an expression', () => {
    const workflow = loadWorkflow();
    parametersOf(workflow, 'OpenRouter: summarize').jsonBody = '{"model":"x","response_format":{}}';

    expect(validateWorkflow(workflow)).toEqual([
      'node "OpenRouter: summarize": jsonBody must be an expression starting with "={{"',
      'node "OpenRouter: summarize": jsonBody must reference JSON.stringify',
      'node "OpenRouter: summarize": jsonBody must reference $json.text',
    ]);
  });

  it('flags manual column mapping in the Sheets node', () => {
    const workflow = loadWorkflow();
    const columns = parametersOf(workflow, 'Append to Candidates').columns as Record<string, unknown>;
    columns.mappingMode = 'defineBelow';

    expect(validateWorkflow(workflow)).toEqual([
      'node "Append to Candidates": columns.mappingMode must be "autoMapInputData", found "defineBelow"',
    ]);
  });

  it('flags committed credentials and instance ids', () => {
    const withCredentials = loadWorkflow();
    nodeNamed(withCredentials, 'OpenRouter: summarize').credentials = {
      httpHeaderAuth: { id: 'AbCdEf123456', name: 'OpenRouter' },
    };
    expect(validateWorkflow(withCredentials)).toContain(
      'workflow: contains "\\"credentials\\"" - credential ids must not be committed',
    );

    const withMeta = loadWorkflow();
    withMeta.meta = { instanceId: 'deadbeef' };
    const problems = validateWorkflow(withMeta);
    expect(problems).toContain('workflow: remove the instance-specific "meta" key before committing');
    expect(problems).toContain(
      'workflow: contains "instanceId" - n8n instance ids must not be committed',
    );
  });

  it('flags missing workflow settings', () => {
    const workflow = loadWorkflow();
    workflow.settings = {};

    expect(validateWorkflow(workflow)).toEqual([
      'workflow: settings.executionOrder must be "v1", found undefined',
      'workflow: settings.saveManualExecutions must be true',
    ]);
  });

  it('flags an HTTP node that stops the workflow on error', () => {
    const workflow = loadWorkflow();
    delete nodeNamed(workflow, 'OpenRouter: summarize').onError;

    expect(validateWorkflow(workflow)).toEqual([
      'node "OpenRouter: summarize": onError must be "continueRegularOutput" so a failed call still reaches the parser',
    ]);
  });

  it('flags a missing form completion node', () => {
    const workflow = loadWorkflow();
    const nodes = workflow.nodes as Record<string, unknown>[];
    workflow.nodes = nodes.filter((node) => node.name !== 'Confirm submission');
    const connections = workflow.connections as Record<string, unknown>;
    delete connections['Append to Candidates'];

    expect(validateWorkflow(workflow)).toEqual([
      'nodes: missing node "Confirm submission" (n8n-nodes-base.form)',
      'connections: "Append to Candidates" must have exactly one main output leading to "Confirm submission"',
    ]);
  });

  it('flags a completion message that is not wired to the parsed candidate name', () => {
    const workflow = loadWorkflow();
    parametersOf(workflow, 'Confirm submission').completionMessage = 'Thanks!';

    expect(validateWorkflow(workflow)).toEqual([
      'node "Confirm submission": completionMessage must be an expression starting with "={{"',
    ]);
  });
});
