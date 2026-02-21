/**
 * Parser for Chilean legislation from LeyChile services.
 *
 * Data source:
 *   https://nuevo.leychile.cl/servicios/Navegar/get_norma_json
 *
 * The service returns structured JSON with:
 * - `html`: nested content blocks containing article text in HTML fragments
 * - `estructura`: nested hierarchy with headings and article IDs
 * - `metadatos`: official metadata (title, publication date, status)
 */

export interface ActIndexEntry {
  id: string;
  lawNumber: number;
  seedFile: string;
  titleEn?: string;
  shortName?: string;
}

interface LeyChileNode {
  i?: number;
  n?: string;
  t?: string;
  h?: LeyChileNode[];
}

interface LeyChileMetadata {
  id_norma?: string;
  titulo_norma?: string;
  fecha_promulgacion?: string;
  fecha_publicacion?: string;
  tipo_version_s?: string;
  derogado?: boolean;
  vigencia?: {
    inicio_vigencia?: string;
    fin_vigencia?: string;
  };
}

export interface LeyChileResponse {
  html?: LeyChileNode[];
  estructura?: LeyChileNode[];
  metadatos?: LeyChileMetadata;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

interface StructuredArticle {
  id: number;
  name: string;
  chapter?: string;
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isNaN(code) ? _m : String.fromCodePoint(code);
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isNaN(code) ? _m : String.fromCodePoint(code);
    })
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_HTML_ENTITIES[name] ?? m);
}

function stripNoteFragments(html: string): string {
  return html
    .replace(/<span[^>]*class="[^"]*\bn\b[^"]*"[^>]*>.*?<\/span>/gis, '')
    .replace(/<div[^>]*class="[^"]*\bn\b[^"]*"[^>]*>.*?<\/div>/gis, '')
    .replace(/<div[^>]*class="[^"]*\brnp\b[^"]*"[^>]*>.*?<\/div>/gis, '');
}

function htmlToPlainText(html: string): string {
  const withoutNotes = stripNoteFragments(html);
  const withLineBreaks = withoutNotes
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(div|p|li|tr|h[1-6])\s*>/gi, '\n');

  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, '');
  const decoded = decodeHtmlEntities(withoutTags)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '');

  return decoded
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function slugifySection(section: string): string {
  return section
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseStatus(meta: LeyChileMetadata | undefined): ParsedAct['status'] {
  if (!meta) return 'in_force';
  if (meta.derogado) return 'repealed';

  const today = new Date().toISOString().slice(0, 10);
  const start = normalizeDate(meta.vigencia?.inicio_vigencia);
  if (start && start > today) {
    return 'not_yet_in_force';
  }

  const versionLabel = (meta.tipo_version_s ?? '').toLowerCase();
  if (versionLabel.includes('ultima') || versionLabel.includes('última') || versionLabel.includes('intermedio')) {
    return 'amended';
  }

  return 'in_force';
}

function extractSection(articleName: string, chapter?: string): string | null {
  const normalized = articleName.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^Artículo\s+(.+)$/i);
  if (!match) return null;

  let section = match[1]
    .replace(/[º°]/g, '')
    .replace(/[.:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!section) return null;

  if (chapter && /transitor/i.test(chapter) && !/transitor/i.test(section)) {
    section = `${section} transitorio`;
  }

  return section;
}

function collectHtmlById(nodes: LeyChileNode[] | undefined, out: Map<number, string>): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (typeof node.i === 'number' && typeof node.t === 'string') {
      out.set(node.i, node.t);
    }
    if (Array.isArray(node.h)) {
      collectHtmlById(node.h, out);
    }
  }
}

function collectArticlesFromStructure(
  nodes: LeyChileNode[] | undefined,
  chapterStack: string[],
  out: StructuredArticle[],
): void {
  if (!nodes) return;

  for (const node of nodes) {
    const name = (node.n ?? '').replace(/\s+/g, ' ').trim();
    const isArticle = /^Artículo\s+/i.test(name);

    if (isArticle && typeof node.i === 'number') {
      out.push({
        id: node.i,
        name,
        chapter: chapterStack.at(-1),
      });
    }

    const nextStack = isArticle || !name
      ? chapterStack
      : [...chapterStack, name];

    if (Array.isArray(node.h)) {
      collectArticlesFromStructure(node.h, nextStack, out);
    }
  }
}

function collectArticlesFromHtml(nodes: LeyChileNode[] | undefined, chapter: string | undefined, out: StructuredArticle[]): void {
  if (!nodes) return;

  for (const node of nodes) {
    const text = typeof node.t === 'string' ? htmlToPlainText(node.t) : '';
    const firstLine = text.split('\n')[0] ?? '';
    const isArticle = /^Artículo\s+/i.test(firstLine);

    if (isArticle && typeof node.i === 'number') {
      out.push({ id: node.i, name: firstLine, chapter });
    }

    const nextChapter = !isArticle && firstLine.length > 0 && firstLine.length < 140
      ? firstLine
      : chapter;

    if (Array.isArray(node.h)) {
      collectArticlesFromHtml(node.h, nextChapter, out);
    }
  }
}

export function parseLeyChileResponse(response: LeyChileResponse, act: ActIndexEntry): ParsedAct {
  const htmlById = new Map<number, string>();
  collectHtmlById(response.html, htmlById);

  const structuredArticles: StructuredArticle[] = [];
  collectArticlesFromStructure(response.estructura, [], structuredArticles);

  if (structuredArticles.length === 0) {
    collectArticlesFromHtml(response.html, undefined, structuredArticles);
  }

  const provisions: ParsedProvision[] = [];
  const baseRefCounts = new Map<string, number>();

  for (const article of structuredArticles) {
    const html = htmlById.get(article.id);
    if (!html) continue;

    const content = htmlToPlainText(html);
    if (!content) continue;

    const section = extractSection(article.name, article.chapter);
    if (!section) continue;

    const baseRef = `art${slugifySection(section)}`;
    const seen = baseRefCounts.get(baseRef) ?? 0;
    baseRefCounts.set(baseRef, seen + 1);
    const provisionRef = seen === 0 ? baseRef : `${baseRef}-${seen + 1}`;

    provisions.push({
      provision_ref: provisionRef,
      chapter: article.chapter,
      section,
      title: article.name,
      content,
    });
  }

  const meta = response.metadatos;
  const idNorma = meta?.id_norma?.trim();

  return {
    id: act.id,
    type: 'statute',
    title: (meta?.titulo_norma ?? `Ley ${act.lawNumber}`).trim(),
    title_en: act.titleEn,
    short_name: act.shortName,
    status: parseStatus(meta),
    issued_date: normalizeDate(meta?.fecha_promulgacion),
    in_force_date: normalizeDate(meta?.vigencia?.inicio_vigencia ?? meta?.fecha_publicacion),
    url: idNorma
      ? `https://www.bcn.cl/leychile/navegar?idNorma=${idNorma}`
      : `https://www.bcn.cl/leychile/navegar?idLey=${act.lawNumber}`,
    provisions,
    definitions: [],
  };
}

/**
 * Target Chilean laws for the MCP corpus.
 */
export const KEY_CHILEAN_ACTS: ActIndexEntry[] = [
  {
    id: 'cl-ley-19628-datos-personales',
    lawNumber: 19628,
    seedFile: '01-personal-data-19628.json',
    shortName: 'Ley 19.628',
    titleEn: 'Law 19.628 on Protection of Private Life (Personal Data Protection)',
  },
  {
    id: 'cl-ley-21459-delitos-informaticos',
    lawNumber: 21459,
    seedFile: '02-information-security-21459.json',
    shortName: 'Ley 21.459',
    titleEn: 'Law 21.459 on Cybercrime',
  },
  {
    id: 'cl-ley-18168-telecomunicaciones',
    lawNumber: 18168,
    seedFile: '03-telecommunications-18168.json',
    shortName: 'Ley 18.168',
    titleEn: 'General Telecommunications Law (Law 18.168)',
  },
  {
    id: 'cl-ley-21521-fintech-open-finance',
    lawNumber: 21521,
    seedFile: '04-fintech-open-finance-21521.json',
    shortName: 'Ley 21.521',
    titleEn: 'Law 21.521 on Fintech and Open Finance',
  },
  {
    id: 'cl-ley-20285-transparencia',
    lawNumber: 20285,
    seedFile: '05-access-public-information-20285.json',
    shortName: 'Ley 20.285',
    titleEn: 'Law 20.285 on Access to Public Information',
  },
  {
    id: 'cl-ley-19799-firma-electronica',
    lawNumber: 19799,
    seedFile: '06-electronic-signatures-19799.json',
    shortName: 'Ley 19.799',
    titleEn: 'Law 19.799 on Electronic Documents and Electronic Signatures',
  },
  {
    id: 'cl-ley-21180-transformacion-digital',
    lawNumber: 21180,
    seedFile: '07-digital-transformation-21180.json',
    shortName: 'Ley 21.180',
    titleEn: 'Law 21.180 on Digital Transformation of the State',
  },
  {
    id: 'cl-ley-21096-constitucion-datos',
    lawNumber: 21096,
    seedFile: '08-constitutional-data-protection-21096.json',
    shortName: 'Ley 21.096',
    titleEn: 'Law 21.096 on Constitutional Protection of Personal Data',
  },
  {
    id: 'cl-ley-21663-infraestructura-critica',
    lawNumber: 21663,
    seedFile: '09-critical-infrastructure-21663.json',
    shortName: 'Ley 21.663',
    titleEn: 'Law 21.663 Cybersecurity Framework Law',
  },
  {
    id: 'cl-ley-19039-propiedad-industrial-secretos',
    lawNumber: 19039,
    seedFile: '10-industrial-property-trade-secrets-19039.json',
    shortName: 'Ley 19.039',
    titleEn: 'Law 19.039 on Industrial Property (Trade Secrets)',
  },
];
