/**
 * format_citation — Format an Chilean legal citation per standard conventions.
 */

import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import type Database from '@ansvar/mcp-sqlite';

export interface FormatCitationInput {
  citation: string;
  format?: 'full' | 'short' | 'pinpoint';
}

export interface FormatCitationResult {
  original: string;
  formatted: string;
  format: string;
}

export async function formatCitationTool(
  input: FormatCitationInput,
): Promise<FormatCitationResult> {
  const format = input.format ?? 'full';
  const trimmed = input.citation.trim();

  // Parse "Section N <Act>" or "Section N, <Act>"
  const sectionFirst = trimmed.match(/^Section\s+(\d+[A-Za-z]*(?:\(\d+\))?)\s*[,;]?\s+(.+)$/i);
  // Parse "<Act> s N" or "<Act>, s N" or "<Act> Section N"
  const sectionLast = trimmed.match(/^(.+?)\s*[,;]?\s+(?:s\.?\s+|Section\s+)(\d+[A-Za-z]*(?:\(\d+\))?)$/i);

  const section = sectionFirst?.[1] ?? sectionLast?.[2];
  const act = sectionFirst?.[2] ?? sectionLast?.[1] ?? trimmed;

  let formatted: string;
  switch (format) {
    case 'short':
      formatted = section ? `${act.split('(')[0].trim()} s ${section}` : act;
      break;
    case 'pinpoint':
      formatted = section ? `s ${section}` : act;
      break;
    case 'full':
    default:
      formatted = section ? `Section ${section}, ${act}` : act;
      break;
  }

  return { original: input.citation, formatted, format };
}
