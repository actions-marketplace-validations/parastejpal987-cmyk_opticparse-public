"""
Tests for OpticParse Python SDK v1.0.0
"""

import unittest
from opticparse import (
    OpticParse,
    OpticParseClient,
    OpticParseError,
    AuthenticationError,
    RateLimitError,
    TemplateNotFoundError,
    __version__,
)


class TestOpticParseSDK(unittest.TestCase):

    def test_client_initialization(self):
        client = OpticParse(api_key="test_key_123", max_retries=5, timeout=15.0)
        self.assertEqual(client.api_key, "test_key_123")
        self.assertEqual(client.max_retries, 5)
        self.assertEqual(client.timeout, 15.0)
        self.assertEqual(client.base_url, OpticParse.DEFAULT_BASE_URL)

    def test_client_headers(self):
        client = OpticParse(api_key="test_key_123")
        headers = client._get_headers()
        self.assertEqual(headers["X-API-Key"], "test_key_123")
        self.assertEqual(headers["X-RapidAPI-Key"], "test_key_123")
        self.assertIn("opticparse-python-sdk", headers["User-Agent"])

    def test_empty_template_validation(self):
        client = OpticParse(api_key="test_key_123")
        with self.assertRaises(TemplateNotFoundError):
            client.scrape_with_template("https://example.com", template_id="")

    def test_version(self):
        self.assertEqual(__version__, "1.0.0")


if __name__ == "__main__":
    unittest.main()
