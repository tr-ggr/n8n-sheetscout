import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SHEET_COLUMNS, parseLlmResponse } from './parse-llm-response.js';

/** Reads a fixture from `fixtures/` and parses it as JSON. */
function readFixture(name: string): unknown {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Wraps `content` in a minimal OpenRouter chat-completion envelope. */
function completion(content: unknown): unknown {
  return { choices: [{ index: 0, message: { role: 'assistant', content } }] };
}

describe('SHEET_COLUMNS', () => {
  it('matches the header row in docs/architecture.md', () => {
    expect([...SHEET_COLUMNS]).toEqual([
      'Candidate Name',
      'Email',
      'Phone',
      'Current Title',
      'Years Exp',
      'Top Skills',
      'Executive Summary',
    ]);
  });
});

describe('parseLlmResponse', () => {
  it('maps the sample OpenRouter response onto the sheet columns', () => {
    const row = parseLlmResponse(readFixture('sample-openrouter-response.json'));

    expect(row).toEqual({
      'Candidate Name': 'Jane Doe',
      Email: 'jane.doe@example.com',
      Phone: '+1 555 0100',
      'Current Title': 'Senior Fullstack Engineer',
      'Years Exp': 6,
      'Top Skills': 'Node.js, React, PostgreSQL, TypeScript, AWS',
      'Executive Summary':
        'Proven fullstack engineer with six years of experience scaling Node.js microservices and React front ends. Led a payments platform migration that cut checkout latency by 40 percent.',
    });
  });

  it('always returns every sheet column', () => {
    const row = parseLlmResponse(readFixture('sample-openrouter-response.json'));
    expect(Object.keys(row).sort()).toEqual([...SHEET_COLUMNS].sort());
  });

  it('strips a ```json code fence around the content', () => {
    const content = '```json\n{"candidate_name": "Fenced Frida", "email": "frida@example.com"}\n```';
    const row = parseLlmResponse(completion(content));

    expect(row['Candidate Name']).toBe('Fenced Frida');
    expect(row.Email).toBe('frida@example.com');
  });

  it('strips a bare ``` fence too', () => {
    const row = parseLlmResponse(completion('```\n{"candidate_name": "Bare Bruno"}\n```'));
    expect(row['Candidate Name']).toBe('Bare Bruno');
  });

  it('falls back to N/A for missing keys', () => {
    const row = parseLlmResponse(completion('{"candidate_name": "Sparse Sam"}'));

    expect(row).toEqual({
      'Candidate Name': 'Sparse Sam',
      Email: 'N/A',
      Phone: 'N/A',
      'Current Title': 'N/A',
      'Years Exp': 'N/A',
      'Top Skills': 'N/A',
      'Executive Summary': 'N/A',
    });
  });

  it('treats empty strings and nulls as missing', () => {
    const row = parseLlmResponse(completion('{"candidate_name": "   ", "email": null}'));

    expect(row['Candidate Name']).toBe('N/A');
    expect(row.Email).toBe('N/A');
  });

  it('coerces a numeric string for years of experience', () => {
    expect(parseLlmResponse(completion('{"years_of_experience": "6"}'))['Years Exp']).toBe(6);
    expect(parseLlmResponse(completion('{"years_of_experience": " 12 "}'))['Years Exp']).toBe(12);
    expect(parseLlmResponse(completion('{"years_of_experience": 0}'))['Years Exp']).toBe(0);
  });

  it('falls back to N/A for non-numeric years of experience', () => {
    expect(parseLlmResponse(completion('{"years_of_experience": "six"}'))['Years Exp']).toBe('N/A');
    expect(parseLlmResponse(completion('{"years_of_experience": ""}'))['Years Exp']).toBe('N/A');
    expect(parseLlmResponse(completion('{"years_of_experience": null}'))['Years Exp']).toBe('N/A');
  });

  it('joins an array of skills into a comma-separated string', () => {
    const row = parseLlmResponse(completion('{"top_skills": ["Node.js", "React", "", "PostgreSQL"]}'));
    expect(row['Top Skills']).toBe('Node.js, React, PostgreSQL');
  });

  it('reports a PARSE_ERROR when the content is not JSON', () => {
    const row = parseLlmResponse(completion('I am sorry, I could not read that resume.'));

    expect(row['Executive Summary']).toBe(
      'PARSE_ERROR: I am sorry, I could not read that resume.',
    );
    expect(row['Candidate Name']).toBe('N/A');
  });

  it('reports a PARSE_ERROR when the content is valid JSON but not an object', () => {
    expect(parseLlmResponse(completion('[1, 2, 3]'))['Executive Summary']).toMatch(/^PARSE_ERROR: /);
    expect(parseLlmResponse(completion('"just a string"'))['Executive Summary']).toMatch(
      /^PARSE_ERROR: /,
    );
  });

  it('truncates the PARSE_ERROR preview to 200 characters', () => {
    const summary = parseLlmResponse(completion('x'.repeat(500)))['Executive Summary'];

    expect(typeof summary).toBe('string');
    expect(String(summary)).toBe('PARSE_ERROR: ' + 'x'.repeat(200));
  });

  it('turns the bad sample response into a visible PARSE_ERROR row', () => {
    const row = parseLlmResponse(readFixture('sample-openrouter-response-bad.json'));

    expect(String(row['Executive Summary'])).toMatch(/^PARSE_ERROR: /);
    expect(String(row['Executive Summary'])).toContain('does not appear to contain a resume');
    expect(row['Candidate Name']).toBe('N/A');
    expect(Object.keys(row).sort()).toEqual([...SHEET_COLUMNS].sort());
  });

  it('surfaces an OpenRouter error body instead of throwing', () => {
    // With onError: continueRegularOutput on the HTTP node, a failed call
    // arrives here as the API's error payload rather than an exception.
    const row = parseLlmResponse({
      error: { message: 'Insufficient credits to run this request', code: 402 },
    });

    expect(row['Executive Summary']).toBe(
      'PARSE_ERROR: Insufficient credits to run this request',
    );
    expect(row.Email).toBe('N/A');
  });

  it('surfaces an n8n-style error item body', () => {
    const row = parseLlmResponse({ error: 'connect ETIMEDOUT 104.18.0.1:443' });

    expect(row['Executive Summary']).toBe('PARSE_ERROR: connect ETIMEDOUT 104.18.0.1:443');
  });

  it('never throws on an empty or undefined response', () => {
    for (const input of [undefined, null, {}, { choices: [] }, 'nonsense', 42]) {
      const row = parseLlmResponse(input);
      expect(Object.keys(row).sort()).toEqual([...SHEET_COLUMNS].sort());
      expect(String(row['Executive Summary'])).toMatch(/^PARSE_ERROR: /);
    }
  });
});
