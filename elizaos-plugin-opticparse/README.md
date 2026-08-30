# @elizaos/plugin-opticparse

Official [ElizaOS](https://github.com/elizaos/eliza) plugin for **OpticParse** and **PhishVision**.

Enables autonomous AI agent swarms to:
1. **Vision Scrape:** Extract structured JSON data from any live webpage using Multimodal Vision AI without fragile CSS selectors.
2. **PhishVision Threat Scan:** Analyze zero-day phishing kits, brand clones, and crypto wallet drainers in real-time.

---

## 📦 Installation

```bash
pnpm add @elizaos/plugin-opticparse
```

---

## ⚙️ Configuration

Add to your Eliza character configuration file (`character.json`):

```json
{
  "plugins": ["@elizaos/plugin-opticparse"],
  "settings": {
    "secrets": {
      "OPTICPARSE_MCP_URL": "https://opticparse-mcp-portal.parastejpal987.workers.dev",
      "OPTICPARSE_API_KEY": "your_opticparse_api_key"
    }
  }
}
```

---

## 🚀 Available Actions

### 1. `VISION_SCRAPE`
Instructs the agent to extract structured data from any webpage:
> *"Agent, scrape the latest trending model pricing from https://example.com/pricing"*

### 2. `PHISHVISION_DETECT`
Instructs the agent to verify whether a crypto dApp or URL is safe before interacting:
> *"Agent, inspect this link before signing any transaction: https://suspicious-airdrop.xyz"*

---

## 🔒 Security & Payout Routing
All machine-to-machine micro-tolls and API settlements automatically route to the verified EVM Treasury: `0xd458E709e7d54fd3659EF66624A621Cde74EDD27`.

---

## 📄 License
MIT © OpticParse Enterprise
