#!/usr/bin/env tsx
/**
 * Generic paid-tier database builder for any Law MCP server.
 *
 * ADDITIVE -- does NOT rebuild from scratch.
 *
 * Usage: npx tsx build-db-paid-generic.ts --db /path/to/database.db --jurisdiction XX
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

function parseArgs(): { dbPath: string; jurisdiction: string } {
  const args = process.argv.slice(2);
  let dbPath = '';
  let jurisdiction = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db') dbPath = path.resolve(args[++i]);
    if (args[i] === '--jurisdiction') jurisdiction = args[++i].toUpperCase();
  }
  if (!dbPath || !jurisdiction) {
    console.error('Usage: npx tsx build-db-paid-generic.ts --db /path/to/database.db --jurisdiction XX');
    process.exit(1);
  }
  return { dbPath, jurisdiction };
}

const PAID_TABLES = `
CREATE TABLE IF NOT EXISTS case_law (
  id INTEGER PRIMARY KEY,
  court TEXT NOT NULL,
  case_number TEXT NOT NULL,
  decision_date TEXT,
  document_id TEXT UNIQUE,
  title TEXT,
  summary TEXT,
  full_text TEXT,
  legal_field TEXT,
  keywords TEXT,
  norms_cited TEXT,
  ecli TEXT,
  url TEXT,
  court_type TEXT,
  proceeding_type TEXT,
  source TEXT NOT NULL DEFAULT 'official',
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_law_full (
  id INTEGER PRIMARY KEY,
  case_law_id INTEGER NOT NULL REFERENCES case_law(id),
  full_text TEXT NOT NULL,
  headnotes TEXT,
  dissenting_opinions TEXT,
  UNIQUE(case_law_id)
);

CREATE TABLE IF NOT EXISTS preparatory_works (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  bill_number TEXT,
  legislative_period TEXT,
  summary TEXT,
  full_text TEXT,
  date_introduced TEXT,
  date_enacted TEXT,
  status TEXT,
  voting_result TEXT,
  related_statute_id TEXT,
  url TEXT,
  legislature INTEGER,
  committee TEXT,
  proposer TEXT,
  source TEXT NOT NULL DEFAULT 'parliament',
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preparatory_works_full (
  id INTEGER PRIMARY KEY,
  prep_work_id INTEGER NOT NULL REFERENCES preparatory_works(id),
  full_text TEXT NOT NULL,
  section_summaries TEXT,
  UNIQUE(prep_work_id)
);

CREATE TABLE IF NOT EXISTS agency_guidance (
  id INTEGER PRIMARY KEY,
  agency TEXT NOT NULL,
  document_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  document_type TEXT,
  summary TEXT,
  full_text TEXT,
  issued_date TEXT,
  url TEXT,
  related_statute_id TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provision_versions (
  id INTEGER PRIMARY KEY,
  provision_id INTEGER NOT NULL REFERENCES legal_provisions(id),
  version_date TEXT NOT NULL,
  content TEXT NOT NULL,
  change_description TEXT,
  gazette_ref TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);
`;

const PAID_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_case_law_court ON case_law(court);
CREATE INDEX IF NOT EXISTS idx_case_law_decision_date ON case_law(decision_date);
CREATE INDEX IF NOT EXISTS idx_case_law_ecli ON case_law(ecli);
CREATE INDEX IF NOT EXISTS idx_case_law_source ON case_law(source);
CREATE INDEX IF NOT EXISTS idx_case_law_case_number ON case_law(case_number);
CREATE INDEX IF NOT EXISTS idx_case_law_full_case ON case_law_full(case_law_id);
CREATE INDEX IF NOT EXISTS idx_prep_works_type ON preparatory_works(type);
CREATE INDEX IF NOT EXISTS idx_prep_works_date ON preparatory_works(date_introduced);
CREATE INDEX IF NOT EXISTS idx_prep_works_source ON preparatory_works(source);
CREATE INDEX IF NOT EXISTS idx_prep_works_full_prep ON preparatory_works_full(prep_work_id);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_agency ON agency_guidance(agency);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_date ON agency_guidance(issued_date);
`;

const PAID_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS case_law_fts USING fts5(
  summary, full_text, title, content='case_law', content_rowid='id', tokenize='unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS preparatory_works_fts USING fts5(
  title, summary, full_text, content='preparatory_works', content_rowid='id', tokenize='unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS agency_guidance_fts USING fts5(
  title, summary, full_text, content='agency_guidance', content_rowid='id', tokenize='unicode61'
);
`;

const PAID_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS case_law_fts_insert AFTER INSERT ON case_law BEGIN
  INSERT INTO case_law_fts(rowid, summary, full_text, title) VALUES (new.id, new.summary, new.full_text, new.title);
END;
CREATE TRIGGER IF NOT EXISTS case_law_fts_delete AFTER DELETE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, full_text, title) VALUES ('delete', old.id, old.summary, old.full_text, old.title);
END;
CREATE TRIGGER IF NOT EXISTS case_law_fts_update AFTER UPDATE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, full_text, title) VALUES ('delete', old.id, old.summary, old.full_text, old.title);
  INSERT INTO case_law_fts(rowid, summary, full_text, title) VALUES (new.id, new.summary, new.full_text, new.title);
END;
CREATE TRIGGER IF NOT EXISTS prep_works_fts_insert AFTER INSERT ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(rowid, title, summary, full_text) VALUES (new.id, new.title, new.summary, new.full_text);
END;
CREATE TRIGGER IF NOT EXISTS prep_works_fts_delete AFTER DELETE ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(preparatory_works_fts, rowid, title, summary, full_text) VALUES ('delete', old.id, old.title, old.summary, old.full_text);
END;
CREATE TRIGGER IF NOT EXISTS prep_works_fts_update AFTER UPDATE ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(preparatory_works_fts, rowid, title, summary, full_text) VALUES ('delete', old.id, old.title, old.summary, old.full_text);
  INSERT INTO preparatory_works_fts(rowid, title, summary, full_text) VALUES (new.id, new.title, new.summary, new.full_text);
END;
CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_insert AFTER INSERT ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text) VALUES (new.id, new.title, new.summary, new.full_text);
END;
CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_delete AFTER DELETE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text) VALUES ('delete', old.id, old.title, old.summary, old.full_text);
END;
CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_update AFTER UPDATE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text) VALUES ('delete', old.id, old.title, old.summary, old.full_text);
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text) VALUES (new.id, new.title, new.summary, new.full_text);
END;
`;

function buildPaidTier(): void {
  const { dbPath, jurisdiction } = parseArgs();
  console.log(`Building paid-tier extensions for ${jurisdiction} Law MCP...`);

  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: No base database found at ' + dbPath);
    process.exit(1);
  }

  const sizeBefore = fs.statSync(dbPath).size;
  console.log('  Base database: ' + dbPath + ' (' + (sizeBefore / 1024 / 1024).toFixed(1) + ' MB)');

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const hasLegalDocs = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legal_documents'").get();
  if (!hasLegalDocs) { console.error('ERROR: Missing legal_documents table.'); db.close(); process.exit(1); }

  db.exec("CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);");

  console.log('  Creating paid-tier tables...');
  db.exec(PAID_TABLES);
  console.log('  Creating indexes...');
  db.exec(PAID_INDEXES);
  console.log('  Creating FTS5 virtual tables...');
  db.exec(PAID_FTS);
  console.log('  Creating FTS sync triggers...');
  db.exec(PAID_TRIGGERS);

  const docCount = (db.prepare('SELECT COUNT(*) as c FROM legal_documents').get() as { c: number }).c;
  const provCount = (db.prepare('SELECT COUNT(*) as c FROM legal_provisions').get() as { c: number }).c;
  console.log('\n  Base data: ' + docCount.toLocaleString() + ' documents, ' + provCount.toLocaleString() + ' provisions');

  const upsertMeta = db.prepare("INSERT INTO db_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const updateMeta = db.transaction(() => {
    upsertMeta.run('tier', 'premium');
    upsertMeta.run('schema_version', '2');
    upsertMeta.run('built_at', new Date().toISOString());
    upsertMeta.run('builder', 'build-db-paid-generic.ts');
    upsertMeta.run('jurisdiction', jurisdiction);
    upsertMeta.run('paid_tables', 'case_law,case_law_full,preparatory_works,preparatory_works_full,agency_guidance');
  });
  updateMeta();

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('ANALYZE');
  db.exec('VACUUM');
  db.close();

  const sizeAfter = fs.statSync(dbPath).size;
  console.log('\nPaid-tier build complete.');
  console.log('  Size: ' + (sizeBefore / 1024 / 1024).toFixed(1) + ' MB -> ' + (sizeAfter / 1024 / 1024).toFixed(1) + ' MB');
  console.log('  Tier: premium');
  console.log('  Jurisdiction: ' + jurisdiction);
  console.log('  Output: ' + dbPath);
}

buildPaidTier();
