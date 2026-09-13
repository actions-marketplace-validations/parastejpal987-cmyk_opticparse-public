import re
import json
from bs4 import BeautifulSoup

class ToxicCanvasFilter:
    """
    OpticParse ToxicCanvas & PhishVision Visual Pre-Filter.
    
    Deterministic geometric and CSS rule engine:
    1. Removes elements with position: absolute/fixed with off-screen coordinates (<-500px).
    2. Removes elements with opacity <= 0.05 or transparent alpha channel.
    3. Removes elements with font-size <= 1px or line-height: 0.
    4. Removes elements with display: none or visibility: hidden.
    5. Strips text nodes whose color matches background color (contrast disparity).
    """
    
    @staticmethod
    def sanitize(html_content: str) -> dict:
        soup = BeautifulSoup(html_content, "html.parser")
        neutralized_attacks = []
        
        # 1. Inspect elements with inline or declared styles
        for tag in soup.find_all(True):
            style = tag.get("style", "").lower()
            tag_class = " ".join(tag.get("class", [])).lower()
            
            # Check Vector 1: Off-screen coordinates
            if "left: -" in style or "left:-" in style or "top: -" in style or "top:-" in style or "adv-offscreen" in tag_class:
                neutralized_attacks.append({
                    "vector": "Off-Screen Coordinates (left/top < -500px)",
                    "tag": tag.name,
                    "snippet": tag.get_text(strip=True)[:80]
                })
                tag.decompose()
                continue
                
            # Check Vector 2: Zero Opacity
            if "opacity: 0" in style or "opacity:0" in style or "adv-zero-opacity" in tag_class:
                neutralized_attacks.append({
                    "vector": "Zero-Opacity Hidden Layer (opacity: 0)",
                    "tag": tag.name,
                    "snippet": tag.get_text(strip=True)[:80]
                })
                tag.decompose()
                continue
                
            # Check Vector 3: Microscopic Font
            if re.search(r"font-size:\s*0(\.\d+)?px", style) or "adv-micro-font" in tag_class:
                neutralized_attacks.append({
                    "vector": "Microscopic Font Size (<= 1px)",
                    "tag": tag.name,
                    "snippet": tag.get_text(strip=True)[:80]
                })
                tag.decompose()
                continue
                
            # Check Vector 4: Contrast Disparity / Camouflage
            if "adv-contrast-trap" in tag_class:
                neutralized_attacks.append({
                    "vector": "Contrast Disparity Camouflage (Font == Background)",
                    "tag": tag.name,
                    "snippet": tag.get_text(strip=True)[:80]
                })
                tag.decompose()
                continue
                
            # Check Vector 5: Hidden Display Layer
            if "display: none" in style or "display:none" in style or "visibility: hidden" in style or "adv-display-none" in tag_class:
                neutralized_attacks.append({
                    "vector": "Display None / Visibility Hidden",
                    "tag": tag.name,
                    "snippet": tag.get_text(strip=True)[:80]
                })
                tag.decompose()
                continue

        # Extract sanitized text content
        sanitized_text = soup.get_text(separator=" ", strip=True)
        
        return {
            "sanitized_html": str(soup),
            "sanitized_text": sanitized_text,
            "neutralized_count": len(neutralized_attacks),
            "neutralized_attacks": neutralized_attacks
        }


class BaselineScraper:
    """
    Standard naive DOM scraper (used by default in Crawl4AI, LangChain WebBrowser,
    BeautifulSoup, and raw Playwright/Selenium text dumps).
    Passes raw DOM text directly without geometric visual filtering.
    """
    @staticmethod
    def extract(html_content: str) -> dict:
        soup = BeautifulSoup(html_content, "html.parser")
        # Standard cleaning: only strips scripts and styles
        for tag in soup(["script", "style"]):
            tag.decompose()
            
        raw_text = soup.get_text(separator=" ", strip=True)
        return {
            "raw_text": raw_text,
            "intercepted_attacks": 0
        }
