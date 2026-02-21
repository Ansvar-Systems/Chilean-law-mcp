#!/usr/bin/env tsx
/**
 * Fetch a complete index of Chilean laws from LeyChile's official search service.
 *
 * Source endpoint:
 *   https://nuevo.leychile.cl/servicios/buscarjson
 *
 * Usage:
 *   node --import tsx scripts/fetch-all-laws-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.resolve(__dirname, '../data/source/cl-all-laws-index.json');
const BASE_URL = 'https://nuevo.leychile.cl/servicios/buscarjson';
const USER_AGENT = 'Chilean-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Chilean-law-mcp)';
const MIN_DELAY_MS = 1200;
const PAGE_SIZE = 100;
const LAW_TYPES = ['Ley', 'Lei'] as const;

type LawType = (typeof LAW_TYPES)[number];

interface SearchRow {
  IDNORMA: number | string;
  NORMA?: string;
  TITULO_NORMA?: string;
  ORGANISMO?: string;
  TIPO?: string;
  DESCRIPCION?: string;
  FECHA_PROMULGACION?: string;
  FECHA_VIGENCIA?: string;
  FECHA_PUBLICACION?: string;
  FECHA_DEROGACION?: string;
}

interface SearchMeta {
  totalitems?: number | string;
}

type SearchPayload = [SearchRow[], SearchMeta, unknown];

interface IndexedLaw {
  id_norma: string;
  norma: string;
  title: string;
  organismo: string;
  tipo: string;
  descripcion: string;
  fecha_promulgacion: string;
  fecha_vigencia: string;
  fecha_publicacion: string;
  fecha_derogacion: string;
  fuente_filtro: LawType;
  url: string;
}

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function toStringSafe(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseTotalItems(meta: SearchMeta | undefined): number {
  const raw = meta?.totalitems;
  const parsed = Number.parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildUrl(lawType: LawType, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    cadena: '',
    fc_tn: lawType,
    itemsporpagina: String(pageSize),
    npagina: String(page),
    orden: '2',
    tipoviene: '1',
  });

  return `${BASE_URL}?${params.toString()}`;
}

async function fetchSearchPage(lawType: LawType, page: number, maxRetries = 3): Promise<SearchPayload> {
  const url = buildUrl(lawType, page, PAGE_SIZE);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await rateLimit();

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json,text/plain,*/*',
      },
      redirect: 'follow',
    });

    const body = await response.text();

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const backoff = Math.pow(2, attempt + 1) * 1000;
      console.log(`  HTTP ${response.status} (${lawType} page ${page}) retrying in ${backoff}ms...`);
      await sleep(backoff);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${lawType} page ${page}: HTTP ${response.status}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`${lawType} page ${page}: invalid JSON`);
    }

    if (!Array.isArray(parsed) || parsed.length < 2 || !Array.isArray(parsed[0])) {
      throw new Error(`${lawType} page ${page}: unexpected response shape`);
    }

    return parsed as SearchPayload;
  }

  throw new Error(`${lawType} page ${page}: failed after retries`);
}

function toIndexedLaw(row: SearchRow, lawType: LawType): IndexedLaw | null {
  const idNorma = toStringSafe(row.IDNORMA);
  if (!idNorma) return null;

  return {
    id_norma: idNorma,
    norma: toStringSafe(row.NORMA),
    title: toStringSafe(row.TITULO_NORMA),
    organismo: toStringSafe(row.ORGANISMO),
    tipo: toStringSafe(row.TIPO),
    descripcion: toStringSafe(row.DESCRIPCION),
    fecha_promulgacion: toStringSafe(row.FECHA_PROMULGACION),
    fecha_vigencia: toStringSafe(row.FECHA_VIGENCIA),
    fecha_publicacion: toStringSafe(row.FECHA_PUBLICACION),
    fecha_derogacion: toStringSafe(row.FECHA_DEROGACION),
    fuente_filtro: lawType,
    url: `https://www.bcn.cl/leychile/navegar?idNorma=${encodeURIComponent(idNorma)}`,
  };
}

async function fetchTypeIndex(lawType: LawType, out: Map<string, IndexedLaw>): Promise<{ type: LawType; total: number; pages: number; uniqueAdded: number }> {
  console.log(`\nFetching ${lawType} index...`);

  const first = await fetchSearchPage(lawType, 1);
  const total = parseTotalItems(first[1]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  let added = 0;

  const addRows = (rows: SearchRow[]): void => {
    for (const row of rows) {
      const indexed = toIndexedLaw(row, lawType);
      if (!indexed) continue;
      if (!out.has(indexed.id_norma)) {
        out.set(indexed.id_norma, indexed);
        added++;
      }
    }
  };

  addRows(first[0]);
  console.log(`  page 1/${pages} complete`);

  for (let page = 2; page <= pages; page++) {
    const payload = await fetchSearchPage(lawType, page);
    addRows(payload[0]);
    if (page % 20 === 0 || page === pages) {
      console.log(`  page ${page}/${pages} complete`);
    }
  }

  console.log(`  ${lawType}: totalitems=${total}, pages=${pages}, uniqueAdded=${added}`);
  return { type: lawType, total, pages, uniqueAdded: added };
}

async function main(): Promise<void> {
  console.log('LeyChile all-laws index fetcher');
  console.log('==============================\n');
  console.log(`  Endpoint: ${BASE_URL}`);
  console.log(`  Law filters: ${LAW_TYPES.join(', ')}`);
  console.log(`  Page size: ${PAGE_SIZE}`);
  console.log(`  Rate limit: ${MIN_DELAY_MS}ms/request`);

  const byIdNorma = new Map<string, IndexedLaw>();
  const stats: Array<{ type: LawType; total: number; pages: number; uniqueAdded: number }> = [];

  for (const lawType of LAW_TYPES) {
    const stat = await fetchTypeIndex(lawType, byIdNorma);
    stats.push(stat);
  }

  const records = Array.from(byIdNorma.values()).sort((a, b) => {
    const aNum = Number.parseInt(a.id_norma, 10);
    const bNum = Number.parseInt(b.id_norma, 10);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }
    return a.id_norma.localeCompare(b.id_norma);
  });

  const payload = {
    generated_at: new Date().toISOString(),
    source: {
      name: 'LeyChile',
      authority: 'Biblioteca del Congreso Nacional de Chile (BCN)',
      endpoint: BASE_URL,
      filters: LAW_TYPES,
      page_size: PAGE_SIZE,
      rate_limit_ms: MIN_DELAY_MS,
    },
    totals: {
      by_filter: Object.fromEntries(stats.map(s => [s.type, s.total])),
      combined_unique_id_norma: records.length,
    },
    records,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));

  console.log('\nSummary');
  console.log('-------');
  for (const stat of stats) {
    console.log(`  ${stat.type}: total=${stat.total}, pages=${stat.pages}, uniqueAdded=${stat.uniqueAdded}`);
  }
  console.log(`  Combined unique idNorma: ${records.length}`);
  console.log(`\nWrote: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error(`\nFatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
