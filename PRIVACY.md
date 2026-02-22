# Privacy & Client Confidentiality

## Remote Endpoint

When using the hosted endpoint, your queries are processed by:

- **Vercel** (serverless infrastructure) — see Vercel's privacy policy
- **Your AI client** (Claude, ChatGPT, etc.) — see their respective privacy policies

No query data is logged, stored, or retained by the MCP server itself. The server
is stateless — each request is processed and discarded.

## Local Installation

For maximum privacy, use the local npm package:

    npx @ansvar/chilean-law-mcp

This runs entirely on your machine. No network requests are made except to your
local AI client.

## Professional Use

If you are a lawyer or legal professional handling privileged or confidential
client matters:

- **Use the local npm package** — queries never leave your machine
- **Do not use the remote endpoint** for matters involving client confidentiality
- Consult your jurisdiction's professional conduct rules regarding AI tool usage

## Data Collection

This MCP server:
- Does **not** collect, store, or transmit user queries
- Does **not** use cookies, analytics, or tracking
- Does **not** require authentication or user accounts
- Contains **only** publicly available legislation
