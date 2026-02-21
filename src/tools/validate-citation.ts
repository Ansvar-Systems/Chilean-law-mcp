/**
 * validate_citation — Validate an Chilean legal citation against the database.
 */

import type Database from '@ansvar/mcp-sqlite';
import { resolveDocumentId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ValidateCitationInput {
  citation: string;
}

export interface ValidateCitationResult {
  valid: boolean;
  citation: string;
  normalized?: string;
  document_id?: string;
  document_title?: string;
  provision_ref?: string;
  status?: string;
  warnings: string[];
}

/**
 * Parse an Chilean legal citation.
 * Supports:
 * - "Section 13 Privacy Act 1988" / "Section 13, Privacy Act 1988"
 * - "Privacy Act 1988 s 13" / "Privacy Act 1988, s 13"
 * - "[Act Title Year] s N"
 * - "s 13" (section only, no document)
 * - Plain document reference (e.g., "Privacy Act 1988")
 */
function parseCitation(citation: string): { documentRef: string; sectionRef?: string } | null {
  const trimmed = citation.trim();
  if (trimmed.length === 0) return null;

  // Normalize optional comma/semicolon after the section token.
  const normalizedSectionFirst = trimmed.replace(
    /^Section\s+([0-9A-Za-z()]+)\s*[,;]\s+/i,
    'Section $1 ',
  );

  // "Section N <Act>" or "Section N, <Act>"
  const sectionFirst = normalizedSectionFirst.match(/^Section\s+([0-9A-Za-z()]+)\s+(.+)$/i);
  if (sectionFirst) {
    return { documentRef: sectionFirst[2].trim(), sectionRef: sectionFirst[1] };
  }

  // Normalize optional comma/semicolon before section suffix.
  const normalizedSectionLast = trimmed
    .replace(/^(.+?)\s*[,;]\s+s\s+([0-9A-Za-z()]+)$/i, '$1 s $2')
    .replace(/^(.+?)\s*[,;]\s+s\.\s+([0-9A-Za-z()]+)$/i, '$1 s. $2');

  // "<Act> s N" or "<Act>, s N" or "<Act> s. N"
  const sectionLast =
    normalizedSectionLast.match(/^(.+?)\s+s\s+([0-9A-Za-z()]+)$/i)
    ?? normalizedSectionLast.match(/^(.+?)\s+s\.\s+([0-9A-Za-z()]+)$/i);
  if (sectionLast) {
    return { documentRef: sectionLast[1].trim(), sectionRef: sectionLast[2] };
  }

  const normalizedSectionWordLast = trimmed.replace(
    /^(.+?)\s*[,;]\s+Section\s+([0-9A-Za-z()]+)$/i,
    '$1 Section $2',
  );

  // "<Act> Section N" or "<Act>, Section N"
  const sectionWordLast = normalizedSectionWordLast.match(/^(.+?)\s+Section\s+([0-9A-Za-z()]+)$/i);
  if (sectionWordLast) {
    return { documentRef: sectionWordLast[1].trim(), sectionRef: sectionWordLast[2] };
  }

  // Just a document reference (no section)
  return { documentRef: trimmed };
}

export async function validateCitationTool(
  db: InstanceType<typeof Database>,
  input: ValidateCitationInput,
): Promise<ToolResponse<ValidateCitationResult>> {
  const warnings: string[] = [];
  const parsed = parseCitation(input.citation);

  if (!parsed) {
    return {
      results: {
        valid: false,
        citation: input.citation,
        warnings: ['Could not parse citation format'],
      },
      _metadata: generateResponseMetadata(db),
    };
  }

  const docId = resolveDocumentId(db, parsed.documentRef);
  if (!docId) {
    return {
      results: {
        valid: false,
        citation: input.citation,
        warnings: [`Document not found: "${parsed.documentRef}"`],
      },
      _metadata: generateResponseMetadata(db),
    };
  }

  const doc = db.prepare(
    'SELECT id, title, status FROM legal_documents WHERE id = ?'
  ).get(docId) as { id: string; title: string; status: string };

  if (doc.status === 'repealed') {
    warnings.push(`WARNING: This statute has been repealed.`);
  } else if (doc.status === 'amended') {
    warnings.push(`Note: This statute has been amended. Verify you are referencing the current version.`);
  }

  if (parsed.sectionRef) {
    const provision = db.prepare(
      "SELECT provision_ref FROM legal_provisions WHERE document_id = ? AND (provision_ref = ? OR provision_ref = ? OR section = ?)"
    ).get(docId, parsed.sectionRef, `s${parsed.sectionRef}`, parsed.sectionRef) as { provision_ref: string } | undefined;

    if (!provision) {
      return {
        results: {
          valid: false,
          citation: input.citation,
          document_id: docId,
          document_title: doc.title,
          warnings: [...warnings, `Provision "Section ${parsed.sectionRef}" not found in ${doc.title}`],
        },
        _metadata: generateResponseMetadata(db),
      };
    }

    return {
      results: {
        valid: true,
        citation: input.citation,
        normalized: `Section ${parsed.sectionRef}, ${doc.title}`,
        document_id: docId,
        document_title: doc.title,
        provision_ref: provision.provision_ref,
        status: doc.status,
        warnings,
      },
      _metadata: generateResponseMetadata(db),
    };
  }

  return {
    results: {
      valid: true,
      citation: input.citation,
      normalized: doc.title,
      document_id: docId,
      document_title: doc.title,
      status: doc.status,
      warnings,
    },
    _metadata: generateResponseMetadata(db),
  };
}
