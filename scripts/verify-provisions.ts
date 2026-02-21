#!/usr/bin/env tsx
/**
 * Verify that selected ingested provisions match LeyChile source text
 * character-by-character.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface Check {
  documentId: string;
  lawNumber: number;
  section: string;
  seedFile: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHECKS: Check[] = [
  {
    documentId: 'cl-ley-19628-datos-personales',
    lawNumber: 19628,
    section: '2',
    seedFile: path.resolve(__dirname, '../data/seed/01-personal-data-19628.json'),
  },
  {
    documentId: 'cl-ley-21459-delitos-informaticos',
    lawNumber: 21459,
    section: '1',
    seedFile: path.resolve(__dirname, '../data/seed/02-information-security-21459.json'),
  },
  {
    documentId: 'cl-ley-18168-telecomunicaciones',
    lawNumber: 18168,
    section: '1',
    seedFile: path.resolve(__dirname, '../data/seed/03-telecommunications-18168.json'),
  },
];

function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function htmlToPlainText(html: string): string {
  return decodeHtml(
    html
      .replace(/<span[^>]*class="[^"]*\bn\b[^"]*"[^>]*>.*?<\/span>/gis, '')
      .replace(/<div[^>]*class="[^"]*\bn\b[^"]*"[^>]*>.*?<\/div>/gis, '')
      .replace(/<div[^>]*class="[^"]*\brnp\b[^"]*"[^>]*>.*?<\/div>/gis, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(div|p|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, ''),
  )
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function findOfficialArticleText(nodes: unknown, targetSection: string): string | null {
  if (!Array.isArray(nodes)) return null;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;

    const current = node as { t?: string; h?: unknown };
    const text = typeof current.t === 'string' ? htmlToPlainText(current.t) : '';
    const firstLine = text.split('\n')[0] ?? '';
    const match = firstLine.match(/^Artículo\s+([^\s.:-]+)/i);

    if (match) {
      const section = match[1].replace(/[º°]/g, '').toLowerCase();
      if (section === targetSection.toLowerCase()) {
        return text;
      }
    }

    const nested = findOfficialArticleText(current.h, targetSection);
    if (nested) return nested;
  }

  return null;
}

function loadSeedProvision(seedFile: string, section: string): string | null {
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as {
    provisions?: Array<{ section: string; content: string }>;
  };

  return seed.provisions?.find(p => p.section.toLowerCase() === section.toLowerCase())?.content ?? null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOfficialLawJson(lawNumber: number): Promise<{ html?: unknown }> {
  const url = `https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=&idVersion=&idLey=${lawNumber}&tipoVersion=2&cve=&agrupa_partes=1&r=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Chilean-Law-MCP/1.0 verification',
      'Accept': 'application/json,text/plain,*/*',
    },
  });

  if (response.status !== 200) {
    throw new Error(`Ley ${lawNumber}: HTTP ${response.status}`);
  }

  return (await response.json()) as { html?: unknown };
}

async function main(): Promise<void> {
  console.log('Provision verification against LeyChile source');
  console.log('============================================\n');

  let failed = 0;

  for (const check of CHECKS) {
    const localText = loadSeedProvision(check.seedFile, check.section);
    if (!localText) {
      console.log(`  FAIL ${check.documentId} sec ${check.section}: missing local seed provision`);
      failed++;
      continue;
    }

    const source = await fetchOfficialLawJson(check.lawNumber);
    const officialText = findOfficialArticleText(source.html, check.section);
    if (!officialText) {
      console.log(`  FAIL ${check.documentId} sec ${check.section}: missing official provision`);
      failed++;
      continue;
    }

    if (localText !== officialText) {
      console.log(
        `  FAIL ${check.documentId} sec ${check.section}: mismatch (local ${localText.length}, official ${officialText.length})`,
      );
      failed++;
      continue;
    }

    console.log(
      `  OK   ${check.documentId} sec ${check.section}: exact match (${localText.length} chars)`,
    );

    await sleep(1200);
  }

  if (failed > 0) {
    throw new Error(`Verification failed for ${failed} provision(s)`);
  }

  console.log('\nAll selected provisions match official source text exactly.');
}

main().catch(error => {
  console.error(`\nVerification error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
