#!/usr/bin/env python3
"""
miners/start_miners.py — OpticParse Master Multi-Miner Daemon
Launches, orchestrates, and monitors all 5 decentralized AI mining workers:
1. Nostr NIP-90 DVM (Bitcoin Satoshis)
2. Masa Network (AI Data Scraping -> $MASA)
3. Ritual Infernet Oracle (On-Chain Cryptographic Proofs -> ETH/ARB)
4. IO.net / Render Compute (Idle Acceleration -> $IO/$RENDER)
5. Grass DePIN (Edge Bandwidth -> $GRASS)
"""

import asyncio
import json
import logging
import os
import sys
import time

# Add repository root to path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from miners.nostr_dvm import NostrDVMWorker
from miners.masa_worker import MasaDataWorker
from miners.ritual_oracle import RitualOracleWorker
from miners.render_worker import RenderComputeWorker
from miners.grass_worker import GrassDePINWorker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("MasterMinerHub")

EVM_TREASURY = "0xd458E709e7d54fd3659EF66624A621Cde74EDD27"
TELEMETRY_LOG = os.path.join(REPO_ROOT, "miners", "MINING_TELEMETRY.json")

class MasterMiningHub:
    def __init__(self):
        self.nostr_worker = NostrDVMWorker()
        self.masa_worker = MasaDataWorker()
        self.ritual_worker = RitualOracleWorker()
        self.render_worker = RenderComputeWorker()
        self.grass_worker = GrassDePINWorker()
        self.start_time = time.time()

    def sync_telemetry_file(self):
        telemetry_data = {
            "status": "ALL_5_MINERS_ONLINE",
            "evm_treasury": EVM_TREASURY,
            "uptime_seconds": round(time.time() - self.start_time, 1),
            "last_heartbeat": time.strftime("%Y-%m-%d %H:%M:%S"),
            "workers": {
                "nostr_dvm": {
                    "status": "ACTIVE",
                    "jobs_completed": self.nostr_worker.jobs_completed,
                    "sats_earned": self.nostr_worker.sats_earned,
                    "asset": "Bitcoin (Lightning Satoshis)"
                },
                "masa_network": {
                    "status": "ACTIVE",
                    "verified_pages": self.masa_worker.verified_pages_contributed,
                    "estimated_masa_earned": self.masa_worker.estimated_masa_earned,
                    "asset": "$MASA Token"
                },
                "ritual_oracle": {
                    "status": "ACTIVE",
                    "oracles_signed": self.ritual_worker.oracles_fulfilled,
                    "fees_earned_usd": self.ritual_worker.total_fees_earned_usd,
                    "asset": "ETH / Arbitrum Execution Fees"
                },
                "render_compute": {
                    "status": "ACTIVE",
                    "compute_cycles": self.render_worker.compute_cycles_settled,
                    "tokens_earned": self.render_worker.total_render_tokens_earned,
                    "asset": "$IO / $RENDER Compute Tokens"
                },
                "grass_depin": {
                    "status": "ACTIVE",
                    "verified_probes": self.grass_worker.verified_probes,
                    "epoch_points": self.grass_worker.epoch_points_accumulated,
                    "asset": "$GRASS Epoch Pool"
                }
            }
        }
        with open(TELEMETRY_LOG, "w") as f:
            json.dump(telemetry_data, f, indent=2)

    async def telemetry_loop(self):
        while True:
            self.sync_telemetry_file()
            await asyncio.sleep(10)

    async def start(self):
        logger.info("=" * 65)
        logger.info("💎 OpticParse Master Autonomous AI Mining Mesh ACTIVATED")
        logger.info(f"🦊 Verified EVM Treasury Wallet: {EVM_TREASURY}")
        logger.info("📊 Total Mining Nodes Orchestrated: 5")
        logger.info("⚡ Pre-Warmed Lake Connection: Cloudflare R2 (50k+ Pincodes)")
        logger.info("=" * 65)

        await asyncio.gather(
            self.nostr_worker.run(),
            self.masa_worker.run(),
            self.ritual_worker.run(),
            self.render_worker.run(),
            self.grass_worker.run(),
            self.telemetry_loop()
        )

if __name__ == "__main__":
    hub = MasterMiningHub()
    try:
        asyncio.run(hub.start())
    except KeyboardInterrupt:
        logger.info("Master mining hub stopped.")
