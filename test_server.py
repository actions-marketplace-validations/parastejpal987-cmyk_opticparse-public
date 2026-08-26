from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from server import ScrapeRequest, clean_json_response


def test_clean_json_response():
    # 1. Simple valid JSON
    assert clean_json_response('{"key": "value"}') == '{"key": "value"}'
    
    # 2. Markdown formatting
    assert clean_json_response('```json\n{"key": "value"}\n```') == '{"key": "value"}'
    assert clean_json_response('```\n{"key": "value"}\n```') == '{"key": "value"}'
    
    # 3. Leading and trailing text
    assert clean_json_response('Some thoughts here. {"key": "value"} And more thoughts.') == '{"key": "value"}'
    
    # 4. JSON array
    assert clean_json_response('Prefix [1, 2, 3] Suffix') == '[1, 2, 3]'
    
    # 5. Fallback when no braces found
    assert clean_json_response('Plain text response') == 'Plain text response'


class AsyncContextManagerMock:
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj
    async def __aenter__(self):
        return self.mock_obj
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.mark.asyncio
async def test_vision_scrape_endpoint():
    """Test the vision-scrape endpoint with mocked Playwright and AI rotation."""
    # Ensure browserless key is not set so it launches local chromium
    env_clean = {k: v for k, v in os.environ.items() if k != "BROWSERLESS_API_KEY"}
    with patch.dict(os.environ, env_clean, clear=True):  # noqa: SIM117
        with patch('server.call_ai_with_rotation', new_callable=AsyncMock) as mock_ai_rotation:
            with patch('server.async_playwright') as mock_playwright_func:
                with patch('server.get_cache', new_callable=AsyncMock) as mock_get_cache:
                    mock_get_cache.return_value = None
                    # Mock AI rotation to return valid JSON
                    mock_ai_rotation.return_value = '{"extracted_data": "value"}'

                    # Mock Playwright browser / page chain
                    mock_page = AsyncMock()
                    mock_page.screenshot.return_value = b"fake_screenshot_bytes"
                    mock_page.url = "https://example.com"

                    mock_context = AsyncMock()
                    mock_context.new_page.return_value = mock_page

                    mock_browser = AsyncMock()
                    mock_browser.new_context.return_value = mock_context

                    mock_playwright = MagicMock()
                    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)

                    mock_playwright_func.return_value = AsyncContextManagerMock(mock_playwright)

                    # Build request
                    request_data = ScrapeRequest(
                        target_url="https://example.com",
                        extraction_query="Extract info",
                        viewport_width=1920,
                        viewport_height=1080,
                        wait_until="load",
                        timeout=15000
                    )

                    from fastapi import Request

                    from server import vision_scrape
                    mock_request = MagicMock(spec=Request)
                    response = await vision_scrape(request=mock_request, body=request_data, api_key={"user_id": "test_user"})

                    # Assertions
                    assert response.status_code == 200
                    assert response.media_type == "application/json"
                    assert b"extracted_data" in response.body

                    # Verify mocks were called
                    mock_playwright.chromium.launch.assert_called_once_with(
                        headless=True,
                        executable_path=None,
                        args=[
                            "--disable-dev-shm-usage",
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-gpu"
                        ]
                    )
                    mock_page.set_viewport_size.assert_called_once_with({"width": 1920, "height": 1080})
                    mock_page.goto.assert_called_once_with("https://example.com", wait_until="load", timeout=15000)
                    mock_page.screenshot.assert_called_once_with(full_page=True, type="png")
                    mock_ai_rotation.assert_called_once()


import os

from fastapi import HTTPException

from server import get_api_key


def make_mock_request():
    req = MagicMock()
    req.url.path = "/test"
    req.state = MagicMock()
    return req


@pytest.mark.asyncio
async def test_get_api_key_missing_header():
    """No key provided -> should return 402 Autonomous Machine Paywall for AI agents."""
    with patch.dict(os.environ, {"SUPABASE_URL": "https://supabase"}, clear=True):  # noqa: SIM117
        with patch("server.SUPABASE_URL", "https://supabase"):
            req = make_mock_request()
            with pytest.raises(HTTPException) as exc_info:
                await get_api_key(request=req, api_key=None)
            assert exc_info.value.status_code == 402
            assert "Payment Required" in str(exc_info.value.detail)

@pytest.mark.asyncio
async def test_get_api_key_invalid_format():
    """Invalid key format provided -> should return 401."""
    req = make_mock_request()
    with pytest.raises(HTTPException) as exc_info:
        await get_api_key(request=req, api_key="invalid_format_key")
    assert exc_info.value.status_code == 401

@pytest.mark.asyncio
async def test_get_api_key_dev_mode():
    """No env vars configured at all -> dev mode, should allow."""
    env_clean = {k: v for k, v in os.environ.items()
                 if k not in ("SUPABASE_URL",)}
    env_clean["MOCK_AUTH"] = "true"
    with patch.dict(os.environ, env_clean, clear=True):  # noqa: SIM117
        with patch("server.SUPABASE_URL", ""):
            req = make_mock_request()
            result = await get_api_key(request=req, api_key=None)
            assert result["user_id"] == "dev"

