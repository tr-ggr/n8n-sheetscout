export interface WorkflowWithNodes {
  nodes?: unknown;
  [key: string]: unknown;
}

const SETUP_NOTE_NAME = 'Setup notes';

const SETUP_NOTE = {
  parameters: {
    content:
      '## Before you run this\n\n' +
      '**Credentials to create in n8n (never stored in this file):**\n\n' +
      '1. `OpenRouter` - type *Header Auth*. Name: `Authorization`,\n' +
      '   Value: `Bearer <your OPENROUTER_API_KEY>`.\n' +
      '   Select it on the **OpenRouter: summarize** node.\n' +
      '2. `Google Sheets` - type *Google Sheets OAuth2 API*.\n' +
      '   Select it on the **Append to Candidates** node.\n\n' +
      '**Environment variables (see `.env.example`):**\n\n' +
      '- `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`)\n' +
      '- `GOOGLE_SHEET_ID` - the spreadsheet id\n' +
      '- `GOOGLE_SHEET_TAB` (default `Candidates`)\n' +
      '- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` so `$env` works in expressions\n\n' +
      'The `Candidates` tab needs this header row:\n' +
      'Candidate Name | Email | Phone | Current Title | Years Exp | Top Skills | Executive Summary',
    height: 460,
    width: 520,
    color: 4,
  },
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position: [-60, -520],
  id: '0f1c8f2a-5f6b-4c1e-9a3d-1b2c3d4e5f60',
  name: SETUP_NOTE_NAME,
} as const;

export function parseSetupInfo(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(
    `Invalid SETUP_INFO value ${JSON.stringify(value)}. Expected "true" or "false".`,
  );
}

function isSetupNote(node: unknown): boolean {
  return (
    node !== null &&
    typeof node === 'object' &&
    'name' in node &&
    node.name === SETUP_NOTE_NAME
  );
}

export function applySetupInfo(workflow: WorkflowWithNodes, enabled: boolean): void {
  if (!Array.isArray(workflow.nodes)) {
    throw new Error('workflow: expected a "nodes" array.');
  }

  const executableNodes = workflow.nodes.filter((node) => !isSetupNote(node));
  workflow.nodes = enabled ? [structuredClone(SETUP_NOTE), ...executableNodes] : executableNodes;
}
