/**
 * Rate-limited client for LeyChile JSON legislation endpoint.
 *
 * Official source:
 *   https://nuevo.leychile.cl/servicios/Navegar/get_norma_json
 */

import type { LeyChileResponse } from './parser.js';

const USER_AGENT = 'Chilean-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Chilean-law-mcp)';
const MIN_DELAY_MS = 1200;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  url: string;
  json?: LeyChileResponse;
}

function buildLawUrl(lawNumber: number): string {
  const params = new URLSearchParams({
    idNorma: '',
    idVersion: '',
    idLey: String(lawNumber),
    tipoVersion: '2',
    cve: '',
    agrupa_partes: '1',
    r: String(Date.now()),
  });

  return `https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?${params.toString()}`;
}

export async function fetchLawByNumber(lawNumber: number, maxRetries = 3): Promise<FetchResult> {
  const url = buildLawUrl(lawNumber);
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json,text/plain,*/*',
      },
      redirect: 'follow',
    });

    const body = await response.text();

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} (Ley ${lawNumber}), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }

    let json: LeyChileResponse | undefined;
    if (response.ok) {
      try {
        json = JSON.parse(body) as LeyChileResponse;
      } catch {
        // Keep raw body for debugging/reporting.
      }
    }

    return {
      status: response.status,
      body,
      url: response.url,
      json,
    };
  }

  throw new Error(`Failed to fetch Ley ${lawNumber} after ${maxRetries} retries`);
}
