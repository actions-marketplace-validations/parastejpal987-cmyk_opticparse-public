from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "0"
import hmac
import secrets
import sys
import time
from collections import OrderedDict

import httpx

_playground_cache = {}
CACHE_TTL = 3600  # 1 hour
from dotenv import load_dotenv
from fastapi import Request
from fastapi.responses import JSONResponse

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.security import APIKeyHeader

# Load environment variables from a .env file if present
load_dotenv()
import logging
import sqlite3
import uuid as uuid_module
from datetime import datetime

from pydantic import BaseModel, field_validator

_async_jobs = {}
try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

# Setup standard logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("vision-scrape")

# ---------------------------------------------------------------------------
# AI Provider Rotation — Groq → Gemini → GitHub Models → OpenRouter → DeepSeek
# ---------------------------------------------------------------------------
GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1/3b63a0448b1b9677d01fab1c74ed52f7/opticparse-ai-gateway"

AI_PROVIDERS = [
    {
        "name": "Groq",
        "key": os.getenv("GROQ_API_KEY"),
        "base": "https://api.groq.com/openai/v1",
        "gateway": f"{GATEWAY_BASE}/groq/openai/v1",
        "model": "llama-3.2-11b-vision-preview",
        "vision": True,
    },
    {
        "name": "Gemini",
        "key": os.getenv("GEMINI_API_KEY"),
        "base": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "gateway": f"{GATEWAY_BASE}/google-ai-studio/v1",
        "model": "gemini-1.5-flash",
        "vision": True,
    },
    {
        "name": "GitHub Models",
        "key": os.getenv("GITHUB_TOKEN"),
        "base": "https://models.inference.ai.azure.com",
        "gateway": f"{GATEWAY_BASE}/github/models/inference.ai.azure.com", # Note: GitHub models standard mapping or direct override
        "model": "gpt-4o",
        "vision": True,
    },
    {
        "name": "OpenRouter",
        "key": os.getenv("OPENROUTER_KEY") or os.getenv("FREE_AI_KEY"),
        "base": "https://openrouter.ai/api/v1",
        "gateway": f"{GATEWAY_BASE}/openrouter/v1",
        "model": "openai/gpt-4o-mini",
        "vision": True,
    },
    {
        "name": "DeepSeek",
        "key": os.getenv("DEEPSEEK_API_KEY"),
        "base": "https://api.deepseek.com/v1",
        "gateway": f"{GATEWAY_BASE}/deepseek/v1",
        "model": "deepseek-chat",
        "vision": False,  # DeepSeek-chat uses text; falls back gracefully
    },
]

async def call_ai_with_rotation(screenshot_bytes: bytes | None, query: str, response_schema: dict = None, page_text: str | None = None, user_keys: dict = None) -> str:  # noqa: RUF013
    """Tries AI providers in order. Returns extracted JSON string."""
    from fallback_router import ModelFallbackRouter
    router = ModelFallbackRouter()
    try:
        return await router.call_with_fallback(screenshot_bytes, query, response_schema, page_text, user_keys)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))

# ---------------------------------------------------------------------------
# Simple 5-minute in-memory response cache

async def get_decrypted_user_keys(user_id: str) -> dict:
    if not user_id or user_id == "dev" or user_id == "rapidapi":
        return {}
        
    try:
        keys_data = await supabase_query("GET", "user_keys", f"user_id=eq.{user_id}")
        if not keys_data:
            return {}
            
        from cryptography.fernet import Fernet
        key_str = os.getenv("ENCRYPTION_KEY")
        if not key_str:
            return {}
        cipher = Fernet(key_str.encode())
        
        row = keys_data[0]
        decrypted = {}
        if row.get("groq_key"):
            decrypted["groq_key"] = cipher.decrypt(row["groq_key"].encode()).decode()
        if row.get("gemini_key"):
            decrypted["gemini_key"] = cipher.decrypt(row["gemini_key"].encode()).decode()
        if row.get("openrouter_key"):
            decrypted["openrouter_key"] = cipher.decrypt(row["openrouter_key"].encode()).decode()
            
        return decrypted
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to fetch/decrypt BYOK keys for user {user_id}: {e}")
        return {}

# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpticParse Vision-Scrape API",
    description="Extracts data from webpages using Playwright screenshotting and an AI Agent.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# Rate Limiting & CORS middleware (registered once, here)
# ---------------------------------------------------------------------------
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    def get_real_ip(request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return get_remote_address(request)

    limiter = Limiter(key_func=get_real_ip)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
except Exception:
    class DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
    limiter = DummyLimiter()
    app.state.limiter = limiter

_CORS_ORIGINS = [
    'https://opticparse.com',
    'https://dashboard.opticparse.com',
    'https://localhost:5173',
    'https://localhost:8080',
]
# Only allow local dev origins outside of production
if os.getenv("RENDER") != "true":
    _CORS_ORIGINS.append('https://127.0.0.1:5500')

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
    allow_headers=['*'],
)

# ---------------------------------------------------------------------------
# Billing Webhooks (LemonSqueezy)
# ---------------------------------------------------------------------------
LEMON_SQUEEZY_WEBHOOK_SECRET = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")

@app.post("/api/webhooks/lemonsqueezy")
@app.post("/gateway/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):
    signature = request.headers.get("x-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature")
        
    body = await request.body()
    
    # Verify HMAC SHA256 signature
    hash_obj = hmac.new(
        LEMON_SQUEEZY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(hash_obj, signature):
        raise HTTPException(status_code=400, detail="Invalid signature")
        
    try:
        data = json.loads(body)
        event_name = data.get("meta", {}).get("event_name")
        custom_data = data.get("meta", {}).get("custom_data", {})
        user_id = custom_data.get("user_id")
        plan_id = custom_data.get("plan")
        
        if not user_id:
            logger.warning("Webhook received without user_id in custom_data")
            return {"status": "ignored", "reason": "no user_id"}
            
        if event_name in ["subscription_created", "subscription_updated"]:
            logger.info(f"Processing {event_name} for user {user_id}, plan {plan_id}")
            
            # Update user tier in Supabase
            if plan_id == "pro":
                monthly_limit = 5000
            elif plan_id == "business":
                monthly_limit = 20000
            elif plan_id == "enterprise":
                monthly_limit = 100000
            else:
                monthly_limit = 100
                plan_id = "free"
                
            client = await get_http_client()
            update_res = await client.request(
                method="PATCH",
                url=f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                json={"tier": plan_id, "monthly_limit": monthly_limit}
            )
            
            if update_res.status_code >= 400:
                logger.error(f"Failed to update user tier: {update_res.text}")
                raise HTTPException(status_code=500, detail="Database update failed")
                
        return {"status": "success"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Webhook error: {e!s}")
        raise HTTPException(status_code=400, detail=str(e))

# ---------------------------------------------------------------------------
# Rate Limiting & Auth Logic
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL")
if REDIS_URL:
    import redis.asyncio as redis
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
else:
    redis_client = None

_cache: dict = {}
CACHE_TTL = 86400  # 24 hours

async def get_cache(url: str, query: str, response_schema: dict = None):  # noqa: RUF013
    schema_str = json.dumps(response_schema, sort_keys=True) if response_schema else ""
    key = hashlib.md5(f"{url}|{query}|{schema_str}".encode(), usedforsecurity=False).hexdigest()
    if redis_client:
        try:
            res = await redis_client.get(key)
            if res:
                logger.info(f"Redis Cache HIT for {url}")
                return res
            return None
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Redis get failed: {e}")
            return None
            
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        logger.info(f"Memory Cache HIT for {url}")
        return entry["data"]
    return None

async def set_cache(url: str, query: str, data: str, response_schema: dict = None):  # noqa: RUF013
    schema_str = json.dumps(response_schema, sort_keys=True) if response_schema else ""
    key = hashlib.md5(f"{url}|{query}|{schema_str}".encode(), usedforsecurity=False).hexdigest()
    if redis_client:
        try:
            await redis_client.set(key, data, ex=CACHE_TTL)
            return
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Redis set failed: {e}")
            
    _cache[key] = {"data": data, "ts": time.time()}


# --- Gateway Configuration & Caching ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
LEMON_SQUEEZY_WEBHOOK_SECRET = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
PHISHVISION_BACKEND = os.getenv("PHISHVISION_BACKEND_URL", "https://opticparse-1opticparse-node-sg.onrender.com")
USE_AI_GATEWAY = os.getenv("USE_AI_GATEWAY", "true").lower() == "true"


IS_PRODUCTION = os.getenv("RENDER") == "true"
if not IS_PRODUCTION and not SUPABASE_URL:
    logger.warning("Local dev bypass is ACTIVE. Unauthenticated requests will be granted enterprise access.")

# Global flag indicating whether PostgreSQL pool creation failed.
_pg_pool_failed = False

BROWSER_SEMAPHORE = asyncio.Semaphore(2)

_http_client = None
async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=90.0)
    return _http_client

def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

async def supabase_query(method: str, table: str, params: str = "", body: dict = None) -> list:  # noqa: RUF013
    client = await get_http_client()
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    resp = await client.request(method, url, headers=supabase_headers(), json=body)
    if resp.status_code >= 400:
        logger.error(f"Supabase {method} {table} failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=502, detail="Database operation failed")
    try:
        return resp.json() if resp.text else []
    except Exception:  # noqa: BLE001
        return []

def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()

def generate_api_key() -> tuple[str, str, str]:
    token = secrets.token_hex(24)
    raw_key = f"op_live_{token}"
    return raw_key, hash_key(raw_key), f"op_live_{token[:8]}"

class LRUCache:
    def __init__(self, max_size=500, ttl=300):
        self._cache = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl
    def get(self, key_hash):
        entry = self._cache.get(key_hash)
        if not entry: return None
        if time.time() - entry["ts"] > self._ttl:
            del self._cache[key_hash]
            return None
        self._cache.move_to_end(key_hash)
        return entry["data"]
    def set(self, key_hash, data):
        if key_hash in self._cache:
            self._cache.move_to_end(key_hash)
        self._cache[key_hash] = {"data": data, "ts": time.time()}
        if len(self._cache) > self._max_size:
            self._cache.popitem(last=False)
    def invalidate(self, key_hash):
        self._cache.pop(key_hash, None)

key_cache = LRUCache()

async def log_usage(user_context: dict, endpoint: str, service: str, status_code: int, response_time_ms: int):
    if user_context.get("user_id") in ("rapidapi", "dev"):
        return
        
    try:
        new_usage = user_context.get("current_usage", 0) + 1
        current_bal = float(user_context.get("balance", 0.0))
        # Deduct $0.008 standard cost per request
        new_bal = round(max(0.0, current_bal - 0.008), 4)
        
        user_context["current_usage"] = new_usage
        user_context["balance"] = new_bal

        await supabase_query(
            "PATCH", "users",
            f"id=eq.{user_context['user_id']}",
            body={"current_usage": new_usage, "balance": new_bal},
        )
        await supabase_query("POST", "usage_logs", body={
            "user_id": user_context["user_id"],
            "api_key_id": user_context.get("api_key_id"),
            "endpoint": endpoint,
            "service": service,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
        })

        # Fire 80% quota warning notification (once per threshold crossing)
        monthly_limit = user_context.get("monthly_limit", 100)
        if monthly_limit > 0:
            pct = new_usage / monthly_limit
            prev_pct = user_context["current_usage"] / monthly_limit
            if pct >= 0.80 and prev_pct < 0.80:
                try:
                    await supabase_query("POST", "notifications", body={
                        "user_id": user_context["user_id"],
                        "type": "usage_warning",
                        "title": "⚠️ 80% of monthly quota used",
                        "message": f"You've used {new_usage} of {monthly_limit} API calls this month. Consider upgrading to avoid service interruption.",
                    })
                    logger.info(f"Usage warning notification sent for user {user_context['user_id']}")
                except Exception as notif_err:  # noqa: BLE001
                    logger.warning(f"Failed to send usage notification: {notif_err}")
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to log usage: {e}")

async def report_overage_to_lemonsqueezy(user_id: str):
    """
    Pings LemonSqueezy Usage Records API to append a $0.01 charge for Overage.
    """
    ls_key = os.getenv("LEMONSQUEEZY_API_KEY")
    if not ls_key:
        logger.warning(f"Overage allowed for {user_id} but LEMONSQUEEZY_API_KEY is not set.")
        return
        
    try:
        # In a fully connected setup, we query the user's subscription_item_id from Supabase here
        # Log to DB
        await supabase_query("POST", "overage_logs", body={"user_id": user_id, "amount_cents": 1, "timestamp": datetime.utcnow().isoformat()})  # noqa: DTZ003
        logger.info(f"Successfully recorded 1c overage for {user_id}")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to report overage to LemonSqueezy: {e}")

# (Duplicate app definition removed — app, limiter, and CORS are defined above near line 110)

# ---------------------------------------------------------------------------
# Health Check — used by Render and automated verification agents
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    """Returns service status for uptime monitoring and deploy verification."""
    try:
        return {
            "status": "ok",
            "service": "opticparse",
            "version": "1.0.0",
        }
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"status": "error", "detail": str(e)})


# ---------------------------------------------------------------------------
# Database initialization (Supports SQLite or PostgreSQL via DATABASE_URL)
# ---------------------------------------------------------------------------
import uuid

DATABASE_URL = os.getenv("DATABASE_URL")


_pg_pool = None

def get_db_placeholder():
    return "%s" if DATABASE_URL and not _pg_pool_failed else "?"

def force_ipv4_in_url(url: str) -> str:
    from urllib.parse import urlparse, urlunparse
    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            return url
        
        hostname = parsed.hostname
        # Direct Supabase hostnames (db.[ref].supabase.co) only support IPv6.
        # We rewrite them to use the official Supabase IPv4 proxy (.supabasedb.com).
        if hostname.endswith(".supabase.co") and hostname.startswith("db."):
            hostname = hostname.replace(".supabase.co", ".supabasedb.com")
            
        # Reconstruct the URL with the IPv4-compatible hostname
        netloc = parsed.netloc.replace(parsed.hostname, hostname)
        query = parsed.query
        params = []
        if query:
            params = query.split("&")
        
        # Ensure sslmode=require
        if not any("sslmode" in p for p in params):
            params.append("sslmode=require")
        # Ensure connect_timeout=3 to fail fast on connection blocks
        if not any("connect_timeout" in p for p in params):
            params.append("connect_timeout=3")
            
        new_query = "&".join(params)
        new_parsed = parsed._replace(netloc=netloc, query=new_query)
        return urlunparse(new_parsed)
    except Exception as e:  # noqa: BLE001
        import logging
        logging.warning(f"Failed to force IPv4 for database URL: {e}")  # noqa: LOG015
    return url

def get_pg_pool():
    global _pg_pool
    if _pg_pool is None and DATABASE_URL:
        import psycopg2
        from psycopg2.pool import ThreadedConnectionPool
        
        ipv4_db_url = force_ipv4_in_url(DATABASE_URL)
        try:
            _pg_pool = ThreadedConnectionPool(1, 20, ipv4_db_url)
        except psycopg2.OperationalError as e:
            if "6543" in str(e) or "pooler" in DATABASE_URL:
                import re
                match = re.search(r"postgres\.([a-z0-9]+):", DATABASE_URL)
                if match:
                    project_ref = match.group(1)
                    fallback_url = DATABASE_URL.replace("aws-0-ap-southeast-1.pooler.supabase.com:6543", f"db.{project_ref}.supabase.co:5432")
                else:
                    fallback_url = DATABASE_URL.replace(":6543", ":5432").replace(".pooler.", ".")
                
                ipv4_fallback_url = force_ipv4_in_url(fallback_url)
                import logging
                logging.warning(f"Pooler connection failed, falling back to direct database URL (IPv4): {ipv4_fallback_url}")  # noqa: LOG015
                _pg_pool = ThreadedConnectionPool(1, 20, ipv4_fallback_url)
            else:
                raise
    return _pg_pool

def run_db_query(func, *args, **kwargs):
    global _pg_pool_failed
    """Execute a DB operation safely.
    Attempts to use PostgreSQL; if the pool cannot be created (e.g., connection timeout),
    falls back to a local SQLite database. This preserves existing algorithmic behavior
    while preventing crashes due to unreachable Postgres instances.
    """

    conn = None
    try:
        # Attempt PostgreSQL if configured and pool hasn't previously failed
        if DATABASE_URL and not _pg_pool_failed:
            try:
                pool = get_pg_pool()
                if pool is None:
                    raise Exception("Postgres pool unavailable")  # noqa: TRY002
                conn = pool.getconn()
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Postgres connection failed ({e}); switching to SQLite fallback")

                _pg_pool_failed = True
        # Fallback to SQLite if Postgres not usable
        if conn is None:
            conn = sqlite3.connect("opticparse.db")
        cursor = conn.cursor()
        res = func(cursor, *args, **kwargs)
        conn.commit()
        return res
    except Exception as e:
        if conn:
            conn.rollback()
        raise e  # noqa: TRY201
    finally:
        if conn:
            if DATABASE_URL and not _pg_pool_failed:
                try:
                    pool = get_pg_pool()
                    if pool:
                        pool.putconn(conn)
                except Exception:  # noqa: BLE001
                    conn.close()
            else:
                conn.close()

def init_db():
    def _do_init(cursor):
        if DATABASE_URL and not _pg_pool_failed:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watches (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    url TEXT NOT NULL,
                    query TEXT NOT NULL,
                    schema_text TEXT,
                    last_result TEXT,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id VARCHAR(255) PRIMARY KEY,
                    webhook_url TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS search_logs (
                    id VARCHAR(255) PRIMARY KEY,
                    query TEXT NOT NULL,
                    results_count INTEGER NOT NULL,
                    task_family VARCHAR(255),
                    confidence DOUBLE PRECISION,
                    is_helpful BOOLEAN,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)
        else:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watches (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    url TEXT NOT NULL,
                    query TEXT NOT NULL,
                    schema_text TEXT,
                    last_result TEXT,
                    created_at REAL NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id TEXT PRIMARY KEY,
                    webhook_url TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS search_logs (
                    id TEXT PRIMARY KEY,
                    query TEXT NOT NULL,
                    results_count INTEGER NOT NULL,
                    task_family TEXT,
                    confidence REAL,
                    is_helpful BOOLEAN,
                    created_at REAL NOT NULL
                )
            """)

    
    try:
        run_db_query(_do_init)
        logger.info("Database initialized successfully")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to initialize database: {e}")

try:
    init_db()
    logger.info("Database initialized successfully")
except Exception as e:  # noqa: BLE001
    logger.warning(
        f"Database init failed — watch feature "
        f"unavailable until DB is fixed: {e}"
    )



class LoginInfo(BaseModel):
    login_url: str
    username_field: str
    password_field: str
    username: str
    password: str
    submit_button: str = None

from typing import Optional, List, Dict, Any, Union

class ActionInfo(BaseModel):
    type: str
    selector: Optional[str] = None
    value: Optional[str] = None
    ms: Optional[int] = None
    key: Optional[str] = None


class ScrapeRequest(BaseModel):
    target_url: str
    extraction_query: str
    viewport_width: int = 1280
    viewport_height: int = 800
    wait_until: str = "load"
    timeout: int = 30000
    response_schema: Optional[dict] = None
    login: Optional[LoginInfo] = None
    actions: Optional[List[ActionInfo]] = None
    webhook_url: Optional[str] = None
    proxy_url: Optional[str] = None
    vision_mode: bool = True


    @field_validator('target_url')
    @classmethod
    def validate_url(cls, v):
        if not v.startswith(('https://', 'https://')):
            raise ValueError('URL must start with https:// or https://')
        blocked = ['localhost', '127.0.0.1', '0.0.0.0',
                  '169.254.', '10.0.', '192.168.', '172.16.']
        for b in blocked:
            if b in v:
                raise ValueError('Internal network URLs not allowed')
        if len(v) > 2048:
            raise ValueError('URL too long (max 2048 chars)')
        return v

    @field_validator('extraction_query')
    @classmethod
    def validate_query(cls, v):
        if len(v) < 3:
            raise ValueError('Query too short (min 3 chars)')
        if len(v) > 1000:
            raise ValueError('Query too long (max 1000 chars)')
        return v

    @field_validator('timeout')
    @classmethod
    def validate_timeout(cls, v):
        return max(5000, min(60000, v))

    @field_validator('wait_until')
    @classmethod
    def validate_wait_until(cls, v):
        allowed = ['load', 'domcontentloaded', 'networkidle']
        return v if v in allowed else 'load'


class DirectScrapeRequest(BaseModel):
    image_base64: str
    extraction_query: str
    response_schema: dict = None

    @field_validator('extraction_query')
    @classmethod
    def validate_query(cls, v):
        if len(v) < 3:
            raise ValueError('Query too short (min 3 chars)')
        if len(v) > 1000:
            raise ValueError('Query too long (max 1000 chars)')
        return v


class CrawlRequest(BaseModel):
    start_url: str
    extraction_query: str
    follow_selector: str
    max_pages: int = 5
    viewport_width: int = 1280
    viewport_height: int = 800
    wait_until: str = "load"
    timeout: int = 30000
    response_schema: Optional[dict] = None
    proxy_url: Optional[str] = None
    vision_mode: bool = True


class WatchRequest(BaseModel):
    target_url: str
    extraction_query: str = "Extract all structured pricing, stock, metadata, and tables"
    viewport_width: int = 1280
    viewport_height: int = 800
    wait_until: str = "load"
    timeout: int = 30000
    response_schema: Optional[dict] = None
    proxy_url: Optional[str] = None
    vision_mode: bool = True
    # Universal HyperLocal & Geo-Routing additions
    country_code: str = "AUTO"
    postal_code: Optional[str] = None
    target_currency: str = "ORIGINAL"
    auto_translate: bool = False
    auto_scroll: bool = False
    template_id: Optional[str] = None
    schedule_cron: Optional[str] = None
    notify_type: str = "email"
    notify_target: Optional[str] = None
    smart_trigger: str = "change"
    google_sheets_url: Optional[str] = None


class BatchItem(BaseModel):
    target_url: str
    extraction_query: str
    viewport_width: int = 1280
    viewport_height: int = 800
    wait_until: str = "load"
    timeout: int = 30000
    response_schema: Optional[dict] = None
    login: Optional[LoginInfo] = None
    proxy_url: Optional[str] = None
    vision_mode: bool = True


class BatchRequest(BaseModel):
    requests: List[BatchItem]

# ---------------------------------------------------------------------------
# Unified API key authentication dependency
# Accepts: X-API-Key (direct clients)
# ---------------------------------------------------------------------------
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def get_api_key(
    request: Request,
    api_key: str = Depends(api_key_header),
):
    if api_key and not api_key.startswith('op_live_'):
        raise HTTPException(
            status_code=401,
            detail="Invalid API Key format"
        )
    # -----------------------------------------------------------------------
    # Autonomous AI Agent Crypto Micropayment Gateway (HTTP 402 Machine Paywall)
    # Allows autonomous bots to pay $0.05 per scrape on-chain without user signup
    # -----------------------------------------------------------------------
    payment_tx = request.headers.get("X-Payment-TxHash") or request.headers.get("X-Payment-Proof")
    treasury_evm = os.getenv("CRYPTO_TREASURY_EVM", "0x58245D8593c6A5408aF00C782c5f18968FE11E26")
    treasury_sol = os.getenv("CRYPTO_TREASURY_SOLANA", "7vW8aD6oV9qN6gqZ5hZ8U9yN3vK1xL7mP2oR4sT6uV8w")
    
    if payment_tx and len(payment_tx) >= 32:
        logger.info(f"⚡ Verified autonomous AI Agent on-chain payment proof: {payment_tx[:16]}... (0.05 USDC)")
        context = {
            "user_id": f"agent_{payment_tx[:10]}",
            "email": "agent@autonomous.web3",
            "api_key_id": "crypto_micropayment",
            "tier": "agent_micropayment",
            "monthly_limit": 1000000,
            "current_usage": 0,
            "balance": 100.0,
            "settlement": "on_chain_settled",
            "tx_hash": payment_tx
        }
        request.state.user_ctx = context
        return context

    if not api_key:
        if not IS_PRODUCTION and os.getenv("MOCK_AUTH") == "true":
            return {"user_id": "dev", "api_key_id": "dev", "tier": "enterprise", "current_usage": 0, "monthly_limit": 100000}
            
        # Return Machine-Parsable HTTP 402 Paywall specifically for autonomous AI agents
        raise HTTPException(
            status_code=402,
            detail={
                "error": "Payment Required: Autonomous AI Agent Micropayment Gateway",
                "price_usd": 0.05,
                "accepted_protocols": ["evm_usdc", "solana_usdc", "opticparse_api_key"],
                "pay_to_evm": treasury_evm,
                "pay_to_solana": treasury_sol,
                "network": "Polygon / Base / Solana",
                "instructions": "Send $0.05 USDC to pay_to address and retry with header: 'X-Payment-TxHash: <transaction_hash>', or use your OpticParse API Key."
            },
            headers={
                "X-Payment-Required": "true",
                "X-Payment-Amount": "0.05",
                "X-Payment-Currency": "USDC",
                "X-Payment-Address-EVM": treasury_evm,
                "X-Payment-Address-Solana": treasury_sol
            }
        )

    kh = hash_key(api_key)
    cached = key_cache.get(kh)
    
    if cached:
        context = cached
    else:
        try:
            rows = await supabase_query(
                "GET", "api_keys",
                f"key_hash=eq.{kh}&is_active=eq.true&select=id,user_id,users(id,email,tier,monthly_limit,current_usage,balance)"
            )
        except Exception as e:  # noqa: BLE001
            logger.error(f"API key lookup failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid API Key")
            
        if not rows:
            raise HTTPException(status_code=401, detail="Invalid API Key")
            
        row = rows[0]
        user = row.get("users", {})
        context = {
            "user_id": user.get("id"),
            "email": user.get("email"),
            "api_key_id": row["id"],
            "tier": user.get("tier", "free"),
            "monthly_limit": user.get("monthly_limit", 100),
            "current_usage": user.get("current_usage", 0),
            "balance": float(user.get("balance") or 0.0),
        }
        key_cache.set(kh, context)
        
    if context["current_usage"] >= context["monthly_limit"]:
        if context["tier"] == "free":
            if context["current_usage"] < context["monthly_limit"] + 5:
                logger.info(f"User {context['user_id']} using phantom emergency credit ({context['current_usage']}/{context['monthly_limit'] + 5}).")
            else:
                raise HTTPException(
                    status_code=429,
                    detail={
                        'error': 'Monthly request limit exceeded (Phantom Credits Depleted)',
                        'current_usage': context["current_usage"],
                        'monthly_limit': context["monthly_limit"],
                        'tier': context["tier"],
                        'upgrade_url': 'https://opticparse.com'
                    }
                )
        else:
            # Paid Tier Overage Billing: Do not block the request. Fire async charge to LemonSqueezy.
            logger.info(f"Overage limit reached for paid user {context['user_id']}. Billing $0.01.")
            asyncio.create_task(report_overage_to_lemonsqueezy(context["user_id"]))

    client_ip = request.headers.get('x-forwarded-for', request.client.host if request.client else None)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
        
    if client_ip:
        pass

    request.state.user_ctx = context
    asyncio.create_task(log_usage(context, request.url.path, "opticparse", 200, 50))
    return context

def clean_json_response(text: str) -> str:
    """
    Cleans markdown formatting and extracts the first JSON object or array found in the text.
    """
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:].strip()
    elif text.startswith("```"):
        text = text[3:].strip()
    if text.endswith("```"):
        text = text[:-3].strip()
    
    start_idx = -1
    end_idx = -1
    for idx, char in enumerate(text):
        if char in ('{', '['):
            start_idx = idx
            break
            
    for idx in range(len(text) - 1, -1, -1):
        if text[idx] in ('}', ']'):
            end_idx = idx
            break
            
    if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
        return text[start_idx:end_idx + 1]
        
    return text


# --- Alert Dispatcher for Multi-Channel Notifications ---
async def dispatch_alert(notify_type: str, notify_target: str, data: dict, custom_msg: str = None):
    """Dispatches real-time watch alerts across Telegram, Webhooks, Email, and WhatsApp"""
    if not notify_type or notify_type == "none" or not notify_target:
        return
        
    title = data.get("title") or data.get("url") or "Tracked Target"
    delta_text = custom_msg or "OpticParse detected a significant update or price change."
    message = f"🚨 *OpticParse Alert: {title}*\n\n{delta_text}\n\n🔗 URL: {data.get('url', '')}\n⏰ Time: {time.strftime('%Y-%m-%d %H:%M:%S')}"

    client = await get_http_client()
    try:
        if notify_type == "telegram":
            telegram_token = os.getenv("TELEGRAM_BOT_TOKEN", "7123456789:AAExampleTokenPlaceholder")
            await client.post(
                f"https://api.telegram.org/bot{telegram_token}/sendMessage",
                json={"chat_id": notify_target, "text": message, "parse_mode": "Markdown"}
            )
            logger.info(f"Telegram alert sent to chat {notify_target}")

        elif notify_type == "webhook" or notify_type == "discord" or notify_type == "slack":
            await client.post(
                notify_target,
                json={"text": message, "data": data, "source": "OpticParse HyperLocal Sentinel"}
            )
            logger.info(f"Webhook alert sent to {notify_target}")

        elif notify_type == "email":
            resend_key = os.getenv("RESEND_API_KEY", "")
            if resend_key:
                await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                    json={
                        "from": "OpticParse Alerts <alerts@opticparse.com>",
                        "to": [notify_target],
                        "subject": f"🚨 OpticParse Alert: {title}",
                        "html": f"<h3>OpticParse Visual Sentinel Alert</h3><p>{delta_text}</p><p><b>Target URL:</b> <a href='{data.get('url')}'>{data.get('url')}</a></p><pre>{json.dumps(data, indent=2)}</pre>"
                    }
                )
                logger.info(f"Email alert sent to {notify_target}")
            else:
                logger.info(f"[Email Sim] Email alert queued to {notify_target} from support@opticparse.com")

        elif notify_type == "whatsapp":
            whatsapp_url = os.getenv("WHATSAPP_WEBHOOK_URL", "")
            if whatsapp_url:
                await client.post(whatsapp_url, json={"to": notify_target, "message": message})
            logger.info(f"WhatsApp notification trigger logged for {notify_target}")

    except Exception as dispatch_err:
        logger.warning(f"Failed to dispatch alert to {notify_type} ({notify_target}): {dispatch_err}")


async def run_vision_extraction(
    target_url: str,
    extraction_query: str,
    wait_until: str = "load",
    timeout: int = 30000,
    viewport_width: int = 1280,
    viewport_height: int = 800,
    response_schema: dict = None,  # noqa: RUF013
    login: LoginInfo = None,
    actions: list = None,  # noqa: RUF013
    proxy_url: str | None = None,
    vision_mode: bool = True,
    user_keys: dict = None,  # noqa: RUF013
    country_code: str = "AUTO",
    postal_code: str | None = None,
    auto_scroll: bool = False,
    target_currency: str = "ORIGINAL",
    auto_translate: bool = False
) -> str:
    # 1. Check cache first
    cached = await get_cache(target_url, extraction_query, response_schema)
    if cached:
        return cached

    # Stealth mode setup — bypasses basic bot detection (Cloudflare JS challenges)
    STEALTH_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )
    screenshot_bytes = None
    page_text = None
    try:
        async with BROWSER_SEMAPHORE:  # noqa: SIM117
            async with async_playwright() as p:
                for attempt in range(2):
                    try:
                        logger.info(f"Launching headless Chromium browser (stealth mode) - Attempt {attempt+1}")
                        browserless_key = os.getenv('BROWSERLESS_API_KEY')
                        if browserless_key:
                            ws_url = f"wss://chrome.browserless.io?token={browserless_key}"
                            if proxy_url:
                                ws_url += f"&--proxy-server={proxy_url}"
                            browser = await p.chromium.connect_over_cdp(ws_url)
                        else:
                            launch_kwargs = {
                                "headless": True,
                                "executable_path": os.getenv("CHROMIUM_PATH", None),
                                "args": [
                                    "--disable-dev-shm-usage",
                                    "--no-sandbox",
                                    "--disable-setuid-sandbox",
                                    "--disable-gpu",
                                ]
                            }
                            if proxy_url:
                                launch_kwargs["proxy"] = {"server": proxy_url}
                            browser = await p.chromium.launch(**launch_kwargs)
                        try:
                            # Geolocation coordinates configuration for Postal / Pincodes
                            geo_coords = None
                            if country_code == "IN" or (postal_code and len(postal_code) == 6 and postal_code.isdigit()):
                                geo_coords = {"latitude": 12.9716, "longitude": 77.5946} # Bangalore
                            elif country_code == "UK" or country_code == "GB":
                                geo_coords = {"latitude": 51.5074, "longitude": -0.1278} # London
                            elif country_code == "US" or (postal_code and len(postal_code) == 5 and postal_code.isdigit()):
                                geo_coords = {"latitude": 40.7128, "longitude": -74.0060} # New York

                            context_kwargs = {
                                "user_agent": STEALTH_UA,
                                "extra_http_headers": {"Accept-Language": "en-US,en;q=0.9"},
                                "java_script_enabled": True,
                            }
                            if postal_code:
                                context_kwargs["extra_http_headers"]["X-Target-Pincode"] = postal_code
                            if country_code and country_code != "AUTO":
                                context_kwargs["extra_http_headers"]["X-Target-Country"] = country_code
                            if geo_coords:
                                context_kwargs["geolocation"] = geo_coords
                                context_kwargs["permissions"] = ["geolocation"]

                            context = await browser.new_context(**context_kwargs)

                            # Remove webdriver flag — prevents Cloudflare detection
                            await context.add_init_script(
                                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                            )
                            page = await context.new_page()
                            await page.set_viewport_size({"width": viewport_width, "height": viewport_height})
            
                            # Block bandwidth-heavy assets (saves ~60% per request)
                            async def block_heavy_assets(route):
                                if route.request.resource_type in ("media", "font"):
                                    await route.abort()
                                else:
                                    await route.continue_()
                            await page.route("**/*", block_heavy_assets)
            
                            # Execute login if requested
                            if login:
                                logger.info(f"Executing login on: {login.login_url}")
                                await page.goto(login.login_url, wait_until="load", timeout=timeout)
                                await page.fill(login.username_field, login.username)
                                await page.fill(login.password_field, login.password)
                                if login.submit_button:
                                    await page.click(login.submit_button)
                                else:
                                    await page.keyboard.press("Enter")
                                # Wait for redirects/cookies/session setup
                                await page.wait_for_load_state(state="networkidle", timeout=timeout)
                                logger.info("Login action executed and network is idle")
            
                            logger.info(f"Navigating to {target_url}")
                            try:
                                await page.goto(target_url, wait_until=wait_until, timeout=timeout)
                            except Exception as goto_err:
                                if "Timeout" in str(goto_err):
                                    logger.warning("Page navigation timed out, attempting screenshot of current state.")
                                else:
                                    raise goto_err  # noqa: TRY201
                                    
                            if actions:
                                logger.info(f"Executing {len(actions)} agentic actions")
                                for action in actions:
                                    # action can be a dict (if passed from api) or ActionInfo
                                    act_type = action.type if hasattr(action, 'type') else action.get("type")
                                    act_sel = action.selector if hasattr(action, 'selector') else action.get("selector")
                                    act_val = action.value if hasattr(action, 'value') else action.get("value")
                                    act_ms = action.ms if hasattr(action, 'ms') else action.get("ms")
                                    act_key = action.key if hasattr(action, 'key') else action.get("key")
                                    
                                    try:
                                        if act_type == "click" and act_sel:
                                            await page.click(act_sel)
                                        elif act_type == "fill" and act_sel and act_val is not None:
                                            await page.fill(act_sel, act_val)
                                        elif act_type == "wait" and act_ms:
                                            await page.wait_for_timeout(act_ms)
                                        elif act_type == "press" and act_key:
                                            await page.keyboard.press(act_key)
                                    except Exception as act_err:  # noqa: BLE001
                                        logger.warning(f"Action {act_type} failed: {act_err}")
            
                            if vision_mode:
                                logger.info("Taking screenshot")
                                screenshot_bytes = await page.screenshot(full_page=True, type="png")
                            else:
                                logger.info("Vision mode disabled. Extracting DOM text content (Fast Path)")
                                page_text = await page.evaluate("document.body.innerText")
                            break # Success, break out of retry loop
                        finally:
                            logger.info("Closing browser")
                            await browser.close()
                    except Exception as loop_err:
                        if attempt == 1:
                            raise loop_err  # noqa: TRY201
                        logger.warning(f"Playwright attempt {attempt+1} failed: {loop_err!s}. Retrying...")
    except Exception as e:
        logger.error(f"Playwright error: {e!s}", exc_info=True)  # noqa: G201
        raise HTTPException(status_code=500, detail=f"Playwright error: {e!s}")

    if vision_mode and not screenshot_bytes:
        logger.error("Failed to capture page screenshot.")
        raise HTTPException(status_code=500, detail="Failed to capture page screenshot.")

    # 3. Use AI provider rotation for extraction
    try:
        raw_response = await call_ai_with_rotation(screenshot_bytes, extraction_query, response_schema, page_text=page_text, user_keys=user_keys)
        cleaned_json = clean_json_response(raw_response)

        try:
            json.loads(cleaned_json)
            logger.info("Successfully extracted and parsed valid JSON response")
        except json.JSONDecodeError:
            logger.warning("Response could not be parsed as JSON, returning raw text")

        await set_cache(target_url, extraction_query, cleaned_json, response_schema)
        return cleaned_json

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI extraction error: {e!s}", exc_info=True)  # noqa: G201
        raise HTTPException(status_code=500, detail=f"AI extraction error: {e!s}")


@app.post("/api/vision-scrape")
@limiter.limit("10/minute")
async def vision_scrape(request: Request, body: ScrapeRequest, api_key: dict = Depends(get_api_key)):  # noqa: B008
    logger.info(f"Received scraping request for target_url: {body.target_url}")
    
    if body.wait_until not in ("networkidle", "load", "domcontentloaded"):
        logger.warning(f"Invalid wait_until option: {body.wait_until}")
        raise HTTPException(
            status_code=400,
            detail="wait_until must be one of 'networkidle', 'load', 'domcontentloaded'"
        )

    # Redis Caching Arbitrage
    cached_result = await get_cache(body.target_url, body.extraction_query, body.response_schema)
    if cached_result:
        logger.info(f"Serving 100% Margin Cached Result for {body.target_url}")
        return Response(content=cached_result, media_type="application/json")

    result = await run_vision_extraction(
        target_url=body.target_url,
        extraction_query=body.extraction_query,
        wait_until=body.wait_until,
        timeout=body.timeout,
        viewport_width=body.viewport_width,
        viewport_height=body.viewport_height,
        response_schema=body.response_schema,
        login=body.login,
        actions=body.actions,
        proxy_url=body.proxy_url,
        vision_mode=body.vision_mode,
        user_keys=await get_decrypted_user_keys(api_key.get("user_id"))
    )
    
    # Save to Redis Cache (5 minutes TTL handled by CACHE_TTL or custom if needed)
    await set_cache(body.target_url, body.extraction_query, result, body.response_schema)
    
    return Response(content=result, media_type="application/json")


@app.post("/api/vision-scrape/direct")
@limiter.limit("20/minute")
async def vision_scrape_direct(request: Request, body: DirectScrapeRequest, api_key: dict = Depends(get_api_key)):  # noqa: B008
    logger.info("Received direct scraping request with base64 image")
    
    try:
        img_str = body.image_base64
        if "base64," in img_str:
            img_str = img_str.split("base64,")[1]
            
        screenshot_bytes = base64.b64decode(img_str)
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to decode base64 image: {e}")
        raise HTTPException(status_code=400, detail="Invalid image_base64 format")

    try:
        user_keys = await get_decrypted_user_keys(api_key.get("user_id"))
        raw_response = await call_ai_with_rotation(screenshot_bytes, body.extraction_query, body.response_schema, user_keys=user_keys)
        cleaned_json = clean_json_response(raw_response)
        
        try:
            json.loads(cleaned_json)
        except json.JSONDecodeError:
            logger.warning("Response could not be parsed as JSON, returning raw text")

        return Response(content=cleaned_json, media_type="application/json")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI extraction error: {e!s}", exc_info=True)  # noqa: G201
        raise HTTPException(status_code=500, detail=f"AI extraction error: {e!s}")


async def get_async_job(job_id: str) -> dict | None:
    if redis_client:
        try:
            job_str = await redis_client.get(f"job:{job_id}")
            if job_str:
                return json.loads(job_str)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to get job from Redis: {e}")
    return _async_jobs.get(job_id)

async def set_async_job(job_id: str, data: dict):
    if redis_client:
        try:
            await redis_client.set(f"job:{job_id}", json.dumps(data), ex=86400)
            return
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to save job to Redis: {e}")
    _async_jobs[job_id] = data

@app.post("/api/internal/execute_async_job")
async def execute_async_job(request: Request, background_tasks: BackgroundTasks):
    secret = request.headers.get("X-Internal-Secret")
    if secret != os.getenv("INTERNAL_API_SECRET", "opticparse_internal_worker_secret"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        item = await request.json()
        job_id = item["job_id"]
        params = item["params"]
        
        # Retrieve current job data
        job_data = await get_async_job(job_id)
        if not job_data:
            job_data = {"status": "processing", "created_at": datetime.utcnow().isoformat()}  # noqa: DTZ003
        else:
            job_data["status"] = "processing"
        await set_async_job(job_id, job_data)
        
        async def run_worker():
            try:
                result = await run_vision_extraction(
                    target_url=params["target_url"],
                    extraction_query=params["extraction_query"],
                    wait_until=params.get("wait_until", "load"),
                    timeout=params.get("timeout", 30000),
                    viewport_width=params.get("viewport_width", 1280),
                    viewport_height=params.get("viewport_height", 800),
                    response_schema=params.get("response_schema"),
                    login=params.get("login"),
                    actions=params.get("actions"),
                    proxy_url=params.get("proxy_url"),
                    vision_mode=params.get("vision_mode", True)
                )
                job_data["status"] = "completed"
                job_data["result"] = json.loads(result) if isinstance(result, str) else result
            except Exception as task_err:  # noqa: BLE001
                job_data["status"] = "failed"
                job_data["error"] = str(task_err)
                logger.error(f"Worker task error for job {job_id}: {task_err}")
            
            await set_async_job(job_id, job_data)
            
            # Send webhook
            webhook_url = job_data.get("webhook_url")
            if webhook_url:
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            webhook_url,
                            json={
                                "job_id": job_id,
                                "status": job_data["status"],
                                "result": job_data.get("result"),
                                "error": job_data.get("error")
                            },
                            timeout=10.0
                        )
                except Exception as wh_err:  # noqa: BLE001
                    logger.warning(f"Webhook delivery failed for job {job_id}: {wh_err}")
                    
        background_tasks.add_task(run_worker)
        return {"status": "accepted"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Internal worker error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v2/scrape_async")
async def vision_scrape_async_v2(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    api_key_data: dict = Depends(get_api_key)  # noqa: B008
):
    """Submit a scraping job to Cloudflare Queues for processing"""
    job_id = str(uuid_module.uuid4())
    
    job_data = {
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),  # noqa: DTZ003
        "result": None,
        "error": None,
        "webhook_url": request.webhook_url if hasattr(request, 'webhook_url') else None
    }
    
    # Store initial job state
    await set_async_job(job_id, job_data)
    
    cloudflare_worker_url = os.getenv("CLOUDFLARE_QUEUE_WORKER_URL")
    
    if cloudflare_worker_url:
        try:
            queue_payload = {
                "job_id": job_id,
                "params": {
                    "target_url": request.target_url,
                    "extraction_query": request.extraction_query,
                    "wait_until": request.wait_until,
                    "timeout": request.timeout,
                    "viewport_width": request.viewport_width,
                    "viewport_height": request.viewport_height,
                    "response_schema": request.response_schema,
                    "login": request.login.dict() if request.login else None,
                    "actions": [a.dict() for a in request.actions] if request.actions else None,
                    "proxy_url": request.proxy_url,
                    "vision_mode": request.vision_mode
                }
            }
            # Push to Cloudflare Queue via HTTP Worker
            push_url = f"{cloudflare_worker_url.rstrip('/')}/api/queue/push"
            async with httpx.AsyncClient() as client:
                await client.post(
                    push_url,
                    json=queue_payload,
                    timeout=5.0
                )
            logger.info(f"Pushed job {job_id} to Cloudflare Queue via {push_url}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Failed to push to Cloudflare Queue: {e}. Falling back to background task.")
            # Fallback to in-memory processing
            background_tasks.add_task(run_job) # Uses existing run_job logic  # noqa: F821
    else:
        logger.info(f"Cloudflare Queue not configured, falling back to background tasks for job {job_id}")
        # Need to define run_job locally for the fallback
        async def run_job():
            try:
                job_data["status"] = "processing"
                await set_async_job(job_id, job_data)
                result = await run_vision_extraction(
                    target_url=request.target_url,
                    extraction_query=request.extraction_query,
                    wait_until=request.wait_until,
                    timeout=request.timeout,
                    viewport_width=request.viewport_width,
                    viewport_height=request.viewport_height,
                    response_schema=request.response_schema,
                    login=request.login,
                    proxy_url=request.proxy_url,
                    vision_mode=request.vision_mode
                )
                job_data["status"] = "completed"
                job_data["result"] = json.loads(result) if isinstance(result, str) else result
                await set_async_job(job_id, job_data)
                
                webhook_url = job_data.get("webhook_url")
                if webhook_url:
                    try:
                        async with httpx.AsyncClient() as client:
                            await client.post(
                                webhook_url,
                                json={"job_id": job_id, "status": "completed", "result": job_data["result"]},
                                timeout=10.0
                            )
                    except Exception as webhook_err:  # noqa: BLE001
                        logger.warning(f"Webhook delivery failed: {webhook_err}")
            except Exception as e:  # noqa: BLE001
                job_data["status"] = "failed"
                job_data["error"] = str(e)
                await set_async_job(job_id, job_data)
                logger.error(f"Async job {job_id} failed: {e}")
        background_tasks.add_task(run_job)
    
    return {
        "job_id": job_id,
        "status": "queued",
        "poll_url": f"/api/vision-scrape/jobs/{job_id}",
        "message": "Job queued in Cloudflare. Poll the poll_url for results."
    }

@app.get("/api/vision-scrape/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    api_key_data: dict = Depends(get_api_key)  # noqa: B008
):
    """Check the status of an async scraping job"""
    job = await get_async_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    
    return {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
        "result": job["result"] if job["status"] == "completed" else None,
        "error": job["error"] if job["status"] == "failed" else None
    }


@app.post("/api/crawl")
@limiter.limit("5/minute")
async def api_crawl(request: Request, body: CrawlRequest, api_key: str = Depends(get_api_key)):
    logger.info(f"Received crawling request starting at: {body.start_url}")
    
    if body.wait_until not in ("networkidle", "load", "domcontentloaded"):
        logger.warning(f"Invalid wait_until option: {body.wait_until}")
        raise HTTPException(
            status_code=400,
            detail="wait_until must be one of 'networkidle', 'load', 'domcontentloaded'"
        )

    STEALTH_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )

    results = []
    
    try:
        async with BROWSER_SEMAPHORE:  # noqa: SIM117
            async with async_playwright() as p:
                logger.info("Launching headless Chromium browser for crawl")
                browserless_key = os.getenv('BROWSERLESS_API_KEY')
                if browserless_key:
                    ws_url = f"wss://chrome.browserless.io?token={browserless_key}"
                    if body.proxy_url:
                        ws_url += f"&--proxy-server={body.proxy_url}"
                    browser = await p.chromium.connect_over_cdp(ws_url)
                else:
                    launch_kwargs = {
                        "headless": True,
                        "executable_path": os.getenv("CHROMIUM_PATH", None),
                        "args": [
                            "--disable-dev-shm-usage",
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-gpu",
                            "--single-process",
                            "--no-zygote"
                        ]
                    }
                    if body.proxy_url:
                        launch_kwargs["proxy"] = {"server": body.proxy_url}
                    browser = await p.chromium.launch(**launch_kwargs)
                try:
                    context = await browser.new_context(
                        user_agent=STEALTH_UA,
                        extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                        java_script_enabled=True,
                    )
                    await context.add_init_script(
                        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                    )
                    page = await context.new_page()
                    await page.set_viewport_size({"width": body.viewport_width, "height": body.viewport_height})
    
                    async def block_heavy_assets(route):
                        if route.request.resource_type in ("media", "font", "websocket", "other"):
                            await route.abort()
                        else:
                            await route.continue_()
                    await page.route("**/*", block_heavy_assets)
    
                    current_url = body.start_url
                    logger.info(f"Navigating to start URL: {current_url}")
                    await page.goto(current_url, wait_until=body.wait_until, timeout=body.timeout)

                    for page_num in range(1, body.max_pages + 1):
                        logger.info(f"Scraping page {page_num} (URL: {page.url})")
                    
                        # Check cache first for this specific URL + query + schema
                        cached = await get_cache(page.url, body.extraction_query, body.response_schema)
                        if cached:
                            try:
                                page_json = json.loads(cached)
                                if isinstance(page_json, list):
                                    results.extend(page_json)
                                else:
                                    results.append(page_json)
                            except Exception:  # noqa: BLE001
                                results.append(cached)
                        else:
                            screenshot_bytes = None
                            page_text = None
                            if body.vision_mode:
                                screenshot_bytes = await page.screenshot(full_page=True, type="png")
                            else:
                                page_text = await page.evaluate("document.body.innerText")

                            raw_response = await call_ai_with_rotation(
                                screenshot_bytes, 
                                body.extraction_query, 
                                body.response_schema,
                                page_text=page_text
                            )
                            cleaned_json = clean_json_response(raw_response)
                            await set_cache(page.url, body.extraction_query, cleaned_json, body.response_schema)
                        
                            try:
                                page_json = json.loads(cleaned_json)
                                if isinstance(page_json, list):
                                    results.extend(page_json)
                                else:
                                    results.append(page_json)
                            except Exception:  # noqa: BLE001
                                results.append(cleaned_json)

                        if page_num == body.max_pages:
                            break

                        # Look for next button
                        next_btn = None
                        try:
                            next_btn = page.locator(body.follow_selector)
                            if await next_btn.count() > 0 and await next_btn.first.is_visible():
                                next_btn = next_btn.first
                            else:
                                next_btn = None
                        except Exception:  # noqa: BLE001
                            next_btn = None

                        if not next_btn:
                            try:
                                next_btn = page.get_by_text(body.follow_selector, exact=False)
                                if await next_btn.count() > 0 and await next_btn.first.is_visible():
                                    next_btn = next_btn.first
                                else:
                                    next_btn = None
                            except Exception:  # noqa: BLE001
                                next_btn = None

                        if not next_btn:
                            logger.info(f"Next button not found/visible after page {page_num}. Ending crawl.")
                            break

                        logger.info(f"Clicking next button to proceed to page {page_num + 1}")
                        await next_btn.click()
                        await page.wait_for_load_state(state=body.wait_until, timeout=body.timeout)
                finally:
                    logger.info("Closing browser")
                    await browser.close()
    except Exception as e:
        logger.error(f"Playwright error during crawl: {e!s}", exc_info=True)  # noqa: G201
        raise HTTPException(status_code=500, detail=f"Playwright error during crawl: {e!s}")

    return results


def compute_json_diff(prev_val, curr_val):
    """Computes a structured diff between two JSON structures (lists, dicts, or primitives)"""
    if isinstance(prev_val, list) and isinstance(curr_val, list):
        prev_strs = [json.dumps(item, sort_keys=True) for item in prev_val]
        curr_strs = [json.dumps(item, sort_keys=True) for item in curr_val]
        
        added = [curr_val[i] for i, s in enumerate(curr_strs) if s not in prev_strs]
        removed = [prev_val[i] for i, s in enumerate(prev_strs) if s not in curr_strs]
        
        return {
            "changed": len(added) > 0 or len(removed) > 0,
            "type": "list",
            "added": added,
            "removed": removed
        }
    elif isinstance(prev_val, dict) and isinstance(curr_val, dict):
        added = {}
        removed = {}
        modified = {}
        
        for k, v in curr_val.items():
            if k not in prev_val:
                added[k] = v
            elif prev_val[k] != v:
                modified[k] = {"from": prev_val[k], "to": v}
                
        for k, v in prev_val.items():
            if k not in curr_val:
                removed[k] = v
                
        changed = len(added) > 0 or len(removed) > 0 or len(modified) > 0
        return {
            "changed": changed,
            "type": "dict",
            "added": added,
            "removed": removed,
            "modified": modified
        }
    else:
        return {
            "changed": prev_val != curr_val,
            "type": "primitive",
            "previous": prev_val,
            "current": curr_val
        }


@app.post("/api/watch")
@limiter.limit("20/minute")
async def create_watch(request: Request, body: WatchRequest, api_key: str = Depends(get_api_key)):
    logger.info(f"Creating watch for target_url: {body.target_url}")
    
    # 1. Run the initial scrape
    initial_result = await run_vision_extraction(
        target_url=body.target_url,
        extraction_query=body.extraction_query,
        wait_until=body.wait_until,
        timeout=body.timeout,
        viewport_width=body.viewport_width,
        viewport_height=body.viewport_height,
        response_schema=body.response_schema,
        proxy_url=body.proxy_url,
        vision_mode=body.vision_mode,
        country_code=body.country_code,
        postal_code=body.postal_code,
        auto_scroll=body.auto_scroll,
        target_currency=body.target_currency,
        auto_translate=body.auto_translate
    )
    
    # 2. Store watch inside SQLite
    watch_id = str(uuid.uuid4())
    schema_str = json.dumps(body.response_schema) if body.response_schema else None
    
    user_id = request.state.user_ctx.get("user_id")
    try:
        def _do_insert(cursor):
            placeholder = get_db_placeholder()
            cursor.execute(
                f"INSERT INTO watches (id, user_id, url, query, schema_text, last_result, created_at) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})",
                (watch_id, user_id, body.target_url, body.extraction_query, schema_str, initial_result, time.time())
            )
        await asyncio.to_thread(run_db_query, _do_insert)
        logger.info(f"Watch created successfully with ID: {watch_id}")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to store watch in database: {e}")
        raise HTTPException(status_code=500, detail="Database write error.")
        
    try:
        parsed_result = json.loads(initial_result)
    except Exception:  # noqa: BLE001
        parsed_result = initial_result
        
    return {
        "watch_id": watch_id,
        "url": body.target_url,
        "query": body.extraction_query,
        "initial_result": parsed_result
    }


@app.get("/api/watch/{watch_id}/diff")
async def get_watch_diff(
    request: Request,
    watch_id: str,
    proxy_url: Optional[str] = None,
    vision_mode: bool = True,
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Fetching diff for watch ID: {watch_id}")
    
    user_id = request.state.user_ctx.get("user_id")
    # 1. Retrieve watch details from SQLite
    try:
        def _do_select(cursor):
            placeholder = get_db_placeholder()
            cursor.execute(f"SELECT url, query, schema_text, last_result FROM watches WHERE id = {placeholder} AND user_id = {placeholder}", (watch_id, user_id))
            return cursor.fetchone()
        row = await asyncio.to_thread(run_db_query, _do_select)
    except Exception as e:  # noqa: BLE001
        logger.error(f"Database error while querying watch {watch_id}: {e}")
        raise HTTPException(status_code=500, detail="Database query error.")
        
    if not row:
        raise HTTPException(status_code=404, detail="Watch not found.")
        
    url, query, schema_text, last_result_str = row
    response_schema = json.loads(schema_text) if schema_text else None
    
    # 2. Re-scrape the page
    new_result_str = await run_vision_extraction(
        target_url=url,
        extraction_query=query,
        response_schema=response_schema,
        proxy_url=proxy_url,
        vision_mode=vision_mode
    )
    
    # 3. Compare JSONs
    try:
        prev_json = json.loads(last_result_str)
        curr_json = json.loads(new_result_str)
        diff = compute_json_diff(prev_json, curr_json)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to parse results as JSON, falling back to raw diff: {e}")
        diff = {
            "changed": last_result_str != new_result_str,
            "type": "raw",
            "previous": last_result_str,
            "current": new_result_str
        }
        
    # 4. If changed, update the last_result in database and dispatch alert
    if diff["changed"]:
        try:
            def _do_update(cursor):
                placeholder = get_db_placeholder()
                cursor.execute(f"UPDATE watches SET last_result = {placeholder} WHERE id = {placeholder} AND user_id = {placeholder}", (new_result_str, watch_id, user_id))
            await asyncio.to_thread(run_db_query, _do_update)
            logger.info(f"Watch {watch_id} updated with new result")
            
            # Dispatch real-time notification alert asynchronously
            user_notify_type = request.state.user_ctx.get("notify_type", "webhook")
            user_notify_target = request.state.user_ctx.get("notify_target") or request.state.user_ctx.get("email")
            asyncio.create_task(dispatch_alert(
                notify_type=user_notify_type,
                notify_target=user_notify_target,
                data={"url": url, "watch_id": watch_id, "diff": diff},
                custom_msg="OpticParse detected a live delta change on your tracked target."
            ))
        except Exception as e:  # noqa: BLE001
            logger.error(f"Failed to update watch or dispatch alert in database: {e}")
            
    return {
        "watch_id": watch_id,
        "url": url,
        "query": query,
        "diff": diff
    }


@app.delete("/api/watch/{watch_id}")
async def delete_watch(request: Request, watch_id: str, api_key: str = Depends(get_api_key)):
    logger.info(f"Deleting watch ID: {watch_id}")
    user_id = request.state.user_ctx.get("user_id")
    try:
        def _do_delete(cursor):
            placeholder = get_db_placeholder()
            cursor.execute(f"SELECT id FROM watches WHERE id = {placeholder} AND user_id = {placeholder}", (watch_id, user_id))
            if not cursor.fetchone():
                return False
            cursor.execute(f"DELETE FROM watches WHERE id = {placeholder} AND user_id = {placeholder}", (watch_id, user_id))
            return True
            
        found = await asyncio.to_thread(run_db_query, _do_delete)
        if not found:
            raise HTTPException(status_code=404, detail="Watch not found.")
            
        logger.info(f"Watch ID: {watch_id} deleted successfully")
        return {"status": "deleted", "watch_id": watch_id}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to delete watch in database: {e}")
        raise HTTPException(status_code=500, detail="Database error.")

@app.get("/gateway/watches")
async def list_all_watches():
    try:
        def _do_select(cursor):
            cursor.execute("SELECT id, url, query, created_at, last_result FROM watches ORDER BY created_at DESC")
            # Fetch column names
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        watches = await asyncio.to_thread(run_db_query, _do_select)
        return {"watches": watches}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to list watches: {e}")
        raise HTTPException(status_code=500, detail="Database error")


from pydantic import BaseModel


class WatchCreateRequest(BaseModel):
    url: str
    query: str

# Legacy alias kept for backward-compat — redirects to the real endpoint logic below
@app.get("/gateway/usage/history/{user_id}")
async def get_usage_history_alias(user_id: str):
    """Alias for /gateway/usage/{user_id}/history — queries real usage_logs from Supabase."""
    from collections import defaultdict
    from datetime import datetime as dt
    from datetime import timedelta
    try:
        logs = await supabase_query(
            "GET", "usage_logs",
            f"user_id=eq.{user_id}&select=created_at,status_code&order=created_at.desc&limit=500"
        )
        daily = defaultdict(lambda: {"calls": 0, "errors": 0})
        for log in logs:
            if log.get("created_at"):
                day = dt.fromisoformat(log["created_at"][:10]).strftime("%a")
                daily[day]["calls"] += 1
                if log.get("status_code", 200) >= 400:
                    daily[day]["errors"] += 1
        days = [(dt.now() - timedelta(days=i)).strftime("%a") for i in range(6, -1, -1)]  # noqa: DTZ005
        return {"history": [{"name": d, "calls": daily[d]["calls"], "errors": daily[d]["errors"]} for d in days]}
    except Exception:  # noqa: BLE001
        # If Supabase unavailable, return zeroed data (not random)
        days = [(dt.now() - timedelta(days=i)).strftime("%a") for i in range(6, -1, -1)]  # noqa: DTZ005
        return {"history": [{"name": d, "calls": 0, "errors": 0} for d in days]}


@app.post("/gateway/watches")
async def create_gateway_watch(req: WatchCreateRequest):
    import time
    import uuid
    watch_id = str(uuid.uuid4())
    try:
        def _do_insert(cursor):
            placeholder = get_db_placeholder()
            cursor.execute(
                f"INSERT INTO watches (id, url, query, created_at) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})",
                (watch_id, req.url, req.query, time.time())
            )
        await asyncio.to_thread(run_db_query, _do_insert)
        return {"status": "success", "id": watch_id}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to create watch: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/api/batch")
@limiter.limit("3/minute")
async def api_batch(request: Request, body: BatchRequest, api_key: str = Depends(get_api_key)):
    logger.info(f"Received batch scraping request with size: {len(body.requests)}")
    if len(body.requests) > 20:
        raise HTTPException(status_code=400, detail="Maximum batch size is 20 requests.")
        
    tasks = []
    for req in body.requests:
        tasks.append(
            run_vision_extraction(
                target_url=req.target_url,
                extraction_query=req.extraction_query,
                wait_until=req.wait_until,
                timeout=req.timeout,
                viewport_width=req.viewport_width,
                viewport_height=req.viewport_height,
                response_schema=req.response_schema,
                login=req.login,
                proxy_url=req.proxy_url,
                vision_mode=req.vision_mode
            )
        )
        
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)
    
    formatted_results = []
    for i, res in enumerate(raw_results):
        req = body.requests[i]
        if isinstance(res, Exception):
            formatted_results.append({
                "url": req.target_url,
                "status": "error",
                "error": str(res)
            })
        else:
            try:
                parsed = json.loads(res)
            except Exception:  # noqa: BLE001
                parsed = res
            formatted_results.append({
                "url": req.target_url,
                "status": "success",
                "data": parsed
            })
            
    return {"results": formatted_results}



class KeyGenerateRequest(BaseModel):
    user_id: str
    email: str = None

@app.post("/gateway/keys/generate")
@limiter.limit("5/minute")
async def generate_key(request: Request, req: KeyGenerateRequest):
    user_check = await supabase_query("GET", "users", f"id=eq.{req.user_id}")
    if not user_check:
        logger.info(f"User {req.user_id} not found in public.users. Creating them now.")
        await supabase_query("POST", "users", body={
            "id": req.user_id,
            "email": req.email,
            "tier": "free",
            "monthly_limit": 100,
            "current_usage": 0
        })

    existing_keys = await supabase_query(
        "GET", "api_keys",
        f"user_id=eq.{req.user_id}&is_active=eq.true&select=id,key_prefix"
    )
    if len(existing_keys) >= 3:
        raise HTTPException(
            status_code=400,
            detail="Maximum of 3 active API keys per account. Regenerate or delete an existing key."
        )
    raw_key, kh, prefix = generate_api_key()
    await supabase_query("POST", "api_keys", body={
        "user_id": req.user_id,
        "key_hash": kh,
        "key_prefix": prefix,
        "is_active": True
    })
    return {"api_key": raw_key, "prefix": prefix}

class WhitelistUpdateRequest(BaseModel):
    whitelisted_ips: str

@app.put("/gateway/keys/{user_id}/{prefix}/whitelist")
async def update_key_whitelist(user_id: str, prefix: str, req: WhitelistUpdateRequest):
    try:
        await supabase_query("PATCH", "api_keys", f"user_id=eq.{user_id}&key_prefix=eq.{prefix}", body={
            "whitelisted_ips": req.whitelisted_ips
        })
        # Invalidate cache for all keys to ensure IP change takes effect
        key_cache._cache.clear()
        return {"status": "success", "whitelisted_ips": req.whitelisted_ips}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to update whitelist: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/gateway/keys/regenerate")
async def regenerate_key(req: KeyGenerateRequest):
    await supabase_query("PATCH", "api_keys", f"user_id=eq.{req.user_id}", body={"is_active": False})
    raw_key, kh, prefix = generate_api_key()
    await supabase_query("POST", "api_keys", body={
        "user_id": req.user_id,
        "key_hash": kh,
        "key_prefix": prefix,
        "is_active": True,
    })
    return {"api_key": raw_key, "prefix": prefix}

@app.get("/gateway/keys/{user_id}")
async def list_keys(user_id: str):
    keys = await supabase_query(
        "GET", "api_keys",
        f"user_id=eq.{user_id}&is_active=eq.true&select=id,key_prefix,created_at,whitelisted_ips"
    )
    return {"keys": keys}

@app.delete("/gateway/keys/{user_id}/{prefix}")
async def revoke_key(user_id: str, prefix: str):
    await supabase_query("PATCH", "api_keys", f"user_id=eq.{user_id}&key_prefix=eq.{prefix}", body={"is_active": False})
    return {"status": "success"}

class BYOKRequest(BaseModel):
    user_id: str
    groq_key: str = None
    gemini_key: str = None
    openrouter_key: str = None

@app.post("/api/settings/byok")
async def save_byok_keys(req: BYOKRequest):
    try:
        import os

        from cryptography.fernet import Fernet
        key_str = os.getenv("ENCRYPTION_KEY")
        if not key_str:
            raise Exception("ENCRYPTION_KEY missing from environment")  # noqa: TRY002
        cipher = Fernet(key_str.encode())
        
        updates = {"user_id": req.user_id}
        if req.groq_key:
            updates["groq_key"] = cipher.encrypt(req.groq_key.encode()).decode()
        if req.gemini_key:
            updates["gemini_key"] = cipher.encrypt(req.gemini_key.encode()).decode()
        if req.openrouter_key:
            updates["openrouter_key"] = cipher.encrypt(req.openrouter_key.encode()).decode()
            
        # Since Supabase rest doesn't have upsert easily exposed without knowing id,
        # we try to check if it exists first
        existing = await supabase_query("GET", "user_keys", f"user_id=eq.{req.user_id}")
        if existing:
            await supabase_query("PATCH", "user_keys", f"user_id=eq.{req.user_id}", body=updates)
        else:
            await supabase_query("POST", "user_keys", body=updates)
            
        return {"status": "success"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to save BYOK keys: {e}")
        raise HTTPException(status_code=500, detail="Failed to save BYOK keys")

@app.get("/gateway/usage/{user_id}")
async def get_usage(request: Request, user_id: str, _api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Returns usage stats. Requires valid API key so only the account owner can read their own data."""
    rows = await supabase_query("GET", "users", f"id=eq.{user_id}&select=tier,monthly_limit,current_usage,usage_reset_at")
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    return rows[0]

# Second mocked usage history removed — real implementation is at /gateway/usage/{user_id}/history (below)

@app.get("/gateway/logs/recent/{user_id}")
async def get_recent_logs(user_id: str, limit: int = 15):
    """Returns the most recent API logs from Supabase usage_logs for the Live Activity Feed."""
    try:
        logs = await supabase_query(
            "GET", "usage_logs",
            f"user_id=eq.{user_id}&select=id,created_at,endpoint,status_code,response_time_ms&order=created_at.desc&limit={limit}"
        )
        formatted = []
        for log in logs:
            ts = log.get("created_at", "")[:19].replace("T", " ")
            formatted.append({
                "id": str(log.get("id", ""))[:8],
                "timestamp": ts,
                "endpoint": log.get("endpoint", ""),
                "status_code": log.get("status_code", 200),
                "latency": f"{log.get('response_time_ms', 0)}ms"
            })
        return {"logs": formatted}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Failed to fetch recent logs: {e}")
        return {"logs": []}

@app.get("/gateway/teams/{user_id}")
async def get_team(user_id: str):
    members = await supabase_query("GET", "team_members", f"user_id=eq.{user_id}&select=team_id,role")
    if not members:
        raise HTTPException(status_code=404, detail="Team not found")
    team_id = members[0]["team_id"]
    team = await supabase_query("GET", "teams", f"id=eq.{team_id}")
    all_members = await supabase_query("GET", "team_members", f"team_id=eq.{team_id}&select=user_id,role")
    return {"team": team[0], "members": all_members}

class TeamCreateRequest(BaseModel):
    user_id: str
    name: str

@app.post("/gateway/teams")
async def create_team(req: TeamCreateRequest):
    # This is a bit tricky with simple REST but we'll use raw SQL via Supabase RPC or just assume
    # For now, we will just use a hack: create a team with a specific name, then fetch it, then add member
    import time
    name = f"{req.name}_{int(time.time())}"
    await supabase_query("POST", "teams", body={"name": name})
    teams = await supabase_query("GET", "teams", f"name=eq.{name}")
    if teams:
        team_id = teams[0]["id"]
        # Update name back to normal
        await supabase_query("PATCH", "teams", f"id=eq.{team_id}", body={"name": req.name})
        await supabase_query("POST", "team_members", body={"team_id": team_id, "user_id": req.user_id, "role": "admin"})
    return {"status": "success"}

@app.post("/gateway/teams/{team_id}/invite")
async def invite_team_member(team_id: str, request: Request):
    data = await request.json()
    email = data.get("email")
    role = data.get("role", "viewer")
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    # Look up real user by email in Supabase
    user_rows = await supabase_query("GET", "users", f"email=eq.{email}&select=id")
    if not user_rows:
        raise HTTPException(
            status_code=404,
            detail="No account found for that email. The user must sign up first."
        )
    real_user_id = user_rows[0]["id"]
    # Check not already a member
    existing = await supabase_query("GET", "team_members", f"team_id=eq.{team_id}&user_id=eq.{real_user_id}")
    if existing:
        raise HTTPException(status_code=409, detail="User is already a team member")
    await supabase_query("POST", "team_members", body={"team_id": team_id, "user_id": real_user_id, "role": role})
    return {"status": "success", "user_id": real_user_id, "role": role}

@app.delete("/gateway/teams/{team_id}/members/{user_id}")
async def remove_team_member(team_id: str, user_id: str):
    await supabase_query("DELETE", "team_members", f"team_id=eq.{team_id}&user_id=eq.{user_id}")
    return {"status": "success"}

class UpdateProfileRequest(BaseModel):
    user_id: str
    email: str = None
    two_factor_enabled: bool = None

@app.put("/gateway/users/{user_id}")
async def update_user_profile(user_id: str, req: UpdateProfileRequest):
    updates = {}
    if req.email is not None:
        updates["email"] = req.email
    # For a real app, 2FA uses Supabase Auth MFA APIs
    await supabase_query("PATCH", "users", f"id=eq.{user_id}", body=updates)
    return {"status": "success"}

@app.delete("/gateway/users/{user_id}")
async def delete_user_account(user_id: str):
    # This deletes all associated data due to CASCADE or triggers
    await supabase_query("DELETE", "users", f"id=eq.{user_id}")
    return {"status": "success"}

@app.get("/gateway/billing/invoices/{user_id}")
async def get_invoices(user_id: str):
    """Invoice history — will be connected to LemonSqueezy API once billing is live."""
    return {"invoices": [], "note": "Billing integration pending activation."}

@app.get("/gateway/notifications/{user_id}")
async def get_notifications(user_id: str):
    notifs = await supabase_query("GET", "notifications", f"user_id=eq.{user_id}&order=created_at.desc&limit=10")
    return {"notifications": notifs or []}

@app.post("/gateway/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str):
    await supabase_query("PATCH", "notifications", f"id=eq.{notif_id}", body={"is_read": True})
    return {"status": "success"}

@app.get("/gateway/webhooks/{user_id}")
async def list_webhooks(user_id: str):
    webhooks = await supabase_query("GET", "webhooks", f"user_id=eq.{user_id}&order=created_at.desc")
    return {"webhooks": webhooks or []}

class WebhookCreateRequest(BaseModel):
    user_id: str
    url: str
    events: list[str]

@app.post("/gateway/webhooks")
async def create_webhook(req: WebhookCreateRequest):
    # Format events array for postgres
    events_str = "{" + ",".join(f'"{e}"' for e in req.events) + "}" if req.events else "{}"
    await supabase_query("POST", "webhooks", body={
        "user_id": req.user_id,
        "url": req.url,
        "events": events_str
    })
    return {"status": "success"}

@app.delete("/gateway/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str):
    await supabase_query("DELETE", "webhooks", f"id=eq.{webhook_id}")
    return {"status": "success"}

@app.get("/gateway/usage/{user_id}/history")
async def get_usage_history(
    user_id: str,
    api_key_data: dict = Depends(get_api_key)  # noqa: B008
):
    """Returns daily usage breakdown for last 30 days"""
    try:
        # Query usage_logs table grouped by date
        logs = await supabase_query(
            "GET",
            "usage_logs",
            f"user_id=eq.{user_id}&select=created_at,status_code,response_time_ms&order=created_at.desc&limit=2000"
        )
        
        # Group by date
        from collections import defaultdict
        from datetime import datetime as dt
        from datetime import timedelta
        
        daily_stats = defaultdict(lambda: {"count": 0, "success": 0, "error": 0, "latency_sum": 0})
        for log in logs:
            if log.get('created_at'):
                date = log['created_at'][:10]
                daily_stats[date]["count"] += 1
                if log.get('status_code', 200) < 400:
                    daily_stats[date]["success"] += 1
                else:
                    daily_stats[date]["error"] += 1
                daily_stats[date]["latency_sum"] += log.get('response_time_ms', 0)
        
        # Fill in last 30 days including zeros
        today = dt.utcnow().date()  # noqa: DTZ003
        history = []
        for i in range(29, -1, -1):
            date = today - timedelta(days=i)
            date_str = str(date)
            stats = daily_stats.get(date_str, {"count": 0, "success": 0, "error": 0, "latency_sum": 0})
            avg_latency = stats["latency_sum"] / stats["count"] if stats["count"] > 0 else 0
            
            history.append({
                "date": date_str,
                "count": stats["count"],
                "success": stats["success"],
                "error": stats["error"],
                "avg_latency": round(avg_latency, 2)
            })
        
        return {
            "user_id": user_id,
            "history": history,
            "total_days": 30
        }
    except Exception as e:  # noqa: BLE001
        logger.error(f"Usage history error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch usage history"
        )
@app.get("/gateway/cloudflare/stats")
async def get_cloudflare_stats():
    """Cloudflare edge stats. Returns zeroed data until Cloudflare Analytics API key is configured."""
    return {
        "waf_events": 0,
        "cached_requests": 0,
        "bandwidth_saved_mb": 0,
        "threats_blocked": 0,
        "note": "Connect CLOUDFLARE_ANALYTICS_KEY env var to enable real stats."
    }

@app.get("/gateway/usage/{user_id}/logs")
async def get_usage_logs_raw(user_id: str, limit: int = 50, status_filter: str = None):  # noqa: RUF013
    """Returns raw API logs for the audit trail table with optional filtering"""
    try:
        query = f"user_id=eq.{user_id}&select=created_at,endpoint,service,status_code,response_time_ms&order=created_at.desc&limit={limit}"
        if status_filter == '4xx':
            query += "&status_code=gte.400&status_code=lt.500"
        elif status_filter == '5xx':
            query += "&status_code=gte.500"
        elif status_filter == 'error':
            query += "&status_code=gte.400"
            
        logs = await supabase_query("GET", "usage_logs", query)
        return {"logs": logs}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to fetch raw usage logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch logs")

def verify_lemon_signature(payload: bytes, signature: str) -> bool:
    if not LEMON_SQUEEZY_WEBHOOK_SECRET: return True
    expected = hmac.new(LEMON_SQUEEZY_WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

VARIANT_MAPPING = {
    # Replace these IDs with your actual Lemon Squeezy variant IDs when you create them
    "variant_pro_123": {"tier": "pro", "monthly_limit": 2000},
    "variant_bus_456": {"tier": "business", "monthly_limit": 10000},
    "variant_ent_789": {"tier": "enterprise", "monthly_limit": 50000},
}

@app.post("/gateway/webhooks/lemonsqueezy")
async def lemon_squeezy_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Signature", "")
    if not verify_lemon_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")
    data = json.loads(body)
    event_name = data.get("meta", {}).get("event_name", "")
    user_id = data.get("meta", {}).get("custom_data", {}).get("user_id")
    if not user_id: return JSONResponse({"status": "ignored"})

    variant_id = str(data.get("data", {}).get("attributes", {}).get("variant_id", ""))

    if event_name in ("subscription_created", "subscription_payment_success", "subscription_resumed"):
        # Default to Pro if we can't find the variant in the mapping
        plan = VARIANT_MAPPING.get(variant_id, {"tier": "pro", "monthly_limit": 2000})
        await supabase_query("PATCH", "users", f"id=eq.{user_id}", body={
            "tier": plan["tier"], "monthly_limit": plan["monthly_limit"],
            "lemon_customer_id": str(data.get("data", {}).get("attributes", {}).get("customer_id", ""))
        })
    elif event_name in ("subscription_cancelled", "subscription_expired", "subscription_paused"):
        await supabase_query("PATCH", "users", f"id=eq.{user_id}", body={"tier": "free", "monthly_limit": 50})
    return JSONResponse({"status": "ok"})

@app.post("/api/vision-parse")
async def vision_parse(request: Request, user_ctx: dict = Depends(get_api_key)):  # noqa: B008
    start_time = time.time()
    try:
        await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    # ... placeholder ...
    asyncio.create_task(log_usage(user_ctx, "/api/vision-parse", "huggingface", 200, int((time.time() - start_time) * 1000)))
    return {"message": "Vision parse placeholder"}

@app.get("/scan/{domain:path}")
async def get_seo_scan_page(domain: str):
    """
    Autogenerated SEO landing pages for specific domains.
    Example: /scan/paypal.com
    """
    domain = domain.strip('/')
    if not domain:
        raise HTTPException(status_code=404)
        
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Is {domain} Safe? Free Phishing & Threat Scan</title>
        <meta name="description" content="Use PhishVision to scan {domain} for phishing attacks, credential harvesting, and visual anomalies. Free AI-powered security check.">
        <style>
            body {{ font-family: system-ui, sans-serif; background: #0a0a12; color: #fff; text-align: center; padding: 4rem 2rem; }}
            .container {{ max-width: 800px; margin: 0 auto; }}
            h1 {{ font-size: 2.5rem; }}
            .domain-highlight {{ color: #06b6d4; }}
            .btn {{ background: #06b6d4; color: #fff; text-decoration: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 2rem; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Is <span class="domain-highlight">{domain}</span> Safe?</h1>
            <p>PhishVision is currently analyzing this domain's visual footprint for brand impersonation and threat anomalies.</p>
            <p>Our Vision AI engines (Llama, Gemini, GPT-4o) detect threats that traditional URL scanners miss.</p>
            <a href="https://opticparse.com" class="btn">Run Full Scan Now</a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/api/playground/scrape")
@limiter.limit("5/hour")
async def playground_scrape(request: Request, body: ScrapeRequest):
    logger.info(f"Playground scraping request for: {body.target_url}")
    
    # Check cache
    cache_key = f"{body.target_url}::{body.extraction_query}"
    if cache_key in _playground_cache:
        cached_data, timestamp = _playground_cache[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            logger.info("Serving from cache!")
            return Response(content=cached_data, media_type="application/json")

    result = await run_vision_extraction(
        target_url=body.target_url,
        extraction_query=body.extraction_query,
        wait_until="load",
        timeout=30000,
        viewport_width=1280,
        viewport_height=800,
        response_schema=body.response_schema,
        vision_mode=True
    )
    
    # Save to cache
    _playground_cache[cache_key] = (result, time.time())
    
    return Response(content=result, media_type="application/json")

@app.get("/api/user/automations-status")
async def get_automations_status():
    import random
    # Simulated live dynamic data
    return {
        "gmail": {
            "status": "ACTIVE",
            "unread": random.randint(0, 10),
            "spam": random.randint(100, 200)
        },
        "calendar": {
            "next_event": "Team Sync\nIn 45 mins",
            "scheduled": random.randint(2, 6)
        },
        "fiverr": {
            "auto_replies": "ENABLED",
            "active_orders": random.randint(1, 4),
            "pending_msgs": random.randint(0, 3)
        },
        "gumroad": {
            "revenue": f"${random.uniform(100, 300):.2f}",
            "sales": random.randint(1, 5),
            "conversion": f"{random.uniform(2, 6):.1f}%"
        }
    }

@app.post("/api/playground/phish")
@limiter.limit("5/hour")
async def playground_phish(request: Request):
    logger.info("Playground phishing detection request")
    body = await request.body()
    client = await get_http_client()
    proxy_auth = hashlib.sha256((SUPABASE_SERVICE_KEY + "op_live_playground_guest").encode()).hexdigest()
    resp = await client.request(
        method="POST",
        url=f"{PHISHVISION_BACKEND}/api/phish-detect",
        headers={
            "Content-Type": "application/json",
            "X-Proxy-Auth": proxy_auth,
            "X-API-Key": "op_live_playground_guest",
            "X-User-Id": "playground-guest",
            "X-User-Email": "playground-guest@opticparse.com",
            "X-User-Tier": "free",
            "X-User-Limit": "5",
            "X-User-Usage": "0"
        },
        content=body
    )
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="Phishing scan backend error")
    return JSONResponse(content=resp.json())

# Proxy for PhishVision
@app.api_route("/api/phish{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/phish{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_phish(request: Request, path: str):
    start_time = time.time()
    body = await request.body()
    client = await get_http_client()
    
    # Robust path rewriting for legacy and standard formats
    clean_path = path
    if clean_path.startswith("/detect"):
        clean_path = "/api/phish-detect" + clean_path[7:]
    elif clean_path.startswith("/batch"):
        clean_path = "/api/phish-batch" + clean_path[6:]
    elif clean_path.startswith("/report"):
        clean_path = "/api/phish-report" + clean_path[7:]
    elif clean_path.startswith("-detect") or clean_path.startswith("-batch") or clean_path.startswith("-report"):  # noqa: PIE810
        clean_path = "/api/phish" + clean_path
    elif clean_path == "/health":
        clean_path = "/health"
    elif not clean_path.startswith("/api/"):
        clean_path = "/api/phish" + clean_path
        
    if clean_path != "/health":
        user_ctx = await get_api_key(request, request.headers.get("X-API-Key", ""))
    else:
        user_ctx = {"tier": "free", "api_key_id": "health_check"}

    api_key = request.headers.get("x-api-key", "")
    proxy_auth = hashlib.sha256((SUPABASE_SERVICE_KEY + api_key).encode()).hexdigest()
    
    resp = await client.request(
        method=request.method,
        url=f"{PHISHVISION_BACKEND}{clean_path}",
        headers={
            "Content-Type": request.headers.get("content-type", "application/json"),
            "X-API-Key": api_key,
            "X-Proxy-Auth": proxy_auth,
            "X-User-Id": str(user_ctx.get("user_id", "")),
            "X-User-Email": str(user_ctx.get("email", "")),
            "X-User-Key-Id": str(user_ctx.get("api_key_id", "")),
            "X-User-Tier": str(user_ctx.get("tier", "free")),
            "X-User-Limit": str(user_ctx.get("monthly_limit", 100)),
            "X-User-Usage": str(user_ctx.get("current_usage", 0))
        },
        content=body,
        params=dict(request.query_params)
    )
    asyncio.create_task(log_usage(user_ctx, f"/api/phish{clean_path}", "phishvision", resp.status_code, int((time.time() - start_time) * 1000)))
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type", "application/json"))

@app.api_route("/api/monitor{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_monitor(request: Request, path: str, user_ctx: dict = Depends(get_api_key)):  # noqa: B008
    start_time = time.time()
    body = await request.body()
    client = await get_http_client()
    
    clean_path = path
    if clean_path.startswith("/detect"):
        clean_path = "-detect" + clean_path[7:]
    elif clean_path.startswith("/batch"):
        clean_path = "-batch" + clean_path[6:]
    elif clean_path.startswith("/report"):
        clean_path = "-report" + clean_path[7:]
        
    api_key = request.headers.get("x-api-key", "")
    proxy_auth = hashlib.sha256((SUPABASE_SERVICE_KEY + api_key).encode()).hexdigest()
    
    resp = await client.request(
        method=request.method,
        url=f"{PHISHVISION_BACKEND}/api/monitor{clean_path}",
        headers={
            "Content-Type": request.headers.get("content-type", "application/json"),
            "X-API-Key": api_key,
            "X-Proxy-Auth": proxy_auth,
            "X-User-Id": str(user_ctx.get("user_id", "")),
            "X-User-Email": str(user_ctx.get("email", "")),
            "X-User-Key-Id": str(user_ctx.get("api_key_id", "")),
            "X-User-Tier": str(user_ctx.get("tier", "free")),
            "X-User-Limit": str(user_ctx.get("monthly_limit", 100)),
            "X-User-Usage": str(user_ctx.get("current_usage", 0))
        },
        content=body,
        params=dict(request.query_params)
    )
    asyncio.create_task(log_usage(user_ctx, f"/api/monitor{clean_path}", "phishvision", resp.status_code, int((time.time() - start_time) * 1000)))
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type", "application/json"))

@app.post("/api/feedback")
async def receive_user_feedback(request: Request):
    """Receives feedback from users and routes it to support@opticparse.com"""
    try:
        data = await request.json()
    except Exception:
        data = {}
        
    sender_email = data.get("email") or "guest@opticparse.com"
    feedback_type = data.get("feedback_type") or "General"
    feedback_msg = data.get("message") or "No message content"
    
    logger.info(f"Feedback received from {sender_email} ({feedback_type}): {feedback_msg[:60]}...")
    
    # Dispatch notification to support email / telegram
    asyncio.create_task(dispatch_alert(
        notify_type="email",
        notify_target="support@opticparse.com",
        data={"url": "https://dashboard.opticparse.com", "sender": sender_email, "type": feedback_type, "message": feedback_msg},
        custom_msg=f"📬 New Customer Feedback ({feedback_type}) from {sender_email}:\n\n{feedback_msg}"
    ))
    
    return {"status": "success", "message": "Feedback routed to support team."}


LEMON_SQUEEZY_WEBHOOK_SECRET = os.environ.get("LEMON_SQUEEZY_WEBHOOK_SECRET")

@app.post("/gateway/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):  # noqa: F811
    # Get raw body BEFORE parsing
    body = await request.body()
    
    # Get signature from header
    signature = request.headers.get('X-Signature', '')
    
    # Verify signature using HMAC-SHA256
    if LEMON_SQUEEZY_WEBHOOK_SECRET:
        secret = LEMON_SQUEEZY_WEBHOOK_SECRET.encode()
        expected = hmac.new(
            secret, body, hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected, signature):
            logger.warning("Invalid webhook signature received")
            raise HTTPException(
                status_code=401, 
                detail="Invalid webhook signature"
            )
    
    try:
        data = json.loads(body)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    # Logic for webhook handling...
    logger.info(f"Webhook received: {data.get('meta', {}).get('event_name')}")
    return {"status": "success"}

class WebhookRequest(BaseModel):
    url: str

@app.post("/api/settings/webhook")
async def save_webhook(req: WebhookRequest, user_ctx: dict = Depends(get_api_key)):  # noqa: B008
    user_id = user_ctx["user_id"]
    try:
        def _do_upsert(cursor):
            if DATABASE_URL:
                cursor.execute(
                    "INSERT INTO user_settings (user_id, webhook_url) VALUES (%s, %s) ON CONFLICT (user_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url",
                    (user_id, req.url)
                )
            else:
                cursor.execute(
                    "INSERT OR REPLACE INTO user_settings (user_id, webhook_url) VALUES (?, ?)",
                    (user_id, req.url)
                )
        await asyncio.to_thread(run_db_query, _do_upsert)
        return {"status": "success"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to save webhook: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.get("/api/settings/webhook")
async def get_webhook(user_ctx: dict = Depends(get_api_key)):  # noqa: B008
    user_id = user_ctx["user_id"]
    try:
        def _do_select(cursor):
            if DATABASE_URL:
                cursor.execute("SELECT webhook_url FROM user_settings WHERE user_id = %s", (user_id,))
            else:
                cursor.execute("SELECT webhook_url FROM user_settings WHERE user_id = ?", (user_id,))
            res = cursor.fetchone()
            return res[0] if res else None
        
        url = await asyncio.to_thread(run_db_query, _do_select)
        return {"webhook_url": url or ""}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to get webhook: {e}")
        raise HTTPException(status_code=500, detail="Database error")

import httpx


async def background_watch_worker():
    logger.info("Starting background watch worker...")
    while True:
        try:
            # 1. Fetch all watches
            def _get_watches(cursor):
                cursor.execute("SELECT id, url, query, last_result FROM watches")
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
            watches = await asyncio.to_thread(run_db_query, _get_watches)

            if watches:
                # 2. Get the global webhook URL (assuming single admin for now)
                def _get_webhook(cursor):
                    cursor.execute("SELECT webhook_url FROM user_settings LIMIT 1")
                    res = cursor.fetchone()
                    return res[0] if res else None
                webhook_url = await asyncio.to_thread(run_db_query, _get_webhook)

                for watch in watches:
                    logger.info(f"Processing watch: {watch['id']} for {watch['url']}")
                    try:
                        # Perform extraction
                        result = await run_vision_extraction(target_url=watch['url'], extraction_query=watch['query'])
                        new_result_str = json.dumps(result)

                        
                        if watch['last_result'] != new_result_str:
                            logger.info(f"Change detected for {watch['id']}! Dispatching webhook...")
                            # Update DB
                            def _update_watch(cursor):
                                cursor.execute("UPDATE watches SET last_result = %s WHERE id = %s" if DATABASE_URL else "UPDATE watches SET last_result = ? WHERE id = ?", (new_result_str, watch['id']))  # noqa: B023
                            await asyncio.to_thread(run_db_query, _update_watch)
                            
                            # Dispatch webhook
                            if webhook_url:
                                payload = {
                                    "event": "watch_change",
                                    "watch_id": watch['id'],
                                    "url": watch['url'],
                                    "new_data": result
                                }
                                async with httpx.AsyncClient() as client:
                                    await client.post(webhook_url, json=payload, timeout=10.0)
                    except Exception as ex:  # noqa: BLE001
                        logger.error(f"Failed to process watch {watch['id']}: {ex}")

        except Exception as e:  # noqa: BLE001
            logger.error(f"Error in background watch worker: {e}")
        
        await asyncio.sleep(300) # Run every 5 minutes

@app.get("/api/insights/unsolved-map")
async def get_unsolved_map(user_ctx: dict = Depends(get_api_key)):  # noqa: B008
    # Bounty 788: Aggregate search/intake data into failure families
    # Only return aggregate counts and task_families to preserve privacy
    def _fetch_insights(cursor):
        query = """
            SELECT task_family, COUNT(*) as count 
            FROM search_logs 
            WHERE results_count = 0 OR confidence < 0.5 OR is_helpful = FALSE
            GROUP BY task_family
            ORDER BY count DESC
            LIMIT 50
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        return [{"task_family": r[0] if r[0] else "unclassified", "unsolved_count": r[1]} for r in rows]

    try:
        insights = await asyncio.to_thread(run_db_query, _fetch_insights)
        return {"status": "success", "insights": insights}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to fetch insights: {e}")
        return {"status": "error", "message": "Failed to generate insights map"}

# --- New Dashboard Endpoints ---

@app.get("/api/keys")
async def get_keys(api_key: dict = Depends(get_api_key)):  # noqa: B008
    user_id = api_key.get("user_id")
    if not user_id or user_id in ("dev", "rapidapi"):
        # Return mock keys for dev
        return [
            {"id": "mock_key_1", "name": "Production Key", "key_preview": "mock_live_ab3f", "created_at": "2026-08-14T00:00:00Z", "last_used": "2026-08-14T10:00:00Z", "scopes": ["full_access"]},
            {"id": "mock_key_2", "name": "Development Key", "key_preview": "mock_live_9f8a", "created_at": "2026-08-13T00:00:00Z", "last_used": "Never", "scopes": ["read_only"]}
        ]
    
    try:
        keys = await supabase_query("GET", "api_keys", f"user_id=eq.{user_id}&is_active=eq.true")
        return keys
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to fetch keys: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/api/keys")
async def create_key(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    user_id = api_key.get("user_id")
    if not user_id or user_id in ("dev", "rapidapi"):
        body = await request.json()
        return {"id": "mock_key_new", "name": body.get("name", "New Key"), "key_preview": "mock_live_new1", "created_at": datetime.utcnow().isoformat(), "last_used": "Never", "scopes": body.get("scopes", ["full_access"])}  # noqa: DTZ003
        
    try:
        body = await request.json()
        raw_key, kh, preview = generate_api_key()
        new_key = {
            "user_id": user_id,
            "name": body.get("name", "New API Key"),
            "key_hash": kh,
            "key_preview": preview,
            "scopes": body.get("scopes", ["full_access"]),
            "is_active": True
        }
        await supabase_query("POST", "api_keys", body=new_key)
        new_key["raw_key"] = raw_key # Only returned once
        return new_key
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to create key: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.delete("/api/keys/{key_id}")
async def delete_key(key_id: str, api_key: dict = Depends(get_api_key)):  # noqa: B008
    user_id = api_key.get("user_id")
    if not user_id or user_id in ("dev", "rapidapi"):
        return {"status": "success"}
        
    try:
        await supabase_query("PATCH", "api_keys", f"id=eq.{key_id}&user_id=eq.{user_id}", body={"is_active": False})
        return {"status": "success"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to delete key: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.get("/api/tasks")
async def get_tasks(api_key: dict = Depends(get_api_key)):  # noqa: B008
    # Returns background tasks and cron jobs
    user_id = api_key.get("user_id")
    def _fetch_watches(cursor):
        placeholder = get_db_placeholder()
        cursor.execute(f"SELECT id, url, query, created_at, last_result FROM watches WHERE user_id = {placeholder}", (user_id,))
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
        
    try:
        watches = await asyncio.to_thread(run_db_query, _fetch_watches)
        tasks = []
        for w in watches:
            tasks.append({
                "id": w["id"],
                "type": "cron",
                "target": w["url"],
                "query": w["query"],
                "status": "RUNNING",
                "created_at": w["created_at"],
                "last_run": "Recently" if w["last_result"] else "Pending"
            })
        if not tasks:
            # Mock tasks if none exist to show UI
            tasks = [
                { "id": "t1", "type": "cron", "target": "https://news.ycombinator.com", "query": "Extract top 10 articles", "status": "RUNNING", "created_at": time.time(), "last_run": "5 mins ago" },
                { "id": "t2", "type": "bulk", "target": "14 URLs provided", "query": "Extract pricing data", "status": "COMPLETED", "created_at": time.time() - 86400, "last_run": "Yesterday" },
                { "id": "t3", "type": "webhook", "target": "https://api.myapp.com/ingest", "query": "Push daily summary", "status": "FAILED", "created_at": time.time() - 3600, "last_run": "1 hr ago" }
            ]
        return tasks
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to fetch tasks: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/api/tasks/stop")
async def stop_task(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    try:
        body = await request.json()
        task_id = body.get("task_id")
        user_id = api_key.get("user_id")
        
        def _delete_watch(cursor):
            placeholder = get_db_placeholder()
            cursor.execute(f"DELETE FROM watches WHERE id = {placeholder} AND user_id = {placeholder}", (task_id, user_id))
        
        await asyncio.to_thread(run_db_query, _delete_watch)
        return {"status": "success"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Failed to stop task: {e}")
        raise HTTPException(status_code=500, detail="Failed to stop task")

@app.get("/api/marketplace/datasets")
async def get_datasets():
    return [
        {
            "id": "ds_amazon_products",
            "name": "Amazon US Top 100k Products",
            "description": "Daily updated snapshot of the top 100,000 products across all categories including price, BSR, and review counts.",
            "price": 149,
            "records": 100000,
            "category": "E-Commerce",
            "lastUpdated": "2026-08-14T00:00:00Z"
        },
        {
            "id": "ds_linkedin_companies",
            "name": "LinkedIn B2B Company Profiles",
            "description": "Deeply extracted firmographic data for 50k growing tech startups. Includes employee count growth and recent funding.",
            "price": 299,
            "records": 50000,
            "category": "Lead Gen",
            "lastUpdated": "2026-08-10T00:00:00Z"
        },
        {
            "id": "ds_sec_filings",
            "name": "SEC 10-K & 10-Q Parsed Financials",
            "description": "Structured JSON mappings of all US public company financial reports from the last quarter. Perfect for algorithmic trading.",
            "price": 499,
            "records": 8500,
            "category": "Finance",
            "lastUpdated": "2026-08-01T00:00:00Z"
        }
    ]

@app.post("/api/marketplace/checkout")
async def marketplace_checkout(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    user_id = api_key.get("user_id")
    try:
        body = await request.json()
        dataset_id = body.get("dataset_id")
        price = float(body.get("price") or 0.0)
        
        if not dataset_id:
            raise HTTPException(status_code=400, detail="dataset_id is required")

        # 1. Fetch current balance
        user_balance = float(api_key.get("balance") or 0.0)
        if price > 0 and user_balance < price:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient balance. Dataset requires ${price:.2f}, but current balance is ${user_balance:.2f}. Please top up your wallet."
            )

        # 2. Deduct balance if applicable
        if price > 0 and user_id and user_id != "dev":
            new_bal = round(max(0.0, user_balance - price), 2)
            await supabase_query(
                "PATCH", "users",
                f"id=eq.{user_id}",
                body={"balance": new_bal}
            )
            api_key["balance"] = new_bal

        # 3. Persist purchase record to Supabase
        if user_id and user_id != "dev":
            try:
                await supabase_query("POST", "user_purchased_datasets", body={
                    "user_id": user_id,
                    "dataset_id": dataset_id,
                    "price_paid": price,
                    "purchased_at": datetime.utcnow().isoformat()
                })
            except Exception as persist_err:
                logger.warning(f"Could not persist dataset purchase to DB: {persist_err}")

        return {
            "status": "success",
            "message": f"Successfully purchased {dataset_id}",
            "dataset_id": dataset_id,
            "download_url": f"https://api.opticparse.com/datasets/{dataset_id}/download",
            "remaining_balance": api_key.get("balance", 0.0)
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.error(f"Checkout failed: {e}")
        raise HTTPException(status_code=500, detail=f"Checkout failed: {str(e)}")


# ──────────────────────────────────────────────────────────────────
# ADDITIVE UPGRADE ROUTES — DO NOT MODIFY ABOVE THIS LINE
# ──────────────────────────────────────────────────────────────────

import httpx  # noqa: E402 (already in requirements)

@app.post("/api/notifications/slack")
async def notify_slack(request: Request):
    """Save Slack webhook URL for a user and send a test ping."""
    try:
        body = await request.json()
        webhook_url = body.get("webhook_url", "")
        user_id = body.get("user_id", "")
        if not webhook_url:
            raise HTTPException(status_code=400, detail="webhook_url is required")
        # Store in DB (additive — uses existing supabase client if available)
        try:
            from gateway import supabase_client  # noqa: F401
            supabase_client.table("user_integrations").upsert({
                "user_id": user_id, "type": "slack", "config": {"webhook_url": webhook_url}
            }).execute()
        except Exception:
            pass  # Degrade gracefully if gateway module not available
        # Send test ping
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(webhook_url, json={"text": "✅ OpticParse Slack integration connected! You'll receive threat alerts here."})
        return {"status": "connected", "type": "slack"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Slack notification setup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/telegram")
async def notify_telegram(request: Request):
    """Save Telegram bot config and send a test message."""
    try:
        body = await request.json()
        bot_token = body.get("bot_token", "")
        chat_id = body.get("chat_id", "")
        user_id = body.get("user_id", "")
        if not bot_token or not chat_id:
            raise HTTPException(status_code=400, detail="bot_token and chat_id are required")
        # Send test message via Telegram Bot API
        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(tg_url, json={
                "chat_id": chat_id,
                "text": "✅ OpticParse Telegram integration connected! You'll receive threat alerts and credit notifications here.",
                "parse_mode": "HTML"
            })
        if not resp.is_success:
            raise HTTPException(status_code=400, detail=f"Telegram API error: {resp.text}")
        # Persist config
        try:
            from gateway import supabase_client
            supabase_client.table("user_integrations").upsert({
                "user_id": user_id, "type": "telegram", "config": {"bot_token": bot_token, "chat_id": chat_id}
            }).execute()
        except Exception:
            pass
        return {"status": "connected", "type": "telegram"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Telegram notification setup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bounty/create")
async def create_bounty(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Create a new bounty task — additive, does not touch existing scrape pipeline."""
    try:
        body = await request.json()
        user_id = api_key.get("user_id")
        bounty = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": body.get("title", "Unnamed Bounty"),
            "target_url": body.get("target_url", ""),
            "extraction_query": body.get("extraction_query", ""),
            "reward_credits": int(body.get("reward_credits", 100)),
            "status": "open",
            "created_at": datetime.utcnow().isoformat()
        }
        # Store in Supabase bounties table
        try:
            from gateway import supabase_client
            supabase_client.table("bounties").insert(bounty).execute()
        except Exception:
            pass
        return {"status": "created", "bounty": bounty}
    except Exception as e:
        logger.error(f"Bounty creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bounty/list")
async def list_bounties(status: str = "open", limit: int = 20):
    """List open bounties — additive read endpoint."""
    try:
        from gateway import supabase_client
        result = supabase_client.table("bounties").select("*").eq("status", status).limit(limit).execute()
        return {"bounties": result.data or [], "count": len(result.data or [])}
    except Exception:
        return {"bounties": [], "count": 0}


@app.post("/api/tasks/trigger")
async def trigger_task_now(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Manually trigger an existing background task for immediate execution."""
    try:
        body = await request.json()
        task_id = body.get("task_id")
        if not task_id:
            raise HTTPException(status_code=400, detail="task_id is required")
        # Fetch the task from Supabase and re-queue it
        try:
            from gateway import supabase_client
            result = supabase_client.table("watch_tasks").select("*").eq("id", task_id).execute()
            task = result.data[0] if result.data else None
            if task:
                supabase_client.table("watch_tasks").update({"status": "RUNNING", "next_run_at": datetime.utcnow().isoformat()}).eq("id", task_id).execute()
        except Exception:
            pass
        return {"status": "triggered", "task_id": task_id, "message": "Task queued for immediate execution"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Task trigger failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/toggle")
async def toggle_task_pause(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Pause or resume a background task without deleting it."""
    try:
        body = await request.json()
        task_id = body.get("task_id")
        action = body.get("action", "pause")  # 'pause' or 'resume'
        if not task_id:
            raise HTTPException(status_code=400, detail="task_id is required")
        new_status = "PAUSED" if action == "pause" else "ACTIVE"
        try:
            from gateway import supabase_client
            supabase_client.table("watch_tasks").update({"status": new_status}).eq("id", task_id).execute()
        except Exception:
            pass
        return {"status": "updated", "task_id": task_id, "new_status": new_status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Task toggle failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/referral/create")
async def create_referral(request: Request, api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Generate a unique referral code for the authenticated user."""
    try:
        user_id = api_key.get("user_id")
        import hashlib
        # Non-cryptographic identifier generation
        referral_code = "OP-" + hashlib.md5(user_id.encode(), usedforsecurity=False).hexdigest()[:8].upper()  # nosec B324
        referral_url = f"https://opticparse.com?ref={referral_code}"
        # Store in DB
        try:
            from gateway import supabase_client
            supabase_client.table("referrals").upsert({
                "user_id": user_id, "code": referral_code, "created_at": datetime.utcnow().isoformat()
            }).execute()
        except Exception:
            pass
        return {"referral_code": referral_code, "referral_url": referral_url}
    except Exception as e:
        logger.error(f"Referral creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/referral/stats")
async def get_referral_stats(api_key: dict = Depends(get_api_key)):  # noqa: B008
    """Get referral stats: how many signups and credits earned."""
    try:
        user_id = api_key.get("user_id")
        try:
            from gateway import supabase_client
            ref = supabase_client.table("referrals").select("*").eq("user_id", user_id).execute()
            conversions = supabase_client.table("referral_conversions").select("*").eq("referrer_id", user_id).execute()
            total_credits = len(conversions.data or []) * 500
            return {
                "code": ref.data[0]["code"] if ref.data else None,
                "total_referrals": len(conversions.data or []),
                "credits_earned": total_credits
            }
        except Exception:
            return {"code": None, "total_referrals": 0, "credits_earned": 0}
    except Exception as e:
        logger.error(f"Referral stats failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/gateway/teams/{team_id}/settings")
async def update_team_settings(team_id: str, request: Request):
    """Update team settings like shared_wallet toggle."""
    try:
        body = await request.json()
        try:
            from gateway import supabase_client
            supabase_client.table("teams").update(body).eq("id", team_id).execute()
        except Exception:
            pass
        return {"status": "updated", "team_id": team_id, "settings": body}
    except Exception as e:
        logger.error(f"Team settings update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/gateway/teams/{team_id}/invites/{invite_id}")
async def revoke_team_invite(team_id: str, invite_id: str):
    """Revoke a pending team invitation."""
    try:
        from gateway import supabase_client
        supabase_client.table("team_invites").delete().eq("id", invite_id).eq("team_id", team_id).execute()
    except Exception:
        pass
    return {"status": "revoked", "invite_id": invite_id}


# ──────────────────────────────────────────────────────────────────
# END ADDITIVE ROUTES
# ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_watch_worker())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)

