"""
title: OpticParse & PhishVision Intelligence Tools
author: parastejpal987
author_url: https://github.com/parastejpal987-cmyk/opticparse
git_url: https://github.com/parastejpal987-cmyk/opticparse
description: Autonomous multimodal vision web scraper & real-time cybersecurity phishing detection scanner. Bypasses dynamic JS, bot challenges, and identifies zero-day impersonation threats.
version: 1.0.0
licence: MIT
requirements: httpx, pydantic
"""

import json
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlparse
import httpx
from pydantic import BaseModel, Field


class Tools:
    class Valves(BaseModel):
        OPTICPARSE_API_KEY: str = Field(
            default="",
            description="Optional OpticParse API key for higher rate limits. Free trial quota available by default.",
        )
        PORTAL_URL: str = Field(
            default="https://opticparse-api.onrender.com",
            description="OpticParse API Portal URL.",
        )
        TIMEOUT_SECONDS: int = Field(
            default=45,
            description="Network timeout in seconds for rendering and scanning.",
        )

    def __init__(self):
        self.valves = self.Valves()

    def _normalize_and_validate_url(self, target: str) -> str:
        clean = target.strip()
        if not clean:
            raise ValueError("Target URL or domain cannot be empty.")

        # If a scheme is explicitly provided, verify it is strictly http or https
        parsed_initial = urlparse(clean)
        if parsed_initial.scheme and parsed_initial.scheme not in ("http", "https"):
            raise ValueError(f"Invalid or unsupported URL scheme: {parsed_initial.scheme}")

        if not clean.startswith(("http://", "https://")):
            clean = f"https://{clean}"

        parsed = urlparse(clean)
        if not (parsed.scheme in ("http", "https") and parsed.netloc):
            raise ValueError(f"Invalid target URL or domain: {target}")

        return clean

    def _get_portal_url(self) -> str:
        portal = self.valves.PORTAL_URL.strip().rstrip("/")
        api_key = self.valves.OPTICPARSE_API_KEY.strip()

        # Enforce HTTPS if an API key is configured to protect credentials
        if api_key and portal.startswith("http://"):
            raise ValueError(
                "Insecure HTTP portal URL is not allowed when an API key is configured. Use HTTPS."
            )
        return portal

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "OpenWebUI-OpticParse-Tool/1.0.0",
        }
        api_key = self.valves.OPTICPARSE_API_KEY.strip()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["X-API-Key"] = api_key
        return headers

    async def opticparse_scrape(
        self,
        url: str,
        query: str = "",
        __event_emitter__: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> str:
        """
        Extract clean, structured web content and markdown from any URL using multimodal computer vision.
        Bypasses Cloudflare Turnstile, heavy JavaScript SPAs, and bot protections.

        :param url: The target website URL to scrape (e.g. https://news.ycombinator.com).
        :param query: Optional specific natural language query or instructions on what to extract.
        :return: Extracted structured markdown or JSON content.
        """
        try:
            target_url = self._normalize_and_validate_url(url)
            portal = self._get_portal_url()
            headers = self._get_headers()

            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": f"OpticParse rendering and extracting content from {target_url}...",
                            "done": False,
                        },
                    }
                )

            payload = {
                "url": target_url,
                "query": query or "Extract all primary text, articles, tables, and structured data.",
            }

            async with httpx.AsyncClient(
                timeout=float(self.valves.TIMEOUT_SECONDS),
                follow_redirects=False,
            ) as client:
                endpoint = f"{portal}/api/v1/parse"
                response = await client.post(endpoint, json=payload, headers=headers)

                # Fallback to MCP JSON-RPC call if REST returns 404/405
                if response.status_code in (404, 405):
                    mcp_endpoint = f"{portal}/mcp"
                    rpc_payload = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                        "params": {
                            "name": "opticparse_scrape",
                            "arguments": {
                                "target_url": target_url,
                                "extraction_query": query,
                            },
                        },
                    }
                    response = await client.post(mcp_endpoint, json=rpc_payload, headers=headers)

                if response.status_code in (301, 302, 307, 308):
                    return "Error: Gateway returned an unexpected redirect. Request aborted to prevent credential leakage."

                response.raise_for_status()
                data = response.json()

                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {
                                "description": "OpticParse extraction complete.",
                                "done": True,
                            },
                        }
                    )

                if isinstance(data, dict):
                    if "content" in data:
                        return str(data["content"])
                    if "result" in data:
                        return json.dumps(data["result"], indent=2)
                    return json.dumps(data, indent=2)
                return str(data)

        except Exception as e:
            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": f"OpticParse error: {str(e)}",
                            "done": True,
                        },
                    }
                )
            return f"Error executing OpticParse: {str(e)}"

    async def phishvision_scan(
        self,
        target: str,
        __event_emitter__: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> str:
        """
        Inspect a URL or domain for zero-day phishing, credential harvesting, brand impersonation, and wallet drainers.
        Scans visual layout, DOM anomalies, SSL/DNS records, and threat intelligence in real time.

        :param target: The website URL or bare domain to inspect (e.g. example.com or https://suspicious-login.xyz).
        :return: Comprehensive security audit report including risk score, verdict, and detected IOCs.
        """
        try:
            target_url = self._normalize_and_validate_url(target)
            portal = self._get_portal_url()
            headers = self._get_headers()

            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": f"PhishVision analyzing threat profile for {target_url}...",
                            "done": False,
                        },
                    }
                )

            payload = {"url": target_url}

            async with httpx.AsyncClient(
                timeout=float(self.valves.TIMEOUT_SECONDS),
                follow_redirects=False,
            ) as client:
                endpoint = f"{portal}/phishvision/scan"
                response = await client.post(endpoint, json=payload, headers=headers)

                # Fallback to MCP JSON-RPC call if REST returns 404/405
                if response.status_code in (404, 405):
                    mcp_endpoint = f"{portal}/mcp"
                    rpc_payload = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                        "params": {
                            "name": "phishvision_detect",
                            "arguments": {"target_url": target_url},
                        },
                    }
                    response = await client.post(mcp_endpoint, json=rpc_payload, headers=headers)

                if response.status_code in (301, 302, 307, 308):
                    return "Error: Gateway returned an unexpected redirect. Scan aborted to protect integrity."

                response.raise_for_status()
                data = response.json()

                if __event_emitter__:
                    await __event_emitter__(
                        {
                            "type": "status",
                            "data": {
                                "description": "PhishVision threat scan complete.",
                                "done": True,
                            },
                        }
                    )

                if isinstance(data, dict):
                    return json.dumps(data, indent=2)
                return str(data)

        except Exception as e:
            if __event_emitter__:
                await __event_emitter__(
                    {
                        "type": "status",
                        "data": {
                            "description": f"PhishVision error: {str(e)}",
                            "done": True,
                        },
                    }
                )
            return f"Error executing PhishVision scan: {str(e)}"
