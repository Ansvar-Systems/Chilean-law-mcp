# Chilean Law MCP Server

**The BCN alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fchilean-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/chilean-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Chilean-law-mcp?style=social)](https://github.com/Ansvar-Systems/Chilean-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Chilean-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Chilean-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Chilean-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Chilean-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/INTEGRATION_GUIDE.md)

Query Chilean legislation -- from the Ley 19.628 de Protección de la Vida Privada and Código Penal to the Código Civil, Ley de Delitos Informáticos, and more -- directly from Claude, Cursor, or any MCP-compatible client.

Si estás construyendo herramientas legales, herramientas de cumplimiento normativo, o haciendo investigación jurídica chilena, esta es tu base de datos de referencia verificada.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Por qué existe esto / Why This Exists

La investigación jurídica chilena está dispersa entre la Biblioteca del Congreso Nacional (BCN), el portal leychile.cl, y el Diario Oficial. Ya seas:
- Un **abogado** validando citas en un escrito o contrato
- Un **oficial de cumplimiento** verificando obligaciones bajo la Ley 19.628 o la nueva Ley 21.719 de protección de datos personales
- Un **desarrollador legal tech** construyendo herramientas sobre derecho chileno
- Un **investigador** trazando la evolución legislativa desde el BCN

...no deberías necesitar docenas de pestañas del navegador y referencias cruzadas manuales. Pregunta a Claude. Obtén la disposición exacta. Con contexto.

This MCP server makes Chilean law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://chilean-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add chilean-law --transport http https://chilean-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chilean-law": {
      "type": "url",
      "url": "https://chilean-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "chilean-law": {
      "type": "http",
      "url": "https://chilean-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/chilean-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chilean-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/chilean-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "chilean-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/chilean-law-mcp"]
    }
  }
}
```

## Example Queries

Una vez conectado, pregunta de forma natural (consultas en español):

- *"¿Qué dice la Ley 19.628 sobre protección de datos personales?"*
- *"¿Está vigente la Ley 21.719 sobre protección de datos personales?"*
- *"Buscar disposiciones sobre 'responsabilidad civil' en el Código Civil chileno"*
- *"¿Qué dice el Código Penal sobre delitos informáticos?"*
- *"Buscar 'sociedad anónima' en el derecho societario chileno"*
- *"¿Qué dice la Ley de Defensa del Consumidor (Ley 19.496) sobre cláusulas abusivas?"*
- *"¿Cómo se cita correctamente el artículo 5 de la Ley 19.628?"*
- *"Buscar leyes chilenas que regulen la firma electrónica"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | Ingestion in progress | Laws from BCN (bcn.cl) and leychile.cl |
| **Provisions** | Ingestion in progress | Full-text searchable with FTS5 |
| **Language** | Spanish | Chile's official language |
| **Daily Updates** | Automated | Freshness checks against BCN / leychile.cl |

> **Coverage note:** The Chilean law database is actively being built. The MCP server infrastructure is production-ready. Provision counts will be updated as ingestion completes. The remote endpoint is live and returns available data.

**Verified data only** -- every citation is validated against official sources (BCN / leychile.cl). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from BCN (Biblioteca del Congreso Nacional) and leychile.cl
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law number and article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
BCN / leychile.cl --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                        ^                        ^
                 Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Buscar en BCN por número de ley | Buscar en español: *"protección de datos consentimiento"* |
| Navegar artículos manualmente | Obtener la disposición exacta con contexto |
| Referencias cruzadas manuales entre leyes | `build_legal_stance` agrega de múltiples fuentes |
| "¿Está esta ley vigente?" -- verificar manualmente | `check_currency` -- respuesta en segundos |
| Buscar marcos internacionales -- revisar documentos OEA | `get_eu_basis` -- instrumentos internacionales vinculados |
| Sin API, sin integración | Protocolo MCP -- nativo para IA |

**Tradicional:** Buscar en leychile.cl --> Descargar PDF --> Ctrl+F --> Verificar en Diario Oficial --> Repetir

**This MCP:** *"¿Qué dice la nueva Ley 21.719 sobre protección de datos personales respecto al consentimiento?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by law number and article |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes for a legal topic |
| `format_citation` | Format citations per Chilean conventions (full/short/pinpoint) |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `list_sources` | List all available statutes with metadata and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international instruments that Chilean laws align with |
| `get_chilean_implementations` | Find Chilean laws implementing a specific international standard |
| `search_eu_implementations` | Search international documents with Chilean alignment counts |
| `get_provision_eu_basis` | Get international law references for a specific Chilean provision |
| `validate_eu_compliance` | Check alignment status of Chilean laws against international standards |

---

## International Law Alignment

Chile is an active member of the **Organization of American States (OAS)** and a **MERCOSUR associate member**, participating in regional legal harmonization frameworks.

| Framework | Relevance |
|-----------|-----------|
| **OAS Inter-American Conventions** | Chile has ratified the Inter-American Convention against Corruption and other OAS instruments |
| **MERCOSUR** | Associate member -- participates in Southern Common Market trade and regulatory frameworks |
| **OECD** | Chile joined OECD in 2010 -- implementation of OECD anti-bribery, tax, and governance standards |
| **Trans-Pacific Partnership** | Chile is a CPTPP member -- digital trade, IP, and data governance obligations |

Chile's new data protection law (Ley 21.719, approved 2024) significantly updates the framework established by Ley 19.628, moving toward GDPR-equivalent standards. The international bridge tools help identify where Chilean law aligns with international standards.

> **Note:** Chile is not an EU adequacy jurisdiction under GDPR, but the new Ley 21.719 substantially modernizes Chilean data protection to align with global best practices. The international tools help identify alignment relationships.

---

## Data Sources & Freshness

All content is sourced from authoritative Chilean legal databases:

- **[BCN -- Biblioteca del Congreso Nacional](https://www.bcn.cl/)** -- Official legislative library and research arm
- **[leychile.cl](https://www.leychile.cl/)** -- Official consolidated statute portal (BCN)
- **[Diario Oficial](https://www.diariooficial.interior.gob.cl/)** -- Chile's Official Gazette

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Biblioteca del Congreso Nacional de Chile |
| **Retrieval method** | BCN / leychile.cl consolidated statute database |
| **Language** | Spanish |
| **License** | Open access (official government sources) |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors BCN/leychile.cl for changes:

| Check | Method |
|-------|--------|
| **Law amendments** | Drift detection against known provision anchors |
| **New laws** | Comparison against BCN index |
| **Repealed laws** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from BCN/leychile.cl (official Chilean legal publications). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources (leychile.cl / Diario Oficial) for court filings
> - **Ley 21.719** (new data protection law) may have transitional provisions -- verify current status against BCN
> - **International cross-references** reflect alignment relationships, not binding obligations

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

> For guidance from your bar association: **Colegio de Abogados de Chile**

---

## Documentation

- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** -- Detailed integration documentation
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Chilean-law-mcp
cd Chilean-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                          # Ingest statutes from BCN/leychile.cl
npm run ingest:all-laws-fulltext        # Full-text ingestion of all laws
npm run fetch:all-laws-index            # Fetch laws index from BCN
npm run build:db                        # Rebuild SQLite database
npm run drift:detect                    # Run drift detection against anchors
npm run verify:provisions               # Verify provision coverage
npm run check-updates                   # Check for amendments and new laws
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** Optimized SQLite (efficient, portable)
- **Reliability:** Production-ready ingestion pipeline

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/chilean-law-mcp (This Project)
**Query Chilean legislation directly from Claude** -- Ley 19.628, Ley 21.719, Código Civil, Código Penal, and more. `npx @ansvar/chilean-law-mcp`

### [@ansvar/peruvian-law-mcp](https://github.com/Ansvar-Systems/Peruvian-law-mcp)
**Query Peruvian legislation** -- Ley 29733, Código Civil, Código Penal, and more. `npx @ansvar/peruvian-law-mcp`

### [@ansvar/uruguayan-law-mcp](https://github.com/Ansvar-Systems/Uruguayan-law-mcp)
**Query Uruguayan legislation** -- Ley 18.331, Código Civil, Código Penal, and more. `npx @ansvar/uruguayan-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Africa, the Americas, Europe, Asia, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Full statute corpus ingestion from BCN
- Supreme Court (Corte Suprema de Chile) case law
- Ley 21.719 (new data protection law) full coverage
- Historical statute versions and Diario Oficial amendment tracking

---

## Roadmap

- [x] MCP server infrastructure (production-ready)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Full statute corpus ingestion from BCN/leychile.cl
- [ ] Court case law (Corte Suprema de Chile)
- [ ] Ley 21.719 full-text with transitional provisions
- [ ] Historical statute versions (Diario Oficial tracking)
- [ ] OECD and OAS cross-reference database

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{chilean_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Chilean Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Chilean-law-mcp},
  note = {Chilean legislation sourced from Biblioteca del Congreso Nacional (BCN) and leychile.cl}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes:** Biblioteca del Congreso Nacional de Chile (open access)
- **International Metadata:** Public domain treaty databases

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server brings Chile's official legislation into any AI client -- no browser tabs, no PDFs, no manual cross-referencing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
