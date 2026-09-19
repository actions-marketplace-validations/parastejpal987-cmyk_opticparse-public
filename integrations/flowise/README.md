# OpticParse & PhishVision Flowise Custom Components

Integrate multimodal vision web scraping and real-time cybersecurity phishing threat detection directly into your visual Flowise canvas and Chatflows.

## Included Nodes
- **`OpticParse Web Scraper` (`OpticParse_Tool.ts`)**: Multimodal visual web extraction node that renders complex JavaScript, Single Page Apps, and bypasses Cloudflare bot protection.
- **`PhishVision Threat Scanner` (`PhishVision_Tool.ts`)**: Real-time zero-day cybersecurity auditor checking domains for brand impersonation, credential harvesting, and smart contract drainers.

## Installation in Flowise

### Method 1: Using Custom Nodes Directory
1. Locate your Flowise instance installation directory or Docker mount path.
2. Copy `OpticParse_Tool.ts` and `PhishVision_Tool.ts` into Flowise's `packages/components/nodes/tools/` folder.
3. Restart Flowise (`pnpm start` or restart the Docker container).
4. Both nodes will now appear in the Flowise sidebar under **Tools**.

### Method 2: Flowise Market / Extension Loading
In the Flowise UI, navigate to **Custom Tools**, click **Load Component**, and select the `OpticParse_Tool.ts` or `PhishVision_Tool.ts` file.

## Configuration Parameters
- **Target URL / Domain**: The website URL or bare domain to inspect.
- **Extraction Query**: (OpticParse only) Natural language instruction defining what elements or markdown tables to parse.
- **API Key**: (Optional) For high-throughput quotas. Free trial quota available by default.
- **Portal URL**: Default `https://opticparse-api.onrender.com`.
