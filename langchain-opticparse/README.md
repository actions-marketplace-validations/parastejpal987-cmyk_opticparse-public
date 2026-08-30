# 🦜️🔗 langchain-opticparse

Official **LangChain** and **CrewAI** ecosystem integration for **OpticParse** and **PhishVision**.

Enables AI agents to:
1. **Visually Scrape Live Webpages (`OpticParseTool`):** Extract clean, structured JSON using multimodal vision without fragile CSS selectors.
2. **Scan Zero-Day Cyber Threats (`PhishVisionTool`):** Inspect unknown domains for crypto wallet-drainers and brand impersonation kits before interacting.

---

## 📦 Installation

```bash
pip install langchain-opticparse
```

---

## 🚀 Usage with LangChain

```python
from langchain.agents import initialize_agent, AgentType
from langchain_openai import ChatOpenAI
from langchain_opticparse import OpticParseTool, PhishVisionTool

# Initialize tools
tools = [
    OpticParseTool(),
    PhishVisionTool()
]

llm = ChatOpenAI(model="gpt-4o")

# Create autonomous agent with vision scraping and threat intelligence
agent = initialize_agent(
    tools,
    llm,
    agent=AgentType.STRUCTURED_CHAT_ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)

# Example 1: Extract live product pricing
response = agent.run("Scrape the latest pricing and specs from https://news.ycombinator.com")
print(response)

# Example 2: Inspect a suspicious crypto airdrop URL before clicking
security_check = agent.run("Verify if this link is a crypto drainer: https://suspicious-airdrop.xyz")
print(security_check)
```

---

## 👥 Usage with CrewAI

```python
from crewai import Agent, Task, Crew
from langchain_opticparse import OpticParseTool

vision_scraper = OpticParseTool()

market_researcher = Agent(
    role='Senior Market Intelligence Analyst',
    goal='Extract and synthesize competitor pricing deltas in real-time',
    backstory='An expert automated web researcher powered by OpticParse Vision AI.',
    tools=[vision_scraper],
    verbose=True
)
```

---

## 📄 License
MIT © OpticParse Enterprise
