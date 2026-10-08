"""
§9 — "camera → junction mapping (backend-owned config)". The ML models never see junction IDs;
this is the only place that translates a cameraId into a nodeId/edgeIds.
"""
import json
import os
from typing import Dict, Optional

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "camera_map.json")


def load_camera_map(path: str = _DEFAULT_PATH) -> Dict[str, dict]:
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


CAMERA_MAP = load_camera_map()


def node_for_camera(camera_id: str) -> Optional[str]:
    entry = CAMERA_MAP.get(camera_id)
    return entry["nodeId"] if entry else None