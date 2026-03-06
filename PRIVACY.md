# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Chilean bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Chilean bar rules (Colegio de Abogados de Chile) require strict confidentiality (secreto profesional) and data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/chilean-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/chilean-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://chilean-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (texto de la ley), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Chile)

### Chilean Bar Association Rules

Chilean lawyers (abogados y abogadas) are bound by strict confidentiality rules under the Código de Ética Profesional of the Colegio de Abogados de Chile.

#### Secreto Profesional (Duty of Confidentiality)

- All client communications are privileged under the Código de Ética Profesional
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of confidentiality may result in disciplinary proceedings (proceso disciplinario ante el Colegio)

### Chilean Data Protection Law (Ley N° 19.628 / Reform)

Under Chilean data protection rules and the ongoing modernization reform:

- You are responsible for processing personal data when using AI tools on client matters
- Cloud AI service providers may qualify as data processors
- Consider your obligations under the personal data protection framework
- The Consejo para la Transparencia (cplt.cl) provides guidance on data handling

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does Article 1437 of the Código Civil say about sources of obligations?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the criminal penalties for insider trading under Chilean securities law?"
```

- Query pattern may reveal you are working on a specific matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases (LegalPublishing, Abeledo Perrot) with proper data processing agreements

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms (Abogados Independientes / Estudios Jurídicos Pequeños)

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (LegalPublishing, Abeledo Perrot, Manz) with proper agreements

### For Large Firms / Corporate Legal (Grandes Firmas / Departamentos Jurídicos)

1. Negotiate data processing agreements with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns

### For Government / Public Sector (Organismos Públicos)

1. Use self-hosted deployment, no external APIs
2. Follow Chilean government IT security requirements (CSIRT)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Chilean-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Colegio de Abogados Guidance**: Consult the Colegio de Abogados de Chile for ethics guidance on AI tool use

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0
