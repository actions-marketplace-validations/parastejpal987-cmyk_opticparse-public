import { CreateMLCEngine } from "@mlc-ai/web-llm";

// The singleton instance of our local MLCEngine
let mlcEngine = null;

/**
 * Initializes the WebLLM engine with the specified model if not already initialized.
 * Allows tracking loading progress via the provided callback.
 */
export async function initLocalEngine(initProgressCallback) {
  if (mlcEngine) return mlcEngine;

  if (!navigator.gpu) {
    throw new Error("WEBGPU_UNSUPPORTED");
  }

  try {
    // We use a highly optimized, small Llama 3 model for browser efficiency
    const selectedModel = "Llama-3.1-8B-Instruct-q4f32_1-MLC-1k";
    mlcEngine = await CreateMLCEngine(selectedModel, {
      initProgressCallback: initProgressCallback,
    });
    return mlcEngine;
  } catch (err) {
    console.error("Failed to initialize local MLCEngine:", err);
    throw err;
  }
}

/**
 * Routes the inference request.
 * @param {string | object} payload - The prompt text or an object { prompt, image }
 * @param {boolean} isLocalModeEnabled - Whether local execution is toggled on
 * @param {string} gatewayUrl - URL of the OpticParse gateway
 * @param {string} apiKey - The user's API Key
 */
export async function routeInference(payload, isLocalModeEnabled, gatewayUrl, apiKey) {
  const isTextOnly = typeof payload === "string" || !payload.image;

  if (isTextOnly && isLocalModeEnabled) {
    // Condition A: Text-only and Local Mode is Enabled
    if (!mlcEngine) {
      throw new Error("Local model is not initialized. Please wait for it to load.");
    }
    
    const prompt = typeof payload === "string" ? payload : payload.prompt;
    
    // Execute entirely within the browser
    const response = await mlcEngine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
    });
    
    return {
      source: "local_webllm",
      data: response.choices[0].message.content,
    };
  } 
  
  if (isTextOnly && !isLocalModeEnabled) {
    // Condition B: Text-only but Local Mode is Disabled
    // In our original architecture, the frontend might not have a direct "text-parse" route
    // but if it did, we'd hit the gateway here. For simplicity if PhishVision or a standard 
    // text completion route exists on the gateway, we hit it. 
    // Let's assume we use a generic POST to a backend route, or we can just throw if 
    // we don't have a generic text endpoint in this boilerplate.
    throw new Error("Remote text parsing endpoint not yet implemented in frontend boilerplate.");
  }
  
  // Condition C: Vision / Image Parsing
  // Forward payload to the new Gateway endpoint for HuggingFace Processing
  const response = await fetch(`${gatewayUrl}/api/vision-parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision parse failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    source: "backend_hf",
    data: data,
  };
}
