import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildCodeNodeJs, extractMarkedBlock, stripTypeAnnotations } from './code-node.js';

/** Runs the generated Code node body the way n8n would, with a fake `$input`. */
function runAsCodeNode(json: unknown): unknown {
  const body = buildCodeNodeJs();
  const run = new Function('$input', body) as ($input: unknown) => unknown;
  return run({ item: { json } });
}

describe('buildCodeNodeJs', () => {
  it('produces plain JavaScript with no leftover type annotations', () => {
    const body = buildCodeNodeJs();

    expect(body).not.toMatch(/:\s*unknown/);
    expect(body).not.toMatch(/:\s*CandidateRow/);
    expect(body).not.toMatch(/\bexport\b/);
    expect(body).not.toMatch(/\bimport\b/);
    expect(body).toContain('function parseLlmResponse(response) {');
  });

  it('ends with the n8n return trailer', () => {
    expect(buildCodeNodeJs()).toMatch(
      /\nreturn \{ json: parseLlmResponse\(\$input\.item\.json\) \};\n$/,
    );
  });

  it('is deterministic', () => {
    expect(buildCodeNodeJs()).toBe(buildCodeNodeJs());
  });

  it('behaves like parseLlmResponse when executed', () => {
    const response = JSON.parse(
      readFileSync(new URL('../fixtures/sample-openrouter-response.json', import.meta.url), 'utf8'),
    );

    expect(runAsCodeNode(response)).toEqual({
      json: {
        'Candidate Name': 'Jane Doe',
        Email: 'jane.doe@example.com',
        Phone: '+1 555 0100',
        'Current Title': 'Senior Fullstack Engineer',
        'Years Exp': 6,
        'Top Skills': 'Node.js, React, PostgreSQL, TypeScript, AWS',
        'Executive Summary':
          'Proven fullstack engineer with six years of experience scaling Node.js microservices and React front ends. Led a payments platform migration that cut checkout latency by 40 percent.',
      },
    });
  });
});

describe('extractMarkedBlock', () => {
  it('returns only what is between the markers', () => {
    const source = ['before', '// @n8n-code-start', 'const a = 1;', '// @n8n-code-end', 'after'].join(
      '\n',
    );

    expect(extractMarkedBlock(source).trim()).toBe('const a = 1;');
  });

  it('throws when a marker is missing', () => {
    expect(() => extractMarkedBlock('no markers here')).toThrow(/Missing/);
  });
});

describe('stripTypeAnnotations', () => {
  it('strips parameter and return type annotations from function declarations', () => {
    expect(stripTypeAnnotations('function f(a: string, b: number): string | number {')).toBe(
      'function f(a, b) {',
    );
  });

  it('leaves annotation-free JavaScript alone', () => {
    const js = "const row = { 'Years Exp': 6 };\nfunction g() {\n  return row;\n}";
    expect(stripTypeAnnotations(js)).toBe(js);
  });

  it('throws on TypeScript syntax it cannot strip', () => {
    expect(() => stripTypeAnnotations('let value: unknown = 1;')).toThrow(/TypeScript-only syntax/);
    expect(() => stripTypeAnnotations('const x = y as const;')).toThrow(/TypeScript-only syntax/);
    expect(() => stripTypeAnnotations('interface Foo { a: string }')).toThrow(
      /TypeScript-only syntax/,
    );
  });
});
