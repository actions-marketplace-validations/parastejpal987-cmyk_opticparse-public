/**
 * OpticParse Flowise Custom Tool Node
 * Autonomous Multimodal Vision Web Scraper for Flowise Chatflows & Agents
 */

export interface INodeParams {
    label: string;
    name: string;
    type: string;
    default?: any;
    optional?: boolean;
    description?: string;
    placeholder?: string;
}

export interface INode {
    label: string;
    name: string;
    version: number;
    description: string;
    type: string;
    icon: string;
    category: string;
    baseClasses: string[];
    inputs: INodeParams[];
    run?(nodeData: any, input: string, options?: any): Promise<string>;
}

export function normalizeTargetUrl(target: string): string {
    const clean = (target || '').trim();
    if (!clean) {
        throw new Error('Target URL or domain cannot be empty.');
    }

    // Check scheme if provided
    const schemeMatch = clean.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        if (scheme !== 'http' && scheme !== 'https') {
            throw new Error(`Invalid or unsupported URL scheme: ${scheme}`);
        }
    }

    const normalized = clean.startsWith('http://') || clean.startsWith('https://')
        ? clean
        : `https://${clean}`;

    try {
        const parsed = new URL(normalized);
        if (!parsed.hostname) {
            throw new Error(`Invalid target URL or domain: ${target}`);
        }
    } catch {
        throw new Error(`Invalid target URL or domain: ${target}`);
    }

    return normalized;
}

export function resolvePortalUrl(portalUrl: string, apiKey: string): string {
    const portal = (portalUrl || 'https://opticparse-api.onrender.com').trim().replace(/\/+$/, '');
    if (apiKey && portal.startsWith('http://')) {
        throw new Error('Insecure HTTP portal URL is not allowed when an API key is configured. Use HTTPS.');
    }
    return portal;
}

export class OpticParse_Tool implements INode {
    label = 'OpticParse Web Scraper';
    name = 'opticParseTool';
    version = 1.0;
    type = 'OpticParseTool';
    icon = 'opticparse.svg';
    category = 'Tools';
    description = 'Autonomous vision scraper that renders modern Single Page Apps, solves dynamic JavaScript, and bypasses Cloudflare bot protection.';
    baseClasses = ['Tool', 'StructuredTool'];

    inputs: INodeParams[] = [
        {
            label: 'Target URL',
            name: 'url',
            type: 'string',
            placeholder: 'https://news.ycombinator.com',
            description: 'The website URL to scrape.'
        },
        {
            label: 'Extraction Query',
            name: 'query',
            type: 'string',
            optional: true,
            placeholder: 'Extract article headlines and links in markdown format',
            description: 'Natural language instruction defining what elements to extract.'
        },
        {
            label: 'OpticParse API Key',
            name: 'apiKey',
            type: 'password',
            optional: true,
            description: 'Optional API key for higher rate limits. Free trial quota available by default.'
        },
        {
            label: 'Portal URL',
            name: 'portalUrl',
            type: 'string',
            optional: true,
            default: 'https://opticparse-api.onrender.com',
            description: 'OpticParse gateway portal URL.'
        }
    ];

    async run(nodeData: any, input: string): Promise<string> {
        const rawUrl = nodeData?.inputs?.url || input;
        const query = nodeData?.inputs?.query || 'Extract all primary text, articles, tables, and structured data.';
        const apiKey = (nodeData?.inputs?.apiKey || '').trim();
        const portalUrl = resolvePortalUrl(nodeData?.inputs?.portalUrl, apiKey);
        const targetUrl = normalizeTargetUrl(rawUrl);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Flowise-OpticParse-Tool/1.0.0'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['X-API-Key'] = apiKey;
        }

        const endpoint = `${portalUrl}/api/v1/parse`;
        const payload = { url: targetUrl, query };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            redirect: 'manual'
        });

        if (response.status >= 300 && response.status < 400) {
            return 'Error: Gateway returned an unexpected redirect. Request aborted to prevent credential leakage.';
        }

        if (response.status === 404 || response.status === 405) {
            // Fallback to JSON-RPC MCP endpoint
            const mcpEndpoint = `${portalUrl}/mcp`;
            const rpcPayload = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'opticparse_scrape',
                    arguments: { target_url: targetUrl, extraction_query: query }
                }
            };
            const rpcResponse = await fetch(mcpEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(rpcPayload),
                redirect: 'manual'
            });
            if (rpcResponse.status >= 300 && rpcResponse.status < 400) {
                return 'Error: MCP Gateway returned an unexpected redirect.';
            }
            if (!rpcResponse.ok) {
                return `Error from OpticParse MCP: HTTP ${rpcResponse.status}`;
            }
            const rpcData = await rpcResponse.json();
            return typeof rpcData?.result === 'object' ? JSON.stringify(rpcData.result, null, 2) : String(rpcData?.result || '');
        }

        if (!response.ok) {
            return `Error from OpticParse: HTTP ${response.status} - ${await response.text()}`;
        }

        const data = await response.json();
        if (data && typeof data === 'object') {
            if (data.content) return String(data.content);
            if (data.result) return JSON.stringify(data.result, null, 2);
            return JSON.stringify(data, null, 2);
        }
        return String(data);
    }
}

export default new OpticParse_Tool();
