#!/usr/bin/env tsx
/**
 * Resumable full-text ingestion for all laws in cl-all-laws-index.json.
 *
 * Fetches official LeyChile JSON by idNorma, parses article content, and writes
 * per-law seed files under data/seed-indexed/.
 *
 * Usage:
 *   npm run ingest:all-laws-fulltext
 *   npm run ingest:all-laws-fulltext -- --limit 50
 *   npm run ingest:all-laws-fulltext -- --force
 *   npm run ingest:all-laws-fulltext -- --from-start
 *   npm run ingest:all-laws-fulltext -- --save-source
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { fetchLawByNormaId } from './lib/fetcher.js';
import { parseLeyChileResponse, type ActIndexEntry, type LeyChileResponse } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_FILE = path.resolve(__dirname, '../data/source/cl-all-laws-index.json');
const STATE_FILE = path.resolve(__dirname, '../data/source/fulltext-ingest-state.json');
const SEED_DIR = path.resolve(__dirname, '../data/seed-indexed');
const SOURCE_DIR = path.resolve(__dirname, '../data/source/indexed');

interface IndexRecord {
  id_norma: string;
  norma?: string;
  title?: string;
}

interface IndexFile {
  generated_at?: string;
  records?: IndexRecord[];
}

interface IngestState {
  started_at: string;
  updated_at: string;
  source_index_generated_at?: string;
  total_records: number;
  next_index: number;
  attempted: number;
  succeeded: number;
  failed: number;
  no_provisions: number;
  skipped_existing: number;
  total_provisions_written: number;
  last_errors: string[];
}

interface Args {
  limit: number | null;
  force: boolean;
  fromStart: boolean;
  saveSource: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let force = false;
  let fromStart = false;
  let saveSource = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--from-start') {
      fromStart = true;
    } else if (args[i] === '--save-source') {
      saveSource = true;
    }
  }

  return {
    limit: limit && Number.isFinite(limit) && limit > 0 ? limit : null,
    force,
    fromStart,
    saveSource,
  };
}

function loadIndex(): IndexFile {
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(`Missing index file: ${INDEX_FILE}. Run npm run fetch:all-laws-index first.`);
  }

  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  return JSON.parse(raw) as IndexFile;
}

function defaultState(totalRecords: number, sourceGeneratedAt: string | undefined): IngestState {
  const now = new Date().toISOString();
  return {
    started_at: now,
    updated_at: now,
    source_index_generated_at: sourceGeneratedAt,
    total_records: totalRecords,
    next_index: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    no_provisions: 0,
    skipped_existing: 0,
    total_provisions_written: 0,
    last_errors: [],
  };
}

function loadOrInitState(totalRecords: number, sourceGeneratedAt: string | undefined, fromStart: boolean): IngestState {
  if (fromStart || !fs.existsSync(STATE_FILE)) {
    return defaultState(totalRecords, sourceGeneratedAt);
  }

  const raw = fs.readFileSync(STATE_FILE, 'utf8');
  const parsed = JSON.parse(raw) as Partial<IngestState>;

  const now = new Date().toISOString();
  return {
    started_at: parsed.started_at ?? now,
    updated_at: now,
    source_index_generated_at: parsed.source_index_generated_at ?? sourceGeneratedAt,
    total_records: totalRecords,
    next_index: Math.max(0, Math.min(parsed.next_index ?? 0, totalRecords)),
    attempted: parsed.attempted ?? 0,
    succeeded: parsed.succeeded ?? 0,
    failed: parsed.failed ?? 0,
    no_provisions: parsed.no_provisions ?? 0,
    skipped_existing: parsed.skipped_existing ?? 0,
    total_provisions_written: parsed.total_provisions_written ?? 0,
    last_errors: Array.isArray(parsed.last_errors) ? parsed.last_errors.slice(0, 20) : [],
  };
}

function saveState(state: IngestState): void {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function inferLawNumber(rec: IndexRecord): number {
  const fromNorma = (rec.norma ?? '').match(/\b(?:Ley|Lei)\s*([0-9][0-9\.]*)/i)?.[1];
  if (fromNorma) {
    const n = Number.parseInt(fromNorma.replace(/\./g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const fromIdNorma = Number.parseInt(rec.id_norma, 10);
  return Number.isFinite(fromIdNorma) && fromIdNorma > 0 ? fromIdNorma : 0;
}

function toActEntry(rec: IndexRecord): ActIndexEntry {
  const idNorma = rec.id_norma.trim();
  const docId = `cl-leychile-norma-${idNorma}`;

  return {
    id: docId,
    lawNumber: inferLawNumber(rec),
    seedFile: `${docId}.json`,
    shortName: rec.norma?.trim() || `Norma ${idNorma}`,
    titleEn: undefined,
  };
}

function seedPathForIdNorma(idNorma: string): string {
  return path.join(SEED_DIR, `cl-leychile-norma-${idNorma}.json`);
}

function sourcePathForIdNorma(idNorma: string): string {
  return path.join(SOURCE_DIR, `cl-leychile-norma-${idNorma}.json`);
}

function pushError(state: IngestState, msg: string): void {
  state.last_errors.unshift(`${new Date().toISOString()} ${msg}`);
  if (state.last_errors.length > 20) state.last_errors = state.last_errors.slice(0, 20);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const index = loadIndex();
  const records = (index.records ?? []).filter(r => typeof r.id_norma === 'string' && r.id_norma.trim().length > 0);

  if (records.length === 0) {
    throw new Error('Index has no records.');
  }

  fs.mkdirSync(SEED_DIR, { recursive: true });
  if (args.saveSource) fs.mkdirSync(SOURCE_DIR, { recursive: true });

  const state = loadOrInitState(records.length, index.generated_at, args.fromStart);
  const startIndex = state.next_index;

  const remaining = records.length - startIndex;
  const maxThisRun = args.limit ? Math.min(args.limit, remaining) : remaining;

  console.log('All-laws full-text ingestion');
  console.log('============================\n');
  console.log(`  Index file: ${INDEX_FILE}`);
  console.log(`  Seed dir:   ${SEED_DIR}`);
  console.log(`  State file: ${STATE_FILE}`);
  console.log(`  Total index records: ${records.length}`);
  console.log(`  Resume index:        ${startIndex}`);
  console.log(`  Planned this run:    ${maxThisRun}`);
  if (args.force) console.log('  Mode: force re-fetch existing seeds');
  if (args.saveSource) console.log(`  Source cache dir:    ${SOURCE_DIR}`);

  if (maxThisRun <= 0) {
    console.log('\nNothing to do. Full index already processed.');
    saveState(state);
    return;
  }

  let runProcessed = 0;

  for (let i = startIndex; i < records.length && runProcessed < maxThisRun; i++) {
    const rec = records[i];
    const idNorma = rec.id_norma.trim();
    const seedFile = seedPathForIdNorma(idNorma);

    process.stdout.write(`\n[${i + 1}/${records.length}] idNorma=${idNorma}`);

    if (!args.force && fs.existsSync(seedFile)) {
      process.stdout.write(' SKIP(existing seed)');
      state.skipped_existing++;
      state.attempted++;
      state.next_index = i + 1;
      runProcessed++;
      if (runProcessed % 25 === 0) {
        saveState(state);
      }
      continue;
    }

    try {
      const fetched = await fetchLawByNormaId(idNorma);
      if (fetched.status !== 200) {
        state.failed++;
        state.attempted++;
        pushError(state, `idNorma ${idNorma}: HTTP ${fetched.status}`);
        process.stdout.write(` FAIL(HTTP ${fetched.status})`);
        state.next_index = i + 1;
        runProcessed++;
        if (runProcessed % 10 === 0) saveState(state);
        continue;
      }

      if (!fetched.json) {
        state.failed++;
        state.attempted++;
        pushError(state, `idNorma ${idNorma}: invalid JSON`);
        process.stdout.write(' FAIL(invalid JSON)');
        state.next_index = i + 1;
        runProcessed++;
        if (runProcessed % 10 === 0) saveState(state);
        continue;
      }

      const act = toActEntry(rec);
      const parsed = parseLeyChileResponse(fetched.json as LeyChileResponse, act);

      if (!parsed.provisions || parsed.provisions.length === 0) {
        state.no_provisions++;
        state.attempted++;
        process.stdout.write(' OK(no provisions extracted)');
        state.next_index = i + 1;
        runProcessed++;
        if (args.saveSource) {
          fs.writeFileSync(sourcePathForIdNorma(idNorma), JSON.stringify(fetched.json, null, 2));
        }
        if (runProcessed % 10 === 0) saveState(state);
        continue;
      }

      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      if (args.saveSource) {
        fs.writeFileSync(sourcePathForIdNorma(idNorma), JSON.stringify(fetched.json, null, 2));
      }

      state.succeeded++;
      state.attempted++;
      state.total_provisions_written += parsed.provisions.length;
      process.stdout.write(` OK(${parsed.provisions.length} provisions)`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      state.failed++;
      state.attempted++;
      pushError(state, `idNorma ${idNorma}: ${msg}`);
      process.stdout.write(` FAIL(${msg.slice(0, 100)})`);
    }

    state.next_index = i + 1;
    runProcessed++;

    if (runProcessed % 10 === 0) {
      saveState(state);
    }
  }

  saveState(state);

  const done = state.next_index >= records.length;

  console.log('\n\nSummary');
  console.log('-------');
  console.log(`  Processed this run: ${runProcessed}`);
  console.log(`  Next index:         ${state.next_index}/${records.length}`);
  console.log(`  Succeeded total:    ${state.succeeded}`);
  console.log(`  No provisions:      ${state.no_provisions}`);
  console.log(`  Failed total:       ${state.failed}`);
  console.log(`  Skipped existing:   ${state.skipped_existing}`);
  console.log(`  Total provisions:   ${state.total_provisions_written}`);
  console.log(`  Complete:           ${done ? 'yes' : 'no'}`);

  if (state.last_errors.length > 0) {
    console.log('\nRecent errors:');
    for (const err of state.last_errors.slice(0, 5)) {
      console.log(`  - ${err}`);
    }
  }
}

main().catch(error => {
  console.error(`\nFatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
