#!/usr/bin/env tsx
/**
 * Chilean Law MCP -- Real-data ingestion from LeyChile.
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --limit 3
 *   npm run ingest -- --skip-fetch
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLawByNumber } from './lib/fetcher.js';
import { KEY_CHILEAN_ACTS, parseLeyChileResponse, type ActIndexEntry, type LeyChileResponse, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

function parseArgs(): { limit: number | null; skipFetch: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function readSourceFile(sourceFile: string): LeyChileResponse {
  const raw = fs.readFileSync(sourceFile, 'utf-8');
  return JSON.parse(raw) as LeyChileResponse;
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Chilean laws from LeyChile...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let cached = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;

  const results: { law: string; provisions: number; definitions: number; status: string }[] = [];

  for (const act of acts) {
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.json`);
    const seedFile = path.join(SEED_DIR, act.seedFile);

    try {
      let source: LeyChileResponse;

      if (skipFetch && fs.existsSync(sourceFile)) {
        source = readSourceFile(sourceFile);
        cached++;
        console.log(`  Using cached source for Ley ${act.lawNumber}`);
      } else {
        process.stdout.write(`  Fetching Ley ${act.lawNumber}...`);
        const fetched = await fetchLawByNumber(act.lawNumber);

        if (fetched.status !== 200) {
          console.log(` HTTP ${fetched.status}`);
          failed++;
          processed++;
          results.push({ law: `Ley ${act.lawNumber}`, provisions: 0, definitions: 0, status: `HTTP ${fetched.status}` });
          continue;
        }

        if (!fetched.json) {
          console.log(' INVALID_JSON');
          failed++;
          processed++;
          results.push({ law: `Ley ${act.lawNumber}`, provisions: 0, definitions: 0, status: 'INVALID_JSON' });
          continue;
        }

        source = fetched.json;
        fs.writeFileSync(sourceFile, JSON.stringify(source, null, 2));
        const title = source.metadatos?.titulo_norma?.slice(0, 60) ?? '';
        console.log(` OK (${title})`);
      }

      const parsed = parseLeyChileResponse(source, act);

      if (!parsed.provisions.length) {
        failed++;
        processed++;
        results.push({ law: `Ley ${act.lawNumber}`, provisions: 0, definitions: 0, status: 'NO_PROVISIONS' });
        console.log('    -> no provisions extracted');
        continue;
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));

      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      results.push({
        law: `Ley ${act.lawNumber}`,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });

      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      failed++;
      results.push({ law: `Ley ${act.lawNumber}`, provisions: 0, definitions: 0, status: `ERROR: ${msg.slice(0, 80)}` });
      console.log(`  ERROR Ley ${act.lawNumber}: ${msg}`);
    }

    processed++;
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(72));
  console.log('\n  Source:       LeyChile (Biblioteca del Congreso Nacional de Chile)');
  console.log('  Endpoint:     nuevo.leychile.cl/servicios/Navegar/get_norma_json');
  console.log('  Retrieval:    JSON service via idLey + tipoVersion=2 (latest)');
  console.log(`  Processed:    ${processed}`);
  console.log(`  Cached:       ${cached}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Provisions:   ${totalProvisions}`);
  console.log(`  Definitions:  ${totalDefinitions}`);
  console.log('\n  Per-law breakdown:');
  console.log(`  ${'Law'.padEnd(18)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(14)}`);
  console.log(`  ${'-'.repeat(18)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(14)}`);
  for (const r of results) {
    console.log(`  ${r.law.padEnd(18)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(14)}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Chilean Law MCP -- Real Data Ingestion');
  console.log('=======================================\n');
  console.log('  Source: LeyChile (Biblioteca del Congreso Nacional de Chile)');
  console.log('  Endpoint: https://nuevo.leychile.cl/servicios/Navegar/get_norma_json');
  console.log('  Rate limit: 1.2s/request');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log('  --skip-fetch');

  const acts = limit ? KEY_CHILEAN_ACTS.slice(0, limit) : KEY_CHILEAN_ACTS;
  await fetchAndParseActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
