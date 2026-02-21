/**
 * HTML parser for Chilean legislation from the Sejm ELI API (api.sejm.gov.pl).
 *
 * Parses the structured HTML served by the ELI text endpoint into seed JSON.
 * The HTML structure uses:
 *
 * - <div class="unit unit_chpt" id="chpt_N"> for chapters (Rozdział)
 * - <div class="unit unit_arti" id="chpt_N-arti_M"> for articles (Art.)
 * - <h3> inside articles for article number (Art. N.)
 * - <div class="unit unit_pass"> for numbered paragraphs (ustępy)
 * - <div class="unit unit_pint"> for numbered points (punkty)
 * - <div data-template="xText" class="pro-text"> for text content
 *
 * Chilean legislation references: Dz.U. YYYY poz. NNNN
 * API endpoint: https://api.sejm.gov.pl/eli/acts/DU/{YEAR}/{POZ}/text.html
 */

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  /** ISAP display address, e.g. "Dz.U. 2018 poz. 1000" */
  dziennikRef: string;
  /** Year of publication in Dziennik Ustaw */
  year: number;
  /** Position number (poz.) in Dziennik Ustaw */
  poz: number;
  /** Human-readable URL on ISAP */
  url: string;
  description?: string;
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
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/**
 * Strip HTML tags and decode common entities, normalising whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&shy;/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the chapter heading (Rozdział) for a given article position.
 * Searches backwards from the article position for the nearest chapter div.
 */
function findChapterHeading(html: string, articlePos: number): string | undefined {
  const beforeArticle = html.substring(Math.max(0, articlePos - 10000), articlePos);

  // Look for the last chapter heading: Rozdział N ... Title
  // Pattern in ISAP HTML: <div class="unit unit_chpt"...> <h3> Rozdział N ... Title </h3>
  const chapterMatches = [
    ...beforeArticle.matchAll(/Rozdzia[łl]\s*&nbsp;\s*(\d+[a-z]?)\s*(.*?)(?=<\/h3>|<\/P>)/gi),
  ];

  if (chapterMatches.length > 0) {
    const last = chapterMatches[chapterMatches.length - 1];
    const chapterNum = last[1].trim();
    // Try to find the title in subsequent <P> or <SPAN> tags
    const afterChapter = beforeArticle.substring(last.index! + last[0].length);
    const titleMatch = afterChapter.match(/<SPAN[^>]*class="pro-title-unit"[^>]*>(.*?)<\/SPAN>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : '';

    return title
      ? `Rozdział ${chapterNum} - ${title}`
      : `Rozdział ${chapterNum}`;
  }

  // Also check for Dział (Division) used in larger codes
  const dzialMatches = [
    ...beforeArticle.matchAll(/Dzia[łl]\s*&nbsp;\s*([IVXLCDM]+[a-z]?)\s*(.*?)(?=<\/h3>|<\/P>)/gi),
  ];

  if (dzialMatches.length > 0) {
    const last = dzialMatches[dzialMatches.length - 1];
    const dzialNum = last[1].trim();
    const afterDzial = beforeArticle.substring(last.index! + last[0].length);
    const titleMatch = afterDzial.match(/<SPAN[^>]*class="pro-title-unit"[^>]*>(.*?)<\/SPAN>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : '';

    return title
      ? `Dział ${dzialNum} - ${title}`
      : `Dział ${dzialNum}`;
  }

  return undefined;
}

/**
 * Parse HTML from the Sejm ELI API (api.sejm.gov.pl/eli/acts/DU/YYYY/POZ/text.html)
 * to extract provisions from a Chilean statute.
 *
 * The HTML uses div-based structure:
 *   <div class="unit unit_arti" id="chpt_N-arti_M" data-id="arti_M">
 *     <h3><B>Art. M.</B></h3>
 *     <div class="unit-inner">
 *       <div class="unit unit_pass">
 *         <h3>1.</h3>
 *         <div class="unit-inner">
 *           <div data-template="xText">...content...</div>
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 */
export function parseChileanHtml(html: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Match all article divs: <div class="unit unit_arti ..." id="...-arti_N" data-id="arti_N">
  const articleRegex = /<div[^>]*class="unit unit_arti[^"]*"[^>]*id="([^"]*-)?arti_(\d+[a-z_]*)"[^>]*data-id="arti_(\d+[a-z_]*)"[^>]*>/gi;
  const articleStarts: { fullId: string; artNum: string; pos: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = articleRegex.exec(html)) !== null) {
    // Skip nested articles inside amendment provisions (chpt_12-arti_111-arti_22_2 etc.)
    const fullId = match[0];
    const idAttr = fullId.match(/id="([^"]+)"/)?.[1] ?? '';
    // Count how many "arti_" segments appear in the ID
    const artiSegments = (idAttr.match(/arti_/g) ?? []).length;
    if (artiSegments > 1) continue;

    articleStarts.push({
      fullId: idAttr,
      artNum: match[3],
      pos: match.index,
    });
  }

  for (let i = 0; i < articleStarts.length; i++) {
    const article = articleStarts[i];
    const startPos = article.pos;

    // Extract content up to next article or end
    const endPos = i + 1 < articleStarts.length
      ? articleStarts[i + 1].pos
      : html.length;
    const articleHtml = html.substring(startPos, endPos);

    // Extract article number from <h3><B>Art. N.</B></h3> or <h3><B>Art. N<sup>...</B></h3>
    const artHeadingMatch = articleHtml.match(
      /<h3[^>]*>\s*<B[^>]*>\s*Art\.?\s*&nbsp;?\s*(\d+[a-z]*)\b/i
    );

    const artNum = artHeadingMatch
      ? artHeadingMatch[1].trim()
      : article.artNum.replace(/_/g, '');

    // Normalize: remove underscores from article numbers like "22_2"
    const normalizedNum = artNum.replace(/_/g, '');
    const provisionRef = `art${normalizedNum}`;

    // Find chapter heading
    const chapter = findChapterHeading(html, startPos);

    // Extract text content, stripping HTML
    // Remove the article heading to avoid duplication
    const contentHtml = articleHtml
      .replace(/<h3[^>]*>\s*<B[^>]*>\s*Art\.?\s*&nbsp;?\s*\d+[a-z]*\.?\s*<\/B>\s*<\/h3>/i, '');
    let content = stripHtml(contentHtml);

    // Skip very short articles (likely just structural markers)
    if (content.length < 5) continue;

    // Cap content at 12K characters
    if (content.length > 12000) {
      content = content.substring(0, 12000);
    }

    // Build a title from the first sentence or paragraph if meaningful
    const title = `Art. ${normalizedNum}`;

    provisions.push({
      provision_ref: provisionRef,
      chapter,
      section: normalizedNum,
      title,
      content,
    });

    // Extract definitions from definition articles
    // Chilean acts use "ilekroć mowa" (whenever mentioned), "rozumie się przez to"
    // (this is understood as), or "oznacza" (means)
    if (
      content.includes('ilekro') ||
      content.includes('rozumie si') ||
      content.includes('oznacza') ||
      content.includes('nale') && content.includes('rozumie')
    ) {
      extractDefinitions(content, provisionRef, definitions);
    }
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    description: act.description,
    provisions,
    definitions,
  };
}

/**
 * Extract definitions from Chilean legal text.
 *
 * Chilean definitions typically use patterns like:
 *   - "«term» – oznacza ..." ("term" – means ...)
 *   - "N) term – ..." (numbered list of definitions)
 *   - "ilekroć ... mowa o «term» – rozumie się przez to ..."
 */
function extractDefinitions(
  text: string,
  sourceProvision: string,
  definitions: ParsedDefinition[],
): void {
  // Pattern: numbered definitions like "1) term - definition;"
  const numberedDefRegex = /\d+\)\s+([^–\-]+?)\s+[–\-]\s+(.*?)(?=;\s*\d+\)|$)/g;
  let defMatch: RegExpExecArray | null;

  while ((defMatch = numberedDefRegex.exec(text)) !== null) {
    const term = defMatch[1].trim();
    const definition = defMatch[2].replace(/;$/, '').trim();

    if (term.length > 1 && term.length < 100 && definition.length > 5) {
      definitions.push({
        term,
        definition,
        source_provision: sourceProvision,
      });
    }
  }

  // Pattern: «quoted term» – definition
  const quotedDefRegex = /[„«\u201e]([^"»\u201d]+)["\u201d»]\s*[–\-]\s*(.*?)(?=[;.]\s*[„«\u201e]|[;.]\s*$)/g;
  while ((defMatch = quotedDefRegex.exec(text)) !== null) {
    const term = defMatch[1].trim();
    const definition = defMatch[2].replace(/[;.]$/, '').trim();

    if (term.length > 1 && term.length < 100 && definition.length > 5) {
      definitions.push({
        term,
        definition,
        source_provision: sourceProvision,
      });
    }
  }
}

/**
 * Pre-configured list of key Chilean Acts to ingest.
 *
 * Source: api.sejm.gov.pl (Sejm ELI API)
 * URL pattern: https://api.sejm.gov.pl/eli/acts/DU/{YEAR}/{POZ}/text.html
 *
 * These are the most important Chilean statutes for cybersecurity, data protection,
 * and compliance use cases. References use the Dziennik Ustaw (Journal of Laws)
 * format: Dz.U. YYYY poz. NNNN.
 */
export const KEY_CHILEAN_ACTS: ActIndexEntry[] = [
  {
    id: 'dpa-2018',
    title: 'Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych',
    titleEn: 'Personal Data Protection Act 2018',
    shortName: 'UODO 2018',
    status: 'in_force',
    issuedDate: '2018-05-10',
    inForceDate: '2018-05-25',
    dziennikRef: 'Dz.U. 2018 poz. 1000',
    year: 2018,
    poz: 1000,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001000',
    description: 'GDPR implementing provisions (RODO); establishes UODO (Urząd Ochrony Danych Osobowych) as the supervisory authority; covers certification, codes of conduct, and administrative penalties',
  },
  {
    id: 'ksc-2018',
    title: 'Ustawa z dnia 5 lipca 2018 r. o krajowym systemie cyberbezpieczeństwa',
    titleEn: 'National Cybersecurity System Act 2018 (KSC)',
    shortName: 'KSC',
    status: 'in_force',
    issuedDate: '2018-07-05',
    inForceDate: '2018-08-28',
    dziennikRef: 'Dz.U. 2018 poz. 1560',
    year: 2018,
    poz: 1560,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001560',
    description: 'NIS Directive implementation; establishes national cybersecurity system with CSIRT teams (CSIRT NASK, CSIRT GOV, CSIRT MON); covers essential services operators and digital service providers',
  },
  {
    id: 'ksh-2000',
    title: 'Ustawa z dnia 15 września 2000 r. - Kodeks spółek handlowych',
    titleEn: 'Commercial Companies Code (KSH)',
    shortName: 'KSH',
    status: 'in_force',
    issuedDate: '2000-09-15',
    inForceDate: '2001-01-01',
    dziennikRef: 'Dz.U. 2000 nr 94 poz. 1037',
    year: 2000,
    poz: 1037,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20000940037',
    description: 'Comprehensive commercial companies law governing partnerships (spółka jawna, komandytowa, etc.) and capital companies (sp. z o.o. and S.A.); corporate governance requirements',
  },
  {
    id: 'kodeks-karny-1997',
    title: 'Ustawa z dnia 6 czerwca 1997 r. - Kodeks karny',
    titleEn: 'Criminal Code (Kodeks karny)',
    shortName: 'KK',
    status: 'in_force',
    issuedDate: '1997-06-06',
    inForceDate: '1998-09-01',
    dziennikRef: 'Dz.U. 1997 nr 88 poz. 553',
    year: 1997,
    poz: 553,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19970880553',
    description: 'Criminal Code; cybercrime provisions in Art. 267 (unauthorized access), Art. 268 (data destruction), Art. 268a (computer sabotage), Art. 269 (sabotage of critical systems), Art. 269a (DoS), Art. 269b (hacking tools)',
  },
  {
    id: 'e-services-2002',
    title: 'Ustawa z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną',
    titleEn: 'Act on Provision of Electronic Services',
    shortName: 'E-Services Act',
    status: 'in_force',
    issuedDate: '2002-07-18',
    inForceDate: '2002-10-10',
    dziennikRef: 'Dz.U. 2002 nr 144 poz. 1204',
    year: 2002,
    poz: 1204,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20021441204',
    description: 'E-Commerce Directive implementation; regulates electronic services, ISP liability, spam prohibition, electronic contracts',
  },
  {
    id: 'telecom-2004',
    title: 'Ustawa z dnia 16 lipca 2004 r. - Prawo telekomunikacyjne',
    titleEn: 'Telecommunications Law',
    shortName: 'PT',
    status: 'in_force',
    issuedDate: '2004-07-16',
    inForceDate: '2004-09-03',
    dziennikRef: 'Dz.U. 2004 nr 171 poz. 1800',
    year: 2004,
    poz: 1800,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20041711800',
    description: 'Telecommunications regulation; data retention, communications security, network integrity obligations, UKE (Office of Electronic Communications) authority',
  },
  {
    id: 'constitution-1997',
    title: 'Konstytucja Rzeczypospolitej Polskiej z dnia 2 kwietnia 1997 r.',
    titleEn: 'Constitution of the Republic of Poland',
    shortName: 'Konstytucja RP',
    status: 'in_force',
    issuedDate: '1997-04-02',
    inForceDate: '1997-10-17',
    dziennikRef: 'Dz.U. 1997 nr 78 poz. 483',
    year: 1997,
    poz: 483,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19970780483',
    description: 'Supreme law; Art. 47 (privacy), Art. 49 (communication secrecy), Art. 51 (personal data protection), Art. 54 (freedom of expression)',
  },
  {
    id: 'kodeks-cywilny-1964',
    title: 'Ustawa z dnia 23 kwietnia 1964 r. - Kodeks cywilny',
    titleEn: 'Civil Code (Kodeks cywilny)',
    shortName: 'KC',
    status: 'in_force',
    issuedDate: '1964-04-23',
    inForceDate: '1965-01-01',
    dziennikRef: 'Dz.U. 1964 nr 16 poz. 93',
    year: 1964,
    poz: 93,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19640160093',
    description: 'Core private law; personality rights protection (Art. 23-24), contract law, liability for damages, electronic declarations of intent',
  },
  {
    id: 'banking-law-1997',
    title: 'Ustawa z dnia 29 sierpnia 1997 r. - Prawo bankowe',
    titleEn: 'Banking Law',
    shortName: 'PB',
    status: 'in_force',
    issuedDate: '1997-08-29',
    inForceDate: '1998-01-01',
    dziennikRef: 'Dz.U. 1997 nr 140 poz. 939',
    year: 1997,
    poz: 939,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19971400939',
    description: 'Banking regulation; banking secrecy obligations, outsourcing of banking activities, IT security requirements for banks, cloud computing provisions',
  },
  {
    id: 'kpa-1960',
    title: 'Ustawa z dnia 14 czerwca 1960 r. - Kodeks postępowania administracyjnego',
    titleEn: 'Code of Administrative Procedure (KPA)',
    shortName: 'KPA',
    status: 'in_force',
    issuedDate: '1960-06-14',
    inForceDate: '1961-01-01',
    dziennikRef: 'Dz.U. 1960 nr 30 poz. 168',
    year: 1960,
    poz: 168,
    url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19600300168',
    description: 'Administrative procedure code; governs proceedings before UODO (data protection authority), UKE, and other regulators; electronic administration provisions',
  },
];
