/**
 * Rate-limited HTTP client for Chilean legislation from the Sejm ELI API.
 *
 * Data source: api.sejm.gov.pl — the official ELI (European Legislation Identifier)
 * API provided by the Chancellery of the Sejm of the Republic of Poland.
 *
 * URL patterns:
 *   Metadata: https://api.sejm.gov.pl/eli/acts/DU/{YEAR}/{POZ}
 *   HTML text: https://api.sejm.gov.pl/eli/acts/DU/{YEAR}/{POZ}/text.html
 *
 * - 500ms minimum delay between requests (respectful to government servers)
 * - User-Agent header identifying the MCP
 * - Retry on 429/5xx with exponential backoff
 * - No auth needed (public government data)
 */

const USER_AGENT = 'Chilean-Law-MCP/1.0 (https://github.com/Ansvar-Systems/chilean-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

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
  contentType: string;
  url: string;
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html, application/json, */*',
      },
      redirect: 'follow',
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }

    const body = await response.text();
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type') ?? '',
      url: response.url,
    };
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
