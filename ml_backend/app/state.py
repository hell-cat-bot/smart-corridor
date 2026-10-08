"""
Single process-wide app state. For a real deployment swap this for proper DI / a database-backed
store, but the contract's world is small enough (single sim instance) that this mirrors the
frontend's single Zustand store closely and keeps every module's signature simple.
"""
from app.data.network_loader import load_network, DEFAULT_NETWORK_PATH
from app.store.world_store import WorldStore
from app.config import Settings
from app.log_store import LogStore
from app.engine.worldseed import seed_world
from app.engine.simulation import SimulationEngine


class AppState:
    def __init__(self):
        self.reset()

    def reset(self):
        """Rebuilds world/settings/log/sim in place, so other modules holding a reference to
        this same AppState instance (via `from app.state import app_state`) see the reset
        without needing to re-import anything."""
        network = load_network(DEFAULT_NETWORK_PATH)
        self.store = WorldStore(network=network)
        self.settings = Settings()
        self.log_store = LogStore()
        seed_world(self.store)
        self.sim = SimulationEngine(self.store, self.settings, self.log_store)


app_state = AppState()