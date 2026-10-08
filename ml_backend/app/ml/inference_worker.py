"""
§9 — camera inference is comparatively slow (YOLO/ResNet forward passes), so it does NOT run
inline in the 100ms tick loop. This runs as its own async task at ~1Hz per camera and writes
into the same store.nodes[...] fields the tick loop already reads — the tick loop stays
unaware of whether a congestion number came from simulation or a camera.

Transport: PULL model (§9) — call run_inference_on_frame() when the backend wants an
inference (e.g. from a camera-feed poller you wire up separately). Move to push + queue later
once camera feeds are genuinely continuous.
"""
from datetime import datetime, timezone
from app.ml.yolo_service import detect_vehicle_count
from app.ml.resnet_service import classify_frame
from app.ml.camera_map import node_for_camera
from app.engine.disasters import inject_disaster
from app.domain.constants import LogCategory, Severity
from app.config import env


def run_inference_on_frame(app_state, camera_id: str, frame) -> dict:
    node_id = node_for_camera(camera_id)
    if node_id is None:
        return {"error": f"no node mapped for camera {camera_id}"}

    store = app_state.store
    settings = app_state.settings
    log_store = app_state.log_store

    result = {"congestionUpdate": None, "disasterSuggestion": None, "detector": {}}

    # --- congestion signal (YOLO) ---
    yolo_out = detect_vehicle_count(frame)
    # Say plainly when a model is inactive. Without this the endpoint answers
    # 200 with two nulls whether the detector ran and found nothing or was never
    # installed, and those are very different things to be told.
    result["detector"]["yolo"] = (
        {"active": False, "reason": yolo_out.get("reason")} if yolo_out.get("stub") else {"active": True}
    )
    if not yolo_out.get("stub"):
        store.update_node(node_id, {"rawDensity": float(yolo_out["vehicleCount"]), "cameraFed": True})
        result["congestionUpdate"] = {
            "nodeId": node_id, "rawDensity": yolo_out["vehicleCount"],
            "congestion": store.nodes[node_id].congestion,   # EMA applied on next congestion pass
        }
        log_store.log(store.simTime, LogCategory.CONGESTION.value, Severity.INFO.value,
                      f"Camera {camera_id} nudged congestion at {node_id}",
                      refs={"nodeId": node_id, "cameraId": camera_id},
                      data={"vehicleCount": yolo_out["vehicleCount"], "modelVersion": "yolov8l"})

    # --- disaster/status signal (ResNet50) ---
    resnet_out = classify_frame(frame)
    result["detector"]["resnet"] = (
        {"active": False, "reason": resnet_out.get("reason")} if resnet_out.get("stub") else {"active": True}
    )

    if not resnet_out.get("stub") and resnet_out["label"] != "normal":
        if resnet_out["confidence"] >= env.hazard_confidence_threshold:
            auto = settings.autoApprove
            if auto:
                d = inject_disaster(store, settings, log_store, node_id, resnet_out["label"],
                                     severity=resnet_out["confidence"])
                applied = d is not None
            else:
                applied = False   # surfaced to operator; frontend calls POST /api/disasters to confirm

            result["disasterSuggestion"] = {
                "nodeId": node_id, "type": resnet_out["label"], "confidence": resnet_out["confidence"],
                "autoApplied": applied,
            }
            log_store.log(store.simTime, LogCategory.DISASTER.value, Severity.WARNING.value,
                          f"Disaster suggestion from camera {camera_id} (resnet50, "
                          f"{resnet_out['confidence']:.2f} confidence): {resnet_out['label']}",
                          refs={"nodeId": node_id, "cameraId": camera_id},
                          data={"modelVersion": "resnet50_disaster_status_final",
                                "confidence": resnet_out["confidence"], "label": resnet_out["label"],
                                "autoApplied": applied})

    return result