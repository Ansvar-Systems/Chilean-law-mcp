import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { detectCapabilities, readDbMetadata, upgradeMessage } from '../../src/capabilities.js';
import { normalizeAsOfDate } from '../../src/utils/as-of-date.js';
import { sanitizeFtsInput, buildFtsQueryVariants } from '../../src/utils/fts-query.js';
import { generateResponseMetadata } from '../../src/utils/metadata.js';
import { resolveDocumentId } from '../../src/utils/statute-id.js';

import { searchLegislation } from '../../src/tools/search-legislation.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getChileanImplementations } from '../../src/tools/get-chilean-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { listSources } from '../../src/tools/list-sources.js';
import { getAbout } from '../../src/tools/about.js';
import { buildTools, registerTools } from '../../src/tools/registry.js';

function createCoreDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE legal_documents (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT,
      title_en TEXT,
      short_name TEXT,
      status TEXT,
      issued_date TEXT,
      in_force_date TEXT,
      url TEXT,
      description TEXT
    );

    CREATE TABLE legal_provisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      provision_ref TEXT NOT NULL,
      chapter TEXT,
      section TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE provisions_fts USING fts5(
      content,
      title,
      content='legal_provisions',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
      INSERT INTO provisions_fts(rowid, content, title) VALUES (new.id, new.content, new.title);
    END;

    CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
      VALUES ('delete', old.id, old.content, old.title);
    END;

    CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
      INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
      VALUES ('delete', old.id, old.content, old.title);
      INSERT INTO provisions_fts(rowid, content, title)
      VALUES (new.id, new.content, new.title);
    END;

    CREATE TABLE definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      term TEXT,
      definition TEXT
    );

    CREATE TABLE db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertDoc = db.prepare(`
    INSERT INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
    VALUES (?, 'statute', ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertDoc.run(
    'doc-data',
    'Ley de Datos',
    'Data Law',
    'LD',
    'amended',
    '2020-01-01',
    '2020-06-01',
    'https://example/doc-data',
    'doc data',
  );

  insertDoc.run(
    'doc-repealed',
    'Ley Derogada',
    'Repealed Law',
    'LR',
    'repealed',
    '2010-01-01',
    '2010-06-01',
    'https://example/doc-repealed',
    'doc repealed',
  );

  insertDoc.run(
    'doc-future',
    'Ley Futura',
    'Future Law',
    'LF',
    'not_yet_in_force',
    '2030-01-01',
    '2030-06-01',
    'https://example/doc-future',
    'doc future',
  );

  insertDoc.run(
    'doc-complete',
    'Ley Completa',
    'Complete Law',
    'LC',
    'in_force',
    '2015-01-01',
    '2015-01-01',
    'https://example/doc-complete',
    'doc complete',
  );

  insertDoc.run(
    'doc-unknown',
    'Ley Incierta',
    'Unknown Law',
    'LU',
    'in_force',
    '2016-01-01',
    '2016-01-01',
    'https://example/doc-unknown',
    'doc unknown',
  );

  insertDoc.run(
    'doc-noeu',
    'Ley Sin EU',
    'No EU Law',
    'LNE',
    'in_force',
    '2017-01-01',
    '2017-01-01',
    'https://example/doc-noeu',
    'doc noeu',
  );

  insertDoc.run(
    'doc-nourl',
    'Ley Sin URL',
    'No URL Law',
    'LSU',
    'in_force',
    '2018-01-01',
    '2018-01-01',
    null,
    'doc nourl',
  );

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertProvision.run(
    'doc-data',
    'art1',
    'Capítulo I',
    '1',
    'Artículo 1',
    'datos personales y privacidad; ciberseguridad y protección',
  );

  insertProvision.run(
    'doc-data',
    's2',
    'Capítulo I',
    '2',
    'Artículo 2',
    'tratamiento de datos para cumplimiento legal',
  );

  insertProvision.run(
    'doc-repealed',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'norma derogada sobre datos',
  );

  insertProvision.run(
    'doc-future',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'norma futura sobre datos',
  );

  insertProvision.run(
    'doc-complete',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'implementación completa del reglamento europeo',
  );

  insertProvision.run(
    'doc-unknown',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'referencia incierta a norma internacional',
  );

  insertProvision.run(
    'doc-noeu',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'norma sin referencias externas',
  );

  insertProvision.run(
    'doc-nourl',
    'art1',
    'Capítulo Único',
    '1',
    'Artículo 1',
    'norma sin url',
  );

  db.prepare(
    'INSERT INTO definitions (document_id, term, definition) VALUES (?, ?, ?)',
  ).run('doc-data', 'dato personal', 'información relativa a una persona natural');

  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  insertMeta.run('tier', 'free');
  insertMeta.run('schema_version', '2');
  insertMeta.run('built_at', '2026-02-21T20:00:00.000Z');
  insertMeta.run('builder', 'unit-test');

  return db;
}

function addEuTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE eu_documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      number INTEGER NOT NULL,
      title TEXT,
      short_name TEXT,
      description TEXT
    );

    CREATE TABLE eu_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      provision_id INTEGER,
      eu_document_id TEXT NOT NULL,
      eu_article TEXT,
      reference_type TEXT,
      implementation_status TEXT,
      reference_context TEXT,
      full_citation TEXT,
      is_primary_implementation INTEGER DEFAULT 0
    );
  `);

  const insertEuDoc = db.prepare(
    'INSERT INTO eu_documents (id, type, year, number, title, short_name, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  insertEuDoc.run(
    'regulation:2016/679',
    'regulation',
    2016,
    679,
    'General Data Protection Regulation',
    'GDPR',
    'Data protection regulation',
  );

  insertEuDoc.run(
    'directive:2022/2555',
    'directive',
    2022,
    2555,
    'NIS2 Directive',
    'NIS2',
    'Cybersecurity directive',
  );

  const provisionIds = db.prepare('SELECT id, document_id, provision_ref FROM legal_provisions').all() as Array<{
    id: number;
    document_id: string;
    provision_ref: string;
  }>;

  const byKey = new Map(provisionIds.map(p => [`${p.document_id}:${p.provision_ref}`, p.id]));
  const insertRef = db.prepare(`
    INSERT INTO eu_references (
      document_id,
      provision_id,
      eu_document_id,
      eu_article,
      reference_type,
      implementation_status,
      reference_context,
      full_citation,
      is_primary_implementation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRef.run('doc-data', byKey.get('doc-data:art1'), 'regulation:2016/679', '5', 'references', 'complete', 'ctx1', 'Regulation (EU) 2016/679 Article 5', 0);
  insertRef.run('doc-data', byKey.get('doc-data:s2'), 'regulation:2016/679', '6', 'implements', 'partial', 'ctx2', 'Regulation (EU) 2016/679 Article 6', 1);

  insertRef.run('doc-repealed', byKey.get('doc-repealed:art1'), 'directive:2022/2555', null, 'implements', 'partial', 'ctx3', 'Directive (EU) 2022/2555', 1);
  insertRef.run('doc-complete', byKey.get('doc-complete:art1'), 'regulation:2016/679', '32', 'implements', 'complete', 'ctx4', 'Regulation (EU) 2016/679 Article 32', 1);
  insertRef.run('doc-unknown', byKey.get('doc-unknown:art1'), 'regulation:2016/679', null, 'references', 'unknown', 'ctx5', 'Regulation (EU) 2016/679', 0);
}

type Db = Database.Database;
const toDb = (db: Db): any => db;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('capabilities and utils', () => {
  it('detects capabilities and reads metadata defaults', () => {
    const db = createCoreDb();
    try {
      const caps = detectCapabilities(toDb(db));
      expect(caps.has('core_legislation')).toBe(true);
      expect(caps.has('eu_references')).toBe(false);

      addEuTables(db);
      db.exec('CREATE TABLE case_law (id INTEGER); CREATE TABLE preparatory_works (id INTEGER);');
      const allCaps = detectCapabilities(toDb(db));
      expect(allCaps.has('eu_references')).toBe(true);
      expect(allCaps.has('case_law')).toBe(true);
      expect(allCaps.has('preparatory_works')).toBe(true);

      const meta = readDbMetadata(toDb(db));
      expect(meta.tier).toBe('free');
      expect(meta.schema_version).toBe('2');
      expect(meta.builder).toBe('unit-test');
    } finally {
      db.close();
    }
  });

  it('handles metadata read failures and upgrade message', () => {
    const brokenDb = {
      prepare: () => ({
        all: () => {
          throw new Error('boom');
        },
      }),
    };

    const meta = readDbMetadata(brokenDb as any);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1.0');
    expect(upgradeMessage('eu_references')).toContain('eu_references');
  });

  it('normalizes dates and fts queries', () => {
    expect(normalizeAsOfDate()).toBeNull();
    expect(normalizeAsOfDate('')).toBeNull();
    expect(normalizeAsOfDate('2026-01-02')).toBe('2026-01-02');
    expect(normalizeAsOfDate('2026-01-02T12:34:56Z')).toBe('2026-01-02');
    expect(normalizeAsOfDate('not-a-date')).toBeNull();

    expect(sanitizeFtsInput(`a'b"c(d)`)).toBe('a b c d');
    expect(buildFtsQueryVariants('')).toEqual([]);
    expect(buildFtsQueryVariants('   ')).toEqual([]);
    expect(buildFtsQueryVariants('ab')).toEqual(['ab']);
    expect(buildFtsQueryVariants('abc')).toEqual(['abc', 'abc*']);
    expect(buildFtsQueryVariants('datos personales')).toEqual([
      '"datos personales"',
      'datos AND personales',
      'datos AND personales*',
    ]);
  });

  it('generates metadata with and without freshness', () => {
    const db = createCoreDb();
    try {
      const meta = generateResponseMetadata(toDb(db));
      expect(meta.jurisdiction).toBe('CL');
      expect(meta.freshness).toBe('2026-02-21T20:00:00.000Z');
    } finally {
      db.close();
    }

    const brokenDb = {
      prepare: () => ({
        get: () => {
          throw new Error('boom');
        },
      }),
    };

    const noFreshness = generateResponseMetadata(brokenDb as any);
    expect(noFreshness.freshness).toBeUndefined();
  });

  it('resolves statute IDs across matching strategies', () => {
    const db = createCoreDb();
    try {
      expect(resolveDocumentId(toDb(db), 'doc-data')).toBe('doc-data');
      expect(resolveDocumentId(toDb(db), 'Ley de Datos')).toBe('doc-data');
      expect(resolveDocumentId(toDb(db), 'Data Law')).toBe('doc-data');
      expect(resolveDocumentId(toDb(db), '   ')).toBeNull();
      expect(resolveDocumentId(toDb(db), 'missing')).toBeNull();
    } finally {
      db.close();
    }

    const fallbackDb = {
      prepare: (sql: string) => ({
        get: () => {
          if (sql.includes('LOWER(')) return { id: 'doc-data' };
          return undefined;
        },
      }),
    };

    expect(resolveDocumentId(fallbackDb as any, 'fallback')).toBe('doc-data');
  });
});

describe('core tools', () => {
  it('searches legislation, including retry variant path', async () => {
    const db = createCoreDb();
    try {
      const empty = await searchLegislation(toDb(db), { query: '   ' });
      expect(empty.results).toEqual([]);

      const found = await searchLegislation(toDb(db), {
        query: 'datos personales',
        document_id: 'doc-data',
        status: 'amended',
        limit: 999,
      });
      expect(found.results.length).toBeGreaterThan(0);
      expect(found.results[0].document_id).toBe('doc-data');

      const noResults = await searchLegislation(toDb(db), {
        query: 'termino-inexistente',
      });
      expect(noResults.results).toEqual([]);
    } finally {
      db.close();
    }

    const retryDb = {
      prepare: (sql: string) => {
        if (sql.includes('FROM provisions_fts')) {
          return {
            all: (ftsQuery: string) => {
              if (String(ftsQuery).includes('"datos ciber"')) {
                throw new Error('fts error');
              }
              return [{
                document_id: 'doc-data',
                document_title: 'Ley de Datos',
                provision_ref: 'art1',
                chapter: 'Capítulo I',
                section: '1',
                title: 'Artículo 1',
                snippet: 'datos',
                relevance: 1,
              }];
            },
          };
        }

        return {
          get: () => {
            throw new Error('no metadata');
          },
        };
      },
    };

    const retried = await searchLegislation(retryDb as any, { query: 'datos ciber' });
    expect(retried.results.length).toBe(1);
  });

  it('retrieves provisions across lookup branches', async () => {
    const db = createCoreDb();
    try {
      const notFoundDoc = await getProvision(toDb(db), { document_id: 'unknown-law', section: '1' });
      expect(notFoundDoc.results).toEqual([]);

      const direct = await getProvision(toDb(db), { document_id: 'doc-data', provision_ref: 'art1' });
      expect(direct.results[0].provision_ref).toBe('art1');

      const sPrefix = await getProvision(toDb(db), { document_id: 'doc-data', section: '2' });
      expect(sPrefix.results[0].provision_ref).toBe('s2');

      const likeFallback = await getProvision(toDb(db), { document_id: 'doc-data', section: 'rt1' });
      expect(likeFallback.results[0].provision_ref).toBe('art1');

      const missingProvision = await getProvision(toDb(db), { document_id: 'doc-data', section: '999' });
      expect(missingProvision.results).toEqual([]);
      expect((missingProvision as any)._metadata.note).toContain('not found');

      const all = await getProvision(toDb(db), { document_id: 'doc-data' });
      expect(all.results.length).toBeGreaterThan(1);

      const noUrlSingle = await getProvision(toDb(db), { document_id: 'doc-nourl', section: '1' });
      expect(noUrlSingle.results[0].url).toBeUndefined();

      const noUrlAll = await getProvision(toDb(db), { document_id: 'doc-nourl' });
      expect(noUrlAll.results[0].url).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('handles resolved-id without a matching document row', async () => {
    vi.doMock('../../src/utils/statute-id.js', () => ({
      resolveDocumentId: () => 'ghost-doc',
    }));

    const { getProvision: mockedGetProvision } = await import('../../src/tools/get-provision.js');

    const db = createCoreDb();
    try {
      const result = await mockedGetProvision(toDb(db), { document_id: 'anything', section: '1' });
      expect(result.results).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('validates citations and supports all parse forms', async () => {
    const db = createCoreDb();
    try {
      const invalid = await validateCitationTool(toDb(db), { citation: '   ' });
      expect(invalid.results.valid).toBe(false);

      const missingDoc = await validateCitationTool(toDb(db), { citation: 'Section 1 Missing Act' });
      expect(missingDoc.results.valid).toBe(false);

      const foundSectionFirst = await validateCitationTool(toDb(db), { citation: 'Section 1 Ley de Datos' });
      expect(foundSectionFirst.results.valid).toBe(true);
      expect(foundSectionFirst.results.warnings.length).toBeGreaterThan(0);

      const foundSectionFirstWithPunctuation = await validateCitationTool(toDb(db), {
        citation: 'Section 1, Ley de Datos',
      });
      expect(foundSectionFirstWithPunctuation.results.valid).toBe(true);

      const parsedParenthesizedSection = await validateCitationTool(toDb(db), {
        citation: 'Section 13(2), Ley de Datos',
      });
      expect(parsedParenthesizedSection.results.valid).toBe(false);

      const foundSectionLast = await validateCitationTool(toDb(db), { citation: 'Ley de Datos, s 1' });
      expect(foundSectionLast.results.valid).toBe(true);

      const foundSectionWordLast = await validateCitationTool(toDb(db), { citation: 'Ley de Datos Section 1' });
      expect(foundSectionWordLast.results.valid).toBe(true);

      const foundSectionWithDot = await validateCitationTool(toDb(db), { citation: 'Ley de Datos s. 1' });
      expect(foundSectionWithDot.results.valid).toBe(true);

      const foundSectionWordLastWithComma = await validateCitationTool(toDb(db), { citation: 'Ley de Datos, Section 1' });
      expect(foundSectionWordLastWithComma.results.valid).toBe(true);

      const missingSection = await validateCitationTool(toDb(db), { citation: 'Ley de Datos s 999' });
      expect(missingSection.results.valid).toBe(false);

      const docOnly = await validateCitationTool(toDb(db), { citation: 'Ley Derogada' });
      expect(docOnly.results.valid).toBe(true);
      expect(docOnly.results.warnings.some(w => w.includes('repealed'))).toBe(true);

      const inForceDoc = await validateCitationTool(toDb(db), { citation: 'Ley Sin URL' });
      expect(inForceDoc.results.valid).toBe(true);
      expect(inForceDoc.results.warnings).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('formats citations in all output styles', async () => {
    expect(await formatCitationTool({ citation: 'Section 13, Ley de Datos' })).toEqual({
      original: 'Section 13, Ley de Datos',
      formatted: 'Section 13, Ley de Datos',
      format: 'full',
    });

    expect(await formatCitationTool({ citation: 'Ley de Datos' })).toEqual({
      original: 'Ley de Datos',
      formatted: 'Ley de Datos',
      format: 'full',
    });

    expect(await formatCitationTool({ citation: 'Ley de Datos s 13', format: 'short' })).toEqual({
      original: 'Ley de Datos s 13',
      formatted: 'Ley de Datos s 13',
      format: 'short',
    });

    expect(await formatCitationTool({ citation: 'Ley de Datos', format: 'short' })).toEqual({
      original: 'Ley de Datos',
      formatted: 'Ley de Datos',
      format: 'short',
    });

    expect(await formatCitationTool({ citation: 'Ley de Datos s 13', format: 'pinpoint' })).toEqual({
      original: 'Ley de Datos s 13',
      formatted: 's 13',
      format: 'pinpoint',
    });

    expect(await formatCitationTool({ citation: 'Ley de Datos', format: 'pinpoint' })).toEqual({
      original: 'Ley de Datos',
      formatted: 'Ley de Datos',
      format: 'pinpoint',
    });
  });

  it('builds legal stance with search fallback behavior', async () => {
    const db = createCoreDb();
    try {
      const empty = await buildLegalStance(toDb(db), { query: ' ' });
      expect(empty.results).toEqual([]);

      const found = await buildLegalStance(toDb(db), { query: 'datos', document_id: 'doc-data', limit: 100 });
      expect(found.results.length).toBeGreaterThan(0);

      const noResults = await buildLegalStance(toDb(db), { query: 'termino-inexistente' });
      expect(noResults.results).toEqual([]);
    } finally {
      db.close();
    }

    const retryDb = {
      prepare: (sql: string) => {
        if (sql.includes('FROM provisions_fts')) {
          return {
            all: (ftsQuery: string) => {
              if (String(ftsQuery).includes('"datos prueba"')) {
                throw new Error('fts bad query');
              }
              return [{
                document_id: 'doc-data',
                document_title: 'Ley de Datos',
                provision_ref: 'art1',
                section: '1',
                title: 'Artículo 1',
                snippet: 'datos',
                relevance: 1,
              }];
            },
          };
        }

        return {
          get: () => {
            throw new Error('metadata');
          },
        };
      },
    };

    const retried = await buildLegalStance(retryDb as any, { query: 'datos prueba' });
    expect(retried.results.length).toBe(1);
  });

  it('checks document currency statuses', async () => {
    const db = createCoreDb();
    try {
      const unknown = await checkCurrency(toDb(db), { document_id: 'totally-missing-law' });
      expect(unknown.results.status).toBe('not_found');

      const repealed = await checkCurrency(toDb(db), { document_id: 'doc-repealed' });
      expect(repealed.results.warnings[0]).toContain('repealed');

      const future = await checkCurrency(toDb(db), { document_id: 'doc-future' });
      expect(future.results.warnings[0]).toContain('not yet entered');

      const amended = await checkCurrency(toDb(db), { document_id: 'doc-data' });
      expect(amended.results.status).toBe('amended');
    } finally {
      db.close();
    }
  });

  it('returns source metadata and about payloads including degraded paths', async () => {
    const db = createCoreDb();
    try {
      const sources = await listSources(toDb(db));
      expect(sources.results.database.document_count).toBeGreaterThan(0);
      expect(sources.results.sources[0].name).toBe('LeyChile');

      const about = getAbout(toDb(db), {
        version: '1.0.0',
        fingerprint: 'abc123',
        dbBuilt: '2026-02-21T20:00:00.000Z',
      });
      expect(about.server).toBe('chilean-law-mcp');
      expect(about.data_source.jurisdiction).toBe('CL');
    } finally {
      db.close();
    }

    const brokenDb = {
      prepare: (sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { all: () => [{ name: 'legal_documents' }] };
        }
        if (sql.includes('db_metadata')) {
          return { all: () => [] };
        }
        throw new Error('boom');
      },
    };

    const degradedSources = await listSources(brokenDb as any);
    expect(degradedSources.results.database.document_count).toBe(0);

    const degradedAbout = getAbout(brokenDb as any, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T20:00:00.000Z',
    });
    expect(degradedAbout.statistics.documents).toBe(0);

    const zeroRowDb = {
      prepare: (sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { all: () => [{ name: 'legal_documents' }, { name: 'legal_provisions' }, { name: 'provisions_fts' }] };
        }
        if (sql.includes('db_metadata')) {
          return { all: () => [{ key: 'tier', value: 'free' }, { key: 'schema_version', value: '2' }] };
        }
        return { get: () => undefined };
      },
    };

    const zeroRowSources = await listSources(zeroRowDb as any);
    expect(zeroRowSources.results.database.document_count).toBe(0);
    const zeroRowAbout = getAbout(zeroRowDb as any, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T20:00:00.000Z',
    });
    expect(zeroRowAbout.statistics.documents).toBe(0);
  });
});

describe('EU tools', () => {
  it('handles missing EU tables in free-tier style DB', async () => {
    const db = createCoreDb();
    try {
      const basis = await getEUBasis(toDb(db), { document_id: 'doc-data' });
      expect((basis as any)._metadata.note).toContain('not available');

      const impl = await getChileanImplementations(toDb(db), { eu_document_id: 'regulation:2016/679' });
      expect((impl as any)._metadata.note).toContain('not available');

      const search = await searchEUImplementations(toDb(db), {});
      expect((search as any)._metadata.note).toContain('not available');

      const provBasis = await getProvisionEUBasis(toDb(db), { document_id: 'doc-data', provision_ref: '1' });
      expect((provBasis as any)._metadata.note).toContain('not available');

      const compliance = await validateEUCompliance(toDb(db), { document_id: 'doc-data' });
      expect(compliance.results.compliance_status).toBe('not_applicable');
      expect(compliance.results.warnings[0]).toContain('not available');
    } finally {
      db.close();
    }
  });

  it('queries EU basis and implementation mappings with filters', async () => {
    const db = createCoreDb();
    addEuTables(db);

    try {
      const missingDoc = await getEUBasis(toDb(db), { document_id: 'missing' });
      expect(missingDoc.results).toEqual([]);

      const basis = await getEUBasis(toDb(db), {
        document_id: 'doc-data',
        include_articles: true,
        reference_types: ['implements'],
      });
      expect(basis.results.length).toBe(1);
      expect(basis.results[0].articles).toContain('6');

      const implAll = await getChileanImplementations(toDb(db), {
        eu_document_id: 'regulation:2016/679',
      });
      expect(implAll.results.length).toBeGreaterThan(1);

      const implFiltered = await getChileanImplementations(toDb(db), {
        eu_document_id: 'regulation:2016/679',
        primary_only: true,
        in_force_only: true,
      });
      expect(implFiltered.results.every(r => r.is_primary)).toBe(true);

      const euSearch = await searchEUImplementations(toDb(db), {
        query: 'Data Protection',
        type: 'regulation',
        year_from: 2010,
        year_to: 2020,
        has_chilean_implementation: true,
        limit: 5,
      });
      expect(euSearch.results[0].eu_document_id).toBe('regulation:2016/679');

      const provMissingDoc = await getProvisionEUBasis(toDb(db), {
        document_id: 'missing',
        provision_ref: '1',
      });
      expect(provMissingDoc.results).toEqual([]);

      const provMissingProvision = await getProvisionEUBasis(toDb(db), {
        document_id: 'doc-data',
        provision_ref: '999',
      });
      expect(provMissingProvision.results).toEqual([]);

      const provBasis = await getProvisionEUBasis(toDb(db), {
        document_id: 'doc-data',
        provision_ref: '2',
      });
      expect(provBasis.results.length).toBe(1);
      expect(provBasis.results[0].eu_document_id).toBe('regulation:2016/679');
    } finally {
      db.close();
    }
  });

  it('validates EU compliance status across outcomes', async () => {
    const db = createCoreDb();
    addEuTables(db);

    try {
      const notFound = await validateEUCompliance(toDb(db), { document_id: 'missing' });
      expect(notFound.results.compliance_status).toBe('not_applicable');

      const noRefs = await validateEUCompliance(toDb(db), { document_id: 'doc-noeu' });
      expect(noRefs.results.compliance_status).toBe('not_applicable');
      expect(noRefs.results.recommendations[0]).toContain('No EU cross-references');

      const compliant = await validateEUCompliance(toDb(db), { document_id: 'doc-complete' });
      expect(compliant.results.compliance_status).toBe('compliant');

      const partial = await validateEUCompliance(toDb(db), { document_id: 'doc-data' });
      expect(partial.results.compliance_status).toBe('partial');

      const repealedPartial = await validateEUCompliance(toDb(db), {
        document_id: 'doc-repealed',
        eu_document_id: 'directive:2022/2555',
      });
      expect(repealedPartial.results.warnings.some(w => w.includes('repealed'))).toBe(true);

      const unclear = await validateEUCompliance(toDb(db), { document_id: 'doc-unknown' });
      expect(unclear.results.compliance_status).toBe('unclear');
      expect(unclear.results.recommendations.some(r => r.includes('unknown'))).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('tool registry wiring', () => {
  class FakeServer {
    handlers = new Map<any, any>();
    setRequestHandler(schema: any, handler: any) {
      this.handlers.set(schema, handler);
    }
  }

  it('builds tools with/without context and without definitions table', () => {
    const coreDb = createCoreDb();
    const noDefinitionsDb = new Database(':memory:');
    try {
      const baseTools = buildTools();
      expect(baseTools.some(t => t.name === 'about')).toBe(false);

      const withContext = buildTools(toDb(coreDb), {
        version: '1.0.0',
        fingerprint: 'abc',
        dbBuilt: '2026-02-21T20:00:00.000Z',
      });
      expect(withContext.some(t => t.name === 'about')).toBe(true);

      const noDefsTools = buildTools(toDb(noDefinitionsDb), {
        version: '1.0.0',
        fingerprint: 'abc',
        dbBuilt: '2026-02-21T20:00:00.000Z',
      });
      expect(noDefsTools.length).toBeGreaterThan(0);
    } finally {
      coreDb.close();
      noDefinitionsDb.close();
    }
  });

  it('routes all tool handlers, unknown tools, and error paths', async () => {
    const db = createCoreDb();
    addEuTables(db);

    const server = new FakeServer();
    registerTools(server as any, toDb(db), {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T20:00:00.000Z',
    });

    const listHandler = server.handlers.get(ListToolsRequestSchema);
    const listResult = await listHandler({});
    expect(listResult.tools.length).toBeGreaterThan(0);

    const callHandler = server.handlers.get(CallToolRequestSchema);

    const calls: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'search_legislation', args: { query: 'datos' } },
      { name: 'get_provision', args: { document_id: 'doc-data', section: '1' } },
      { name: 'validate_citation', args: { citation: 'Ley de Datos s 1' } },
      { name: 'build_legal_stance', args: { query: 'datos' } },
      { name: 'format_citation', args: { citation: 'Ley de Datos s 1', format: 'short' } },
      { name: 'check_currency', args: { document_id: 'doc-data' } },
      { name: 'get_eu_basis', args: { document_id: 'doc-data' } },
      { name: 'get_chilean_implementations', args: { eu_document_id: 'regulation:2016/679' } },
      { name: 'search_eu_implementations', args: { query: 'Data' } },
      { name: 'get_provision_eu_basis', args: { document_id: 'doc-data', provision_ref: '2' } },
      { name: 'validate_eu_compliance', args: { document_id: 'doc-data' } },
      { name: 'list_sources', args: {} },
      { name: 'about', args: {} },
    ];

    for (const entry of calls) {
      const response = await callHandler({ params: { name: entry.name, arguments: entry.args } });
      expect(response.isError).not.toBe(true);
      expect(response.content[0].type).toBe('text');
    }

    const unknownTool = await callHandler({ params: { name: 'unknown_tool', arguments: {} } });
    expect(unknownTool.isError).toBe(true);

    const noAboutServer = new FakeServer();
    registerTools(noAboutServer as any, toDb(db));
    const noAboutCall = noAboutServer.handlers.get(CallToolRequestSchema);
    const noAboutRes = await noAboutCall({ params: { name: 'about', arguments: {} } });
    expect(noAboutRes.isError).toBe(true);

    const brokenServer = new FakeServer();
    const brokenDb = {
      prepare: () => {
        throw new Error('intentional');
      },
    };
    registerTools(brokenServer as any, brokenDb as any, {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T20:00:00.000Z',
    });
    const brokenCall = brokenServer.handlers.get(CallToolRequestSchema);
    const brokenRes = await brokenCall({ params: { name: 'about', arguments: {} } });
    expect(brokenRes.isError).toBe(true);

    const nonErrorThrowServer = new FakeServer();
    const stringThrowDb = {
      prepare: () => {
        throw 'intentional-string';
      },
    };
    registerTools(nonErrorThrowServer as any, stringThrowDb as any, {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T20:00:00.000Z',
    });
    const stringThrowCall = nonErrorThrowServer.handlers.get(CallToolRequestSchema);
    const stringThrowRes = await stringThrowCall({ params: { name: 'about', arguments: {} } });
    expect(stringThrowRes.isError).toBe(true);

    db.close();
  });
});
