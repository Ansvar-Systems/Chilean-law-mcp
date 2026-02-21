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
    data_source: 'Official Legal Database (bcn.cl/leychile) — Government (State Chancellery of Chilean)',
    jurisdiction: 'EE',
    disclaimer:
      'This data is sourced from the Official Legal Database under public domain. ' +
      'The authoritative versions are maintained by Government (State Chancellery of Chilean). ' +
      'Always verify with the official Official Legal Database portal (bcn.cl/leychile).',
    freshness,
  };
}
