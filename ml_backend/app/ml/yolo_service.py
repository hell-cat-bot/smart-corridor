"""
§9 — "Keep the ML service domain-ignorant: frames in, detections out, no knowledge of missions
or junction IDs." This module only knows about pixels and vehicle counts; camera_map.py and
inference_worker.py own the translation into node congestion.

Loads yolov8l.pt lazily. Runs in stub mode (returns 0 detections) if the weight file isn't
present yet, so the rest of the backend works without it.
"""
import importlib.util
import os
import sys

site_pkg = r'C:\Users\kallu\AppData\Roaming\Python\Python313\site-packages'
if os.path.exists(site_pkg) and site_pkg not in sys.path:
    sys.path.insert(0, site_pkg)

from app.config import env

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}   # COCO classes YOLOv8 detects out of the box

_model = None

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_model_file = env.yolo_model_path if os.path.isabs(env.yolo_model_path) else os.path.join(_backend_dir, env.yolo_model_path)

_weights_present = os.path.exists(_model_file)
_library_present = importlib.util.find_spec("ultralytics") is not None
_stub_mode = not (_weights_present and _library_present)


def stub_reason():
    """Why the detector is inactive, or None when it is live."""
    if not _library_present:
        return "ultralytics is not installed — pip install -r requirements-ml.txt"
    if not _weights_present:
        return f"weight file not found at {_model_file}"
    return None


def _load_model():
    global _model
    if _model is None and not _stub_mode:
        from ultralytics import YOLO
        _model = YOLO(_model_file)
    return _model


def detect_vehicle_count(frame) -> dict:
    """
    frame: whatever ultralytics accepts (path, PIL image, numpy array).
    Returns {"vehicleCount": int, "detections": [...]} — no node/mission knowledge.
    """
    if _stub_mode:
        return {"vehicleCount": 0, "detections": [], "stub": True, "reason": stub_reason()}

    model = _load_model()
    results = model(frame, verbose=False)[0]
    detections = []
    vehicle_count = 0
    for box in results.boxes:
        cls_name = model.names[int(box.cls[0])]
        conf = float(box.conf[0])
        xyxy = [float(x) for x in box.xyxy[0]]
        detections.append({"class": cls_name, "confidence": conf, "bbox": xyxy})
        if cls_name in VEHICLE_CLASSES:
            vehicle_count += 1

    return {"vehicleCount": vehicle_count, "detections": detections, "stub": False}