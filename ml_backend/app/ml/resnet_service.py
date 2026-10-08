"""
§9 — scene-level disaster/status classification. Domain-ignorant: returns a label + confidence,
nothing about nodes/missions.

CLASS_NAMES = ["accident", "flood", "normal"] -- confirmed from dataset.py's own CLASS_NAMES
constant, resnet50_model.py's NUM_CLASSES=3, and prepare_dataset.py's SOURCES dict keys, and
matches ImageFolder's alphabetical default too -- all four sources agree.

resnet50_disaster_status_final.pt was saved via torch.save(model.state_dict(), ...) (confirmed
from train_resnet50.py), NOT the full model object -- so loading requires rebuilding the exact
architecture first (see resnet_arch.py) and loading weights into it, not a plain torch.load().
"""
import importlib.util
import os
import sys

site_pkg = r'C:\Users\kallu\AppData\Roaming\Python\Python313\site-packages'
if os.path.exists(site_pkg) and site_pkg not in sys.path:
    sys.path.insert(0, site_pkg)

from app.config import env
from app.ml.resnet_arch import build_model

CLASS_NAMES = ["accident", "flood", "normal"]

_model = None

_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_model_file = env.resnet_model_path if os.path.isabs(env.resnet_model_path) else os.path.join(_backend_dir, env.resnet_model_path)

_weights_present = os.path.exists(_model_file)
_library_present = (
    importlib.util.find_spec("torch") is not None
    and importlib.util.find_spec("torchvision") is not None
)
_stub_mode = not (_weights_present and _library_present)


def stub_reason():
    """Why the classifier is inactive, or None when it is live."""
    if not _library_present:
        return "torch/torchvision are not installed — pip install -r requirements-ml.txt"
    if not _weights_present:
        return f"weight file not found at {env.resnet_model_path}"
    return None


def _load_model():
    global _model
    if _model is None and not _stub_mode:
        import torch
        _model = build_model()
        state_dict = torch.load(_model_file, map_location="cpu")
        _model.load_state_dict(state_dict)
        _model.eval()
    return _model


def classify_frame(frame) -> dict:
    """Returns {"label": str, "confidence": float, "stub": bool}."""
    if _stub_mode:
        return {"label": "normal", "confidence": 0.0, "stub": True, "reason": stub_reason()}

    import torch
    from torchvision import transforms

    model = _load_model()
    # ImageNet mean/std -- matches dataset.py's val_transform exactly (no augmentation at inference)
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    tensor = preprocess(frame).unsqueeze(0)
    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        idx = int(torch.argmax(probs))
        confidence = float(probs[idx])

    label = CLASS_NAMES[idx] if idx < len(CLASS_NAMES) else "custom"
    return {"label": label, "confidence": confidence, "stub": False}