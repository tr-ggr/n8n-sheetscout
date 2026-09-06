/**
 * Generates `fixtures/sample-resume.pdf` - the one-page test resume you upload
 * to the n8n form to exercise the workflow end to end.
 *
 * Run with `pnpm fixture`. The output is committed, so the generator pins the
 * PDF metadata dates; without that pdf-lib stamps "now" and every run would
 * produce a different file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUTPUT_PATH = fileURLToPath(new URL('../fixtures/sample-resume.pdf', import.meta.url));

/** Fixed timestamp so regenerating the fixture does not churn the diff. */
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

type LineStyle = 'heading' | 'subheading' | 'section' | 'body';

interface Line {
  readonly text: string;
  readonly style: LineStyle;
}

const LINES: readonly Line[] = [
  { text: 'Jane Doe', style: 'heading' },
  { text: 'Senior Fullstack Engineer', style: 'subheading' },
  { text: 'jane.doe@example.com | +1 555 0100 | Berlin, Germany', style: 'body' },
  { text: '', style: 'body' },
  { text: 'SUMMARY', style: 'section' },
  {
    text: 'Fullstack engineer with 6 years of experience building and scaling Node.js',
    style: 'body',
  },
  {
    text: 'services and React front ends for high-traffic e-commerce products.',
    style: 'body',
  },
  { text: '', style: 'body' },
  { text: 'SKILLS', style: 'section' },
  {
    text: 'Node.js, React, TypeScript, PostgreSQL, AWS, Docker, GraphQL, Kubernetes',
    style: 'body',
  },
  { text: '', style: 'body' },
  { text: 'EXPERIENCE', style: 'section' },
  { text: 'Senior Fullstack Engineer, Kaufhaus GmbH (2022 - present)', style: 'subheading' },
  {
    text: '- Led the migration of a monolithic checkout to 12 Node.js microservices,',
    style: 'body',
  },
  { text: '  cutting p95 checkout latency by 40% for 2.1M monthly orders.', style: 'body' },
  {
    text: '- Introduced a typed React design system used by 4 product teams, halving',
    style: 'body',
  },
  { text: '  the time to ship a new storefront page.', style: 'body' },
  { text: '', style: 'body' },
  { text: 'Fullstack Engineer, Nordlicht AG (2019 - 2022)', style: 'subheading' },
  {
    text: '- Built the PostgreSQL-backed inventory API serving 400 requests/second.',
    style: 'body',
  },
  { text: '', style: 'body' },
  { text: 'EDUCATION', style: 'section' },
  { text: 'BSc Computer Science, TU Berlin (2019)', style: 'body' },
];

/** Font size and line height for each style of line. */
const STYLE_METRICS: Record<LineStyle, { size: number; leading: number; bold: boolean }> = {
  heading: { size: 22, leading: 30, bold: true },
  subheading: { size: 12, leading: 18, bold: true },
  section: { size: 11, leading: 22, bold: true },
  body: { size: 10.5, leading: 15, bold: false },
};

async function main(): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Jane Doe - Resume');
  pdfDoc.setAuthor('Jane Doe');
  pdfDoc.setSubject('Sample resume fixture for n8n-sheetscout');
  pdfDoc.setProducer('n8n-sheetscout make-fixture');
  pdfDoc.setCreator('n8n-sheetscout make-fixture');
  pdfDoc.setCreationDate(FIXED_DATE);
  pdfDoc.setModificationDate(FIXED_DATE);

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ink = rgb(0.1, 0.1, 0.1);

  let cursorY = PAGE_HEIGHT - MARGIN;
  for (const line of LINES) {
    const metrics = STYLE_METRICS[line.style];
    if (line.text !== '') {
      page.drawText(line.text, {
        x: MARGIN,
        y: cursorY,
        size: metrics.size,
        font: metrics.bold ? bold : regular,
        color: ink,
      });
    }
    cursorY -= metrics.leading;
  }

  const bytes = await pdfDoc.save({ updateFieldAppearances: false });
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, bytes);
  console.log(`Wrote ${OUTPUT_PATH} (${bytes.length} bytes)`);
}

await main();
