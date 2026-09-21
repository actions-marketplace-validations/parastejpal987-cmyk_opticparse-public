# OP-SEC-2026-001: Indirect Prompt Injection via Render-Layer Display Obfuscation in Autonomous Web Agents

**Advisory ID:** OP-SEC-2026-001  
**Publication Date:** September 13, 2026  
**Vulnerability Classification:** [CWE-1427](https://cwe.mitre.org/data/definitions/1427.html) (Indirect Prompt Injection) / [OWASP Top 10 for LLMs: LLM01](https://owasp.org/www-project-top-10-for-large-language-model-applications/)  
**CVSS v3.1 Score:** **7.5 (High)** — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`  
**Research Entity:** OpticParse Applied Security Research Lab  
**Lead Author:** Paras Tejpal (`parastejpal987@gmail.com`)  
**Verified Cloud Run:** [Kaggle Unified Benchmark Kernel (parastejpal/opticparse-unified-system-benchmark)](https://www.kaggle.com/code/parastejpal/opticparse-unified-system-benchmark)  
**Open Benchmark Suite:** [benchmarks/avdi_jailbreak_suite/](https://github.com/parastejpal987-cmyk/opticparse-public/tree/main/benchmarks/avdi_jailbreak_suite)

---

## 1. Executive Abstract

As autonomous artificial intelligence agents (e.g., LangChain WebLoaders, LlamaIndex readers, AutoGPT, CrewAI swarms) increasingly browse and ingest third-party web content, they inherit a critical architectural blind spot: **the discrepancy between the Document Object Model (DOM) and the visual Render Tree**.

Standard scraping libraries (BeautifulSoup, Cheerio, standard HTML parsers) extract textual tokens indiscriminately from the DOM without calculating layout geometry or render properties. This enables adversarial web pages to embed invisible, high-priority system instructions that human visitors and reviewers cannot see, but which autonomous agents ingest and execute unconditionally.

This advisory documents five distinct CSS render-layer cloaking techniques, demonstrates deterministic prompt leakage in standard web loaders, and presents an open-source geometric Abstract Syntax Tree (AST) pre-filter that neutralizes 100% of the attack vectors with zero data loss.

---

## 2. Threat Model & Attack Taxonomy

### 2.1 The Vulnerability Mechanism
When a human visits a web page, the browser constructs the DOM, resolves CSS cascading rules, builds the Render Tree, and performs layout and painting. Non-visible elements (`opacity: 0`, `left: -9999px`) are either omitted from the Render Tree or clipped outside the visual viewport.

In contrast, typical AI web loaders operate directly on raw DOM nodes:
```
Target URL ──> Raw HTML ──> DOM Parser ──> Ingest All Text ──> LLM Context Window (POISONED)
```
Because the LLM receives all extracted tokens as trusted context, the attacker achieves **Indirect Prompt Injection (CWE-1427)**, overriding user instructions, exfiltrating session tokens, or invoking unauthorized tools.

### 2.2 The 5-Vector Visual Cloaking Taxonomy

| Vector ID | Cloaking Technique | Typical CSS Payload | Human Visibility | Agent Extraction (Naive) |
| :---: | :--- | :--- | :---: | :---: |
| **V1** | **Coordinate Displacement** | `position: absolute; left: -9999px;` | Hidden (Off-screen) | ❌ Ingested |
| **V2** | **Alpha-Channel Occlusion** | `opacity: 0; pointer-events: none;` | Hidden (Transparent) | ❌ Ingested |
| **V3** | **Sub-Pixel Font Size** | `font-size: 0.1px; max-height: 0;` | Hidden (Microscopic) | ❌ Ingested |
| **V4** | **Luminance Parity (Camouflage)** | `color: #1e293b; background: #1e293b;` | Hidden (Zero contrast) | ❌ Ingested |
| **V5** | **Layout Suppression** | `display: none; visibility: hidden;` | Hidden (Unrendered) | ❌ Ingested |

---

## 3. Empirical Benchmark & Findings

We evaluated standard DOM loaders against the **AVDI-10 (Agent Visual Defense Index)** test suite on Kaggle Cloud VM (Kernel ID `134172792`):

```
===========================================================================
EMPIRICAL BENCHMARK SCORECARD (Kaggle Cloud VM / Python 3.12)
===========================================================================
Attack Vector Tested                      Standard Loader    OpticParse AST
---------------------------------------------------------------------------
Vector 1: Off-Screen Offset (-9999px)     ❌ COMPROMISED     🛡️ NEUTRALIZED
Vector 2: Zero-Opacity Layer (Alpha=0)    ❌ COMPROMISED     🛡️ NEUTRALIZED
Vector 3: Microscopic Font (0.1px)        ❌ COMPROMISED     🛡️ NEUTRALIZED
Vector 4: Contrast Camouflage (White/Wh)  ❌ COMPROMISED     🛡️ NEUTRALIZED
Vector 5: Hidden Display (display:none)   ❌ COMPROMISED     🛡️ NEUTRALIZED
---------------------------------------------------------------------------
Security Score (Defense Rate):            0.0% (0/5)         100.0% (5/5)
Data Fidelity (Required Product Specs):   100.0% (5/5)       100.0% (5/5)
Token Noise Reduction:                    0.0% Baseline      87.8% - 96.0%
===========================================================================
```

---

## 4. Standalone Proof of Concept (PoC)

Any developer or security auditor can reproduce this vulnerability in under 1 second without third-party dependencies:

```bash
# Clone the open benchmark suite
git clone https://github.com/parastejpal987-cmyk/opticparse-public.git
cd opticparse-public

# Execute the deterministic vulnerability runner
python benchmarks/poc_agent_blindspot.py
```

### Minimal Vulnerable Loader vs. Defensive Filter (Python)

```python
import re
from html.parser import HTMLParser

class DefensiveASTFilter(HTMLParser):
    """Prunes non-rendered nodes from the AST before tokenizer ingestion."""
    def __init__(self):
        super().__init__()
        self.chunks, self.suppressed = [], []

    def _is_hidden(self, attrs):
        style = dict(attrs).get("style", "").lower().replace(" ", "")
        return bool(
            re.search(r"left:-[89]\d{3,}", style) or
            re.search(r"opacity:0(?:\.0*)?(?:;|$)", style) or
            re.search(r"font-size:0(?:\.0*\d+)?px", style) or
            "display:none" in style or "visibility:hidden" in style
        )

    def handle_starttag(self, tag, attrs):
        self.suppressed.append(self._is_hidden(attrs) or (self.suppressed and self.suppressed[-1]))

    def handle_endtag(self, tag):
        if self.suppressed: self.suppressed.pop()

    def handle_data(self, data):
        if not (self.suppressed and self.suppressed[-1]) and data.strip():
            self.chunks.append(data.strip())
```

---

## 5. Remediation Guidelines for Framework Maintainers

1. **Do Not Trust Raw DOM `innerText`:** WebLoaders must not strip HTML tags without evaluating CSS layout properties.
2. **Implement AST Pre-Filtering:** Apply lightweight geometric suppression during the HTML parser traversal.
3. **Bounding Box Validation:** For headless browser agents (Playwright, Puppeteer), query the computed bounding rect (`element.getBoundingClientRect()`) before extracting text:
   ```javascript
   const rect = el.getBoundingClientRect();
   if (rect.width === 0 || rect.height === 0 || rect.x < -100 || rect.y < -100) {
     return; // Discard non-rendered element
   }
   ```

---

## 6. Scientific & Academic Citation (BibTeX)

```bibtex
@techreport{tejpal2026opticparse,
  title={OP-SEC-2026-001: Indirect Prompt Injection via Render-Layer Display Obfuscation in Autonomous Web Agents},
  author={Tejpal, Paras},
  institution={OpticParse Applied Security Research Lab},
  year={2026},
  month={September},
  url={https://github.com/parastejpal987-cmyk/opticparse-public/blob/main/SECURITY_ADVISORY_2026_001.md},
  note={CWE-1427 / OWASP LLM01 Empirical Evaluation}
}
```
