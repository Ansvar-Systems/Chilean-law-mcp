# Chilean Law MCP

Chilean law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add chilean-law --transport http https://chilean-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/chilean-law-mcp
```

## Data Sources

Official Chilean legislation from LeyChile (Biblioteca del Congreso Nacional), ingested via the public JSON service endpoint.
The local database includes a full Ley/Lei metadata index and full article-level text for the 10 core statutes in this MCP corpus.

To progressively ingest full article-level text for all indexed laws, run:
`npm run ingest:all-laws-fulltext -- --limit 50` (resumable, checkpointed).

## License

Apache-2.0
