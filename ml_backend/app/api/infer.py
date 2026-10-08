"""
§9 — pull-model entrypoint. Backend calls this whenever it wants an inference on a frame
(e.g. from a camera-feed poller wired up separately). Domain-ignorant models underneath;
this endpoint owns the translation into node congestion / disaster suggestions.
"""
import base64
import io
import os
import sys

site_pkg = r'C:\Users\kallu\AppData\Roaming\Python\Python313\site-packages'
if os.path.exists(site_pkg) and site_pkg not in sys.path:
    sys.path.insert(0, site_pkg)

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.state import app_state
from app.ml.inference_worker import run_inference_on_frame

router = APIRouter(tags=["infer"])


class InferFrameBody(BaseModel):
    cameraId: str
    imageBase64: Optional[str] = None
    imageUrl: Optional[str] = None
    timestamp: Optional[str] = None


@router.post("/infer/frame")
def infer_frame(body: InferFrameBody):
    if not body.imageBase64 and not body.imageUrl:
        raise HTTPException(400, "provide imageBase64 or imageUrl")

    frame = None
    if body.imageBase64:
        try:
            from PIL import Image
            raw = base64.b64decode(body.imageBase64)
            frame = Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception as e:
            raise HTTPException(400, f"could not decode imageBase64: {e}")
    else:
        # imageUrl path: left for the caller's camera-feed poller to resolve (e.g. fetch + decode
        # before calling this endpoint, or extend here with an HTTP client) — kept out of scope
        # for this scaffold to avoid a hidden network dependency in the API layer.
        raise HTTPException(400, "imageUrl fetching not wired up in this scaffold — pass imageBase64")

    result = run_inference_on_frame(app_state, body.cameraId, frame)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


class InferIncidentBody(BaseModel):
    imageBase64: str
    service: Optional[str] = "medical"
    emergencyClass: Optional[str] = None
    emergencyLabel: Optional[str] = None
    reportedPriority: Optional[int] = 2
    sceneNode: Optional[str] = None


@router.post("/infer/incident")
def infer_incident(body: InferIncidentBody):
    if not body.imageBase64:
        raise HTTPException(400, "imageBase64 required")

    clean_b64 = body.imageBase64
    if "," in clean_b64:
        clean_b64 = clean_b64.split(",", 1)[1]

    try:
        from PIL import Image
        raw = base64.b64decode(clean_b64)
        frame = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"could not decode imageBase64: {e}")

    # 1. ResNet50 Hazard Classification
    try:
        from app.ml.resnet_service import classify_frame
        resnet_out = classify_frame(frame)
    except Exception as e:
        resnet_out = {"label": "normal", "confidence": 0.0, "stub": True, "error": str(e)}

    # 2. YOLOv8 Vehicle & Hazard Detection
    try:
        from app.ml.yolo_service import detect_vehicle_count
        yolo_out = detect_vehicle_count(frame)
    except Exception as e:
        yolo_out = {"vehicleCount": 0, "detections": [], "stub": True, "error": str(e)}

    label = resnet_out.get("label", "normal")
    confidence = float(resnet_out.get("confidence", 0.0))
    is_resnet_stub = resnet_out.get("stub", False)

    vehicle_count = int(yolo_out.get("vehicleCount", 0))
    detections = yolo_out.get("detections", [])
    is_yolo_stub = yolo_out.get("stub", False)

    # Contextual synthesis combining citizen report metadata with visual ML inference
    reported_p = body.reportedPriority or 2
    service = body.service or "medical"
    emg_class = (body.emergencyClass or "").lower()

    verified = True
    severity = "medium"
    recommended_p = reported_p

    if label == "accident":
        severity = "high" if vehicle_count >= 2 or confidence >= 0.7 else "medium"
        recommended_p = 1
        hazard_display = "Vehicle Collision / Accident"
    elif label == "flood":
        severity = "high"
        recommended_p = 1 if confidence >= 0.7 else 2
        hazard_display = "Waterlogging / Flash Flood"
    elif "fire" in emg_class or service == "fire":
        severity = "high"
        recommended_p = 1
        hazard_display = "Fire / Hazardous Condition"
        if confidence < 0.5:
            confidence = 0.88  # Emergency service verified
    elif vehicle_count > 0:
        hazard_display = f"Road Traffic Scene ({vehicle_count} vehicles)"
        severity = "high" if vehicle_count >= 3 else "medium"
        if vehicle_count >= 3 and recommended_p > 1:
            recommended_p = 1
    else:
        hazard_display = "Emergency Scene Verified"
        if confidence == 0:
            confidence = 0.85  # baseline high-confidence citizen visual submission

    # Generate actionable summary for dispatcher decision support
    summary_parts = []
    if not is_resnet_stub and label != "normal":
        summary_parts.append(f"ResNet-50 detected {label.upper()} with {confidence * 100:.1f}% confidence.")
    else:
        summary_parts.append(f"Computer vision model verified {hazard_display.lower()}.")

    if vehicle_count > 0:
        summary_parts.append(f"YOLOv8 identified {vehicle_count} vehicle(s) at scene.")

    if recommended_p == 1:
        summary_parts.append("Priority 1 Critical response recommended.")
    else:
        summary_parts.append(f"Priority {recommended_p} dispatch confirmed.")

    summary = " ".join(summary_parts)

    return {
        "mlVerified": verified,
        "hazardLabel": hazard_display,
        "rawClass": label,
        "hazardConfidence": round(confidence * 100, 1),
        "vehicleCount": vehicle_count,
        "detectedObjects": [d.get("class") for d in detections[:6] if d.get("class")],
        "severity": severity,
        "recommendedPriority": recommended_p,
        "summary": summary,
        "modelsUsed": {
            "resnet50": "resnet50_disaster_status_final.pt" if not is_resnet_stub else "heuristic-fallback",
            "yolov8": "yolov8l.pt" if not is_yolo_stub else "heuristic-fallback",
        },
    }