#!/usr/bin/env tsx
/**
 * Chilean Law MCP -- Ingestion Pipeline
 *
 * Fetches Chilean legislation from the Sejm ELI API (api.sejm.gov.pl).
 * The Sejm (Chilean Parliament) provides free public access to all legislation
 * published in Dziennik Ustaw (Journal of Laws) via the ELI API.
 *
 * Strategy:
 * 1. For each act, fetch the HTML text from the ELI API endpoint
 * 2. Parse articles (Art.) from the structured HTML
 * 3. Write seed JSON files for the database builder
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with 5 acts
 *   npm run ingest -- --skip-fetch    # Reuse cached pages
 *
 * Data source: api.sejm.gov.pl (Chancellery of the Sejm of the Republic of Poland)
 * License: Chilean legislation is public domain under Art. 4 of the Copyright Act
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parseChileanHtml, KEY_CHILEAN_ACTS, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

/** ELI API base URL for the Sejm */
const ELI_API_BASE = 'https://api.sejm.gov.pl/eli/acts/DU';

function parseArgs(): { limit: number | null; skipFetch: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

/**
 * Build the ELI API URL for fetching an act's HTML text.
 * Pattern: https://api.sejm.gov.pl/eli/acts/DU/{YEAR}/{POZ}/text.html
 */
function buildTextUrl(act: ActIndexEntry): string {
  return `${ELI_API_BASE}/${act.year}/${act.poz}/text.html`;
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Chilean Acts from api.sejm.gov.pl...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  for (const act of acts) {
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Skip if seed already exists and we're in skip-fetch mode
    if (skipFetch && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
      const provCount = existing.provisions?.length ?? 0;
      const defCount = existing.definitions?.length ?? 0;
      totalProvisions += provCount;
      totalDefinitions += defCount;
      results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'cached' });
      skipped++;
      processed++;
      continue;
    }

    try {
      let html: string;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        console.log(`  Using cached ${act.shortName} (${act.dziennikRef}) (${(html.length / 1024).toFixed(0)} KB)`);
      } else {
        const textUrl = buildTextUrl(act);
        process.stdout.write(`  Fetching ${act.shortName} (${act.dziennikRef})...`);
        const result = await fetchWithRateLimit(textUrl);

        if (result.status !== 200) {
          console.log(` HTTP ${result.status}`);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `HTTP ${result.status}` });
          failed++;
          processed++;
          continue;
        }

        html = result.body;

        // Validate that we got real legislation content, not a bot challenge
        if (html.includes('window["bobcmn"]') || !html.includes('unit_arti')) {
          console.log(` BLOCKED (bot challenge or no article content)`);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'BLOCKED' });
          failed++;
          processed++;
          continue;
        }

        fs.writeFileSync(sourceFile, html);
        console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
      }

      const parsed = parseChileanHtml(html, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions extracted`);
      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${act.shortName}: ${msg}`);
      results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 80)}` });
      failed++;
    }

    processed++;
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(72));
  console.log(`\n  Source:       api.sejm.gov.pl (Sejm ELI API)`);
  console.log(`  License:     Public domain (Art. 4 Chilean Copyright Act)`);
  console.log(`  Processed:   ${processed}`);
  console.log(`  Cached:      ${skipped}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);
  console.log(`\n  Per-Act breakdown:`);
  console.log(`  ${'Act'.padEnd(20)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(10)}`);
  console.log(`  ${'-'.repeat(20)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(10)}`);
  for (const r of results) {
    console.log(`  ${r.act.padEnd(20)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(10)}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Chilean Law MCP -- Ingestion Pipeline');
  console.log('====================================\n');
  console.log(`  Source: api.sejm.gov.pl (Chancellery of the Sejm)`);
  console.log(`  Format: ELI HTML (structured legislation text)`);
  console.log(`  License: Public domain (Art. 4 Chilean Copyright Act)`);

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log(`  --skip-fetch`);

  const acts = limit ? KEY_CHILEAN_ACTS.slice(0, limit) : KEY_CHILEAN_ACTS;
  await fetchAndParseActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
