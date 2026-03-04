/**
 * Golden contract tests for Chilean Law MCP.
 * Validates core tool functionality against seed data.
 *
 * Skipped in CI when database.db is not available (e.g. npm-only installs).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');
const DB_EXISTS = fs.existsSync(DB_PATH);

const describeIf = DB_EXISTS ? describe : describe.skip;

let db: InstanceType<typeof Database>;

beforeAll(() => {
  if (!DB_EXISTS) return;
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');
});

describeIf('Database integrity', () => {
  it('should include core corpus and indexed national law documents', () => {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM legal_documents WHERE id LIKE 'cl-ley-%') as core_cnt,
        (SELECT COUNT(*) FROM legal_documents WHERE id LIKE 'cl-leychile-norma-%') as indexed_cnt,
        (SELECT COUNT(*) FROM legal_documents) as total_cnt
    `).get() as { core_cnt: number; indexed_cnt: number; total_cnt: number };

    expect(row.core_cnt).toBe(10);
    expect(row.indexed_cnt).toBeGreaterThan(10000);
    expect(row.total_cnt).toBe(row.core_cnt + row.indexed_cnt);
  });

  it('should have at least 150 provisions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(150);
  });

  it('should have FTS index', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'datos'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(0);
  });
});

describeIf('Article retrieval', () => {
  it('should retrieve a provision by document_id and section', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'cl-ley-18168-telecomunicaciones' AND section = '1'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content.length).toBeGreaterThan(50);
  });
});

describeIf('Search', () => {
  it('should find results via FTS search', () => {
    const rows = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'datos'"
    ).get() as { cnt: number };
    expect(rows.cnt).toBeGreaterThan(0);
  });
});

describeIf('Negative tests', () => {
  it('should return no results for fictional document', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-law-2099'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('should return no results for invalid section', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'cl-ley-18168-telecomunicaciones' AND section = '999ZZZ-INVALID'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describeIf('All 10 laws are present', () => {
  const expectedDocs = [
    'cl-ley-18168-telecomunicaciones',
    'cl-ley-19039-propiedad-industrial-secretos',
    'cl-ley-19628-datos-personales',
    'cl-ley-19799-firma-electronica',
    'cl-ley-20285-transparencia',
    'cl-ley-21096-constitucion-datos',
    'cl-ley-21180-transformacion-digital',
    'cl-ley-21459-delitos-informaticos',
    'cl-ley-21521-fintech-open-finance',
    'cl-ley-21663-infraestructura-critica',  ];

  for (const docId of expectedDocs) {
    it(`should contain document: ${docId}`, () => {
      const row = db.prepare(
        'SELECT id FROM legal_documents WHERE id = ?'
      ).get(docId) as { id: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.id).toBe(docId);
    });
  }
});

describeIf('list_sources', () => {
  it('should have db_metadata table', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM db_metadata').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});

describeIf('Census validation', () => {
  it('should have census.json matching database counts', () => {
    const censusPath = path.resolve(__dirname, '../../data/census.json');
    if (!fs.existsSync(censusPath)) return;
    const census = JSON.parse(fs.readFileSync(censusPath, 'utf-8'));
    const dbLaws = db.prepare('SELECT COUNT(*) as cnt FROM legal_documents').get() as { cnt: number };
    const dbProvisions = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(census.total_laws).toBe(dbLaws.cnt);
    expect(census.total_provisions).toBe(dbProvisions.cnt);
    expect(census.jurisdiction).toBe('CL');
  });
});
