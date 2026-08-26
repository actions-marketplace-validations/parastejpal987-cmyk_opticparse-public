export interface Env {
  // 1. AI & Machine Learning
  AI: any;
  VECTORIZE: any;

  // 2. Storage & Databases
  STORAGE: R2Bucket;
  DB: D1Database;
  CACHE_KV: KVNamespace;
  HYPERDRIVE: Hyperdrive;

  // 3. Compute & Architecture
  BROWSER: any; // Browser Rendering API
  RATE_LIMITER: DurableObjectNamespace;

  // 4. Queues
  QUEUE: Queue<any>;

  // 5. Observe & Investigate
  ANALYTICS: any; // Analytics Engine Dataset

  // Existing Environment Variables
  RENDER_INTERNAL_URL: string;
  INTERNAL_API_SECRET: string;
}

// -------------------------------------------------------------
// Durable Object: Rate Limiter (Globally Consistent)
// -------------------------------------------------------------
export class RateLimiter {
  state: DurableObjectState;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request) {
    // Basic token bucket rate limiting logic can go here
    return new Response("OK");
  }
}

// -------------------------------------------------------------
// Main Worker Routing
// -------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Content-Type, X-API-Key, X-Internal-Secret",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // Route: Geo-Location & Currency Detection (/api/geo)
    // -------------------------------------------------------------
    if (request.method === "GET" && (url.pathname === "/api/geo" || url.pathname === "/api/edge/geo")) {
      const countryCode = request.headers.get("cf-ipcountry") || "US";
      const isIndia = countryCode === "IN";
      return new Response(JSON.stringify({
        country: countryCode,
        isIndia: isIndia,
        currency: isIndia ? "INR" : "USD",
        currencySymbol: isIndia ? "₹" : "$",
        exchangeRate: 85,
        pppDiscountPct: isIndia ? 80 : 0
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -------------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/api/edge/webhooks/lemonsqueezy") {
      try {
        const bodyText = await request.text();
        const payload = JSON.parse(bodyText);
        
        // Example handling of Lemon Squeezy order created event
        if (payload.meta.event_name === 'order_created') {
          const userId = payload.meta.custom_data?.user_id;
          const amount = payload.data.attributes.total / 100; // Total in dollars
          
          if (userId && amount > 0) {
            // Update D1 Balance
            await env.DB.prepare(
              `INSERT INTO users (id, balance) VALUES (?1, ?2) 
               ON CONFLICT(id) DO UPDATE SET balance = balance + ?2`
            ).bind(userId, amount).run();

            await env.DB.prepare(
              `INSERT INTO transactions (id, user_id, amount, type) VALUES (?1, ?2, ?3, 'deposit')`
            ).bind(crypto.randomUUID(), userId, amount).run();
            
            return new Response("Webhook processed", { status: 200 });
          }
        }
        return new Response("Webhook received", { status: 200 });
      } catch (err: any) {
        return new Response("Webhook processing failed", { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // Route: API Key Generation (Gateway)
    // -------------------------------------------------------------
    const generateApiKey = () => {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      return `op_live_${token}`;
    };

    if (request.method === "POST" && (url.pathname === "/gateway/keys/generate" || url.pathname === "/gateway/keys/regenerate")) {
      try {
        const body = await request.json() as any;
        const userId = body.user_id;
        
        if (!userId) {
          return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const newApiKey = generateApiKey();
        
        if (env.DB) {
          // Upsert the user into D1 with the new API key and a default starting balance (e.g. $5.00 for testing)
          await env.DB.prepare(
            `INSERT INTO users (id, api_key, balance) VALUES (?1, ?2, 5.00) 
             ON CONFLICT(id) DO UPDATE SET api_key = ?2`
          ).bind(userId, newApiKey).run();
        }

        return new Response(JSON.stringify({ api_key: newApiKey }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Key generation failed: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // -------------------------------------------------------------
    // Global Middleware: Billing Shield & Analytics (with PPP)
    // -------------------------------------------------------------
    const startMs = Date.now();
    const apiKey = request.headers.get("X-API-Key") || "anonymous";
    // Get country code from Cloudflare's edge headers for PPP
    const countryCode = request.headers.get("cf-ipcountry") || "US"; 
    let userId = null;

    if (apiKey !== "anonymous" && env.DB && url.pathname.startsWith("/api/edge/")) {
      // 1. Verify Key and Check Balance
      const userResult = await env.DB.prepare("SELECT id, balance FROM users WHERE api_key = ?1").bind(apiKey).first();
      
      if (!userResult) {
        // Fallback: If not in D1 yet, let it through for now (hybrid mode)
      } else if ((userResult.balance as number) <= 0) {
        // Check for Autonomous AI Agent on-chain payment proof
        const paymentTx = request.headers.get("X-Payment-TxHash") || request.headers.get("X-Payment-Proof");
        if (paymentTx && paymentTx.length >= 32) {
          // Allow instant edge pass-through for settled on-chain crypto micropayment
        } else {
          return new Response(JSON.stringify({ 
            error: "Payment Required: Autonomous AI Agent Micropayment Gateway",
            price_usd: 0.05,
            accepted_protocols: ["evm_usdc", "solana_usdc", "opticparse_api_key"],
            pay_to_evm: "0xd458E709e7d54fd3659EF66624A621Cde74EDD27",
            pay_to_solana: "7vW8aD6oV9qN6gqZ5hZ8U9yN3vK1xL7mP2oR4sT6uV8w",
            network: "Polygon / Base / Solana",
            instructions: "Send $0.05 USDC to pay_to address and retry with header: 'X-Payment-TxHash: <transaction_hash>', or use your OpticParse API Key."
          }), {
            status: 402, // 402 Payment Required
            headers: { 
              ...corsHeaders, 
              "Content-Type": "application/json",
              "X-Payment-Required": "true",
              "X-Payment-Amount": "0.05",
              "X-Payment-Currency": "USDC",
              "X-Payment-Address-EVM": "0xd458E709e7d54fd3659EF66624A621Cde74EDD27",
              "X-Payment-Address-Solana": "7vW8aD6oV9qN6gqZ5hZ8U9yN3vK1xL7mP2oR4sT6uV8w"
            }
          });
        }
      } else {
        userId = userResult.id;
        
        // 2. Purchasing Power Parity (PPP) Pricing Logic
        let cost = 0.01; // Base cost $0.01 per request (US, UK, EU, etc)
        
        // 80% discount for emerging markets (Tier 3)
        if (["IN", "ID", "PH", "BR", "NG", "PK", "BD", "VN"].includes(countryCode)) {
           cost = 0.002; 
        } 
        // 50% discount for developing markets (Tier 2)
        else if (["MX", "AR", "ZA", "EG", "TR", "CO", "MY", "TH"].includes(countryCode)) {
           cost = 0.005; 
        }

        // Deduct cost based on geo-location
        await env.DB.prepare("UPDATE users SET balance = balance - ?2 WHERE id = ?1").bind(userId, cost).run();
      }
    }
    
    // Log function to be called before returning response
    const logAnalytics = (statusCode: number, endpoint: string) => {
      try {
        if (env.ANALYTICS) {
          env.ANALYTICS.writeDataPoint({
            blobs: [apiKey, endpoint, request.method],
            doubles: [Date.now() - startMs, statusCode],
            indexes: [apiKey]
          });
        }
      } catch (e) {
        console.error("Analytics Engine Error:", e);
      }
    };

    try {
      // -------------------------------------------------------------
      // Route: Browser Rendering API (Scraper)
      // -------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/api/edge/scrape") {
        const body = await request.json() as any;
        const targetUrl = body.url || body.target_url;
        
        if (!targetUrl) {
          logAnalytics(400, "/api/edge/scrape");
          return new Response(JSON.stringify({ error: "Missing URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        try {
          const puppeteer = await import("@cloudflare/puppeteer");
          const browser = await puppeteer.launch(env.BROWSER);
          const page = await browser.newPage();
          await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
          
          const title = await page.title();
          
          // Here we would typically extract the raw HTML and pass it to AI, 
          // or run DOM extraction scripts natively in the edge browser.
          const result = {
            url: targetUrl,
            title: title,
            engine: "Cloudflare Browser Rendering API (Edge)",
            message: "Successfully ran headless browser on the edge."
          };
          
          await browser.close();
          logAnalytics(200, "/api/edge/scrape");
          
          return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (err: any) {
          logAnalytics(500, "/api/edge/scrape");
          return new Response(JSON.stringify({ error: "Browser execution failed: " + err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // -------------------------------------------------------------
      // Route: PhishVision (AI + Vectorize + KV Caching)
      // -------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/api/edge/phish") {
        const body = await request.json() as any;
        const targetUrl = body.url || body.target_url;
        
        if (!targetUrl) {
          logAnalytics(400, "/api/edge/phish");
          return new Response(JSON.stringify({ error: "Missing URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 1. Check KV Cache for blazing fast 10ms responses
        const cacheKey = `phish:${targetUrl}`;
        const cached = env.CACHE_KV ? await env.CACHE_KV.get(cacheKey) : null;
        if (cached) {
          logAnalytics(200, "/api/edge/phish (cached)");
          return new Response(cached, { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });
        }

        // 2. Run Edge AI Model
        const prompt = `Analyze this URL for phishing characteristics: ${targetUrl}. Respond with a JSON object containing exactly two keys: 'is_phishing' (boolean) and 'confidence' (integer 0-100). Do not include any other text.`;
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            { role: "system", content: "You are PhishVision, an expert cybersecurity AI. Always respond in valid JSON format." },
            { role: "user", content: prompt }
          ]
        });

        let aiAnalysis = aiResponse.response;
        try { aiAnalysis = JSON.parse(aiResponse.response); } catch (e) {}

        const finalResult = JSON.stringify({
          url: targetUrl,
          ai_analysis: aiAnalysis,
          is_edge: true,
          powered_by: "Cloudflare Workers AI + Vectorize"
        });

        // Store in KV Cache for 1 hour
        if (env.CACHE_KV) {
          await env.CACHE_KV.put(cacheKey, finalResult, { expirationTtl: 3600 });
        }

        logAnalytics(200, "/api/edge/phish");
        return new Response(finalResult, { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
      }

      // -------------------------------------------------------------
      // Route: Hyperdrive DB Connection Pooling Testing
      // -------------------------------------------------------------
      if (request.method === "GET" && url.pathname === "/api/edge/db") {
        // Placeholder for Postgres connection via Hyperdrive
        logAnalytics(200, "/api/edge/db");
        return new Response(JSON.stringify({
          status: "Hyperdrive active",
          message: "Ready to connect to Supabase via pooled Edge connection string."
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // -------------------------------------------------------------
      // Route: D1 Database (Monitor Stats)
      // -------------------------------------------------------------
      if (request.method === "GET" && url.pathname === "/api/edge/monitors") {
        let results = [];
        if (env.DB) {
           const dbRes = await env.DB.prepare("SELECT * FROM users").all();
           results = dbRes.results as any;
        }
        logAnalytics(200, "/api/edge/monitors");
        return new Response(JSON.stringify({
          status: "D1 active",
          results: results
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // -------------------------------------------------------------
      // Route: Queue Push (Async jobs)
      // -------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/api/queue/push") {
        const body = await request.json() as any;
        if (env.QUEUE) {
          await env.QUEUE.send(body);
        }
        logAnalytics(200, "/api/queue/push");
        return new Response(JSON.stringify({ status: "queued", success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      // -------------------------------------------------------------
      // Route: Gateway Usage (Dashboard)
      // -------------------------------------------------------------
      if (request.method === "GET" && url.pathname.startsWith("/gateway/usage/")) {
        const uid = url.pathname.split("/").pop();
        if (env.DB && uid) {
          const userRecord = await env.DB.prepare("SELECT balance FROM users WHERE id = ?1").bind(uid).first();
          const balance = userRecord ? (userRecord.balance as number) : 0;
          // Return simulated usage object based on balance (e.g., $5 = 5000 calls remaining)
          return new Response(JSON.stringify({
            tier: balance > 0 ? "pro" : "free",
            monthly_limit: 10000,
            current_usage: Math.max(0, 10000 - Math.floor(balance * 1000)), // dummy math: 1 cent = 10 calls
            usage_reset_at: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ tier: 'free', monthly_limit: 100, current_usage: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Default Fallback
      logAnalytics(200, "/");
      return new Response(JSON.stringify({ 
        message: "OpticParse Ultimate Edge is running.",
        features: ["AI", "Vectorize", "R2", "D1", "KV", "Hyperdrive", "Browser", "Durable Objects", "Queues", "Analytics"]
      }), { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e: any) {
      logAnalytics(500, url.pathname);
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },

  // -------------------------------------------------------------
  // Queue Consumer (Workers pulling from Queue)
  // -------------------------------------------------------------
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const renderUrl = env.RENDER_INTERNAL_URL || "https://opticparse-api.onrender.com/api/internal/execute_async_job";
        const secret = env.INTERNAL_API_SECRET || "opticparse_internal_worker_secret";

        const response = await fetch(renderUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": secret
          },
          body: JSON.stringify(msg.body)
        });

        if (response.ok) {
          msg.ack();
        } else {
          console.error(`Render execution failed. Status: ${response.status}`);
          msg.retry();
        }
      } catch (err) {
        console.error("Queue fetch error calling Render", err);
        msg.retry();
      }
    }
  }
};
