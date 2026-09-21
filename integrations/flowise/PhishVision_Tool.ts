/**
 * PhishVision Flowise Custom Tool Node
 * Real-Time Zero-Day Phishing & Cybersecurity Threat Scanner for Flowise
 */

import type { INode, INodeParams } from './OpticParse_Tool.ts';
import { normalizeTargetUrl, resolvePortalUrl } from './OpticParse_Tool.ts';

export class PhishVision_Tool implements INode {
    label = 'PhishVision Threat Scanner';
    name = 'phishVisionTool';
    version = 1.0;
    type = 'PhishVisionTool';
    icon = 'phishvision.svg';
    category = 'Tools';
    description = 'Real-time cybersecurity scanner detecting zero-day phishing, credential harvesting, brand impersonation, and cryptocurrency wallet drainers.';
    baseClasses = ['Tool', 'StructuredTool'];

    inputs: INodeParams[] = [
        {
            label: 'Target URL or Domain',
            name: 'target',
            type: 'string',
            placeholder: 'example.com or https://suspicious-login.xyz',
            description: 'The website URL or bare domain to inspect for security risks.'
        },
        {
            label: 'PhishVision API Key',
            name: 'apiKey',
            type: 'password',
            optional: true,
            description: 'Optional API key for higher throughput. Free trial quota included.'
        },
        {
            label: 'Portal URL',
            name: 'portalUrl',
            type: 'string',
            optional: true,
            default: 'https://opticparse-api.onrender.com',
            description: 'PhishVision gateway portal URL.'
        }
    ];

    async run(nodeData: any, input: string): Promise<string> {
        const rawTarget = nodeData?.inputs?.target || input;
        const apiKey = (nodeData?.inputs?.apiKey || '').trim();
        const portalUrl = resolvePortalUrl(nodeData?.inputs?.portalUrl, apiKey);
        const targetUrl = normalizeTargetUrl(rawTarget);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Flowise-PhishVision-Tool/1.0.0'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['X-API-Key'] = apiKey;
        }

        const endpoint = `${portalUrl}/phishvision/scan`;
        const payload = { url: targetUrl };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            redirect: 'manual'
        });

        if (response.status >= 300 && response.status < 400) {
            return 'Error: Gateway returned an unexpected redirect. Scan aborted to protect integrity.';
        }

        if (response.status === 404 || response.status === 405) {
            // Fallback to JSON-RPC MCP endpoint
            const mcpEndpoint = `${portalUrl}/mcp`;
            const rpcPayload = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'phishvision_detect',
                    arguments: { target_url: targetUrl }
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
                return `Error from PhishVision MCP: HTTP ${rpcResponse.status}`;
            }
            const rpcData = await rpcResponse.json();
            return typeof rpcData?.result === 'object' ? JSON.stringify(rpcData.result, null, 2) : String(rpcData?.result || '');
        }

        if (!response.ok) {
            return `Error from PhishVision: HTTP ${response.status} - ${await response.text()}`;
        }

        const data = await response.json();
        return typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    }
}

export default new PhishVision_Tool();
