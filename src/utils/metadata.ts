/**
 * Response metadata utilities for Chilean Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'LeyChile (Biblioteca del Congreso Nacional de Chile) — https://www.bcn.cl/leychile',
    jurisdiction: 'CL',
    disclaimer:
      'This dataset is sourced from Chile\'s official LeyChile service. ' +
      'Always verify citations against the official portal.',
    freshness,
  };
}
