# OpticParse & PhishVision Langflow Component Nodes

Native tool components for [Langflow](https://github.com/langflow-ai/langflow) enabling multimodal visual web scraping and real-time cybersecurity phishing scanning within visual agent flows.

## Components
1. **OpticParse Web Scraper (`OpticParseToolComponent`)**:
   - Autonomously renders JavaScript SPAs, bypasses Cloudflare bot protection, and extracts clean markdown/structured data without brittle CSS selectors.
2. **PhishVision Threat Scanner (`PhishVisionToolComponent`)**:
   - Audits URLs and bare domains for zero-day phishing, credential harvesting, brand impersonation, and wallet drainers in real-time.

## Security & Reliability
- Enforces HTTPS for custom portals when API keys are configured.
- Disables automatic HTTP redirects to safeguard credentials against cross-origin forwarding.
- Normalizes bare domains (`example.com` -> `https://example.com`).
- Features dual REST / JSON-RPC 2.0 MCP streaming fallback.
