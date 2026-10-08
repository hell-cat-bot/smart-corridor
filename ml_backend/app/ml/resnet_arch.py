"""
Architecture-only copy of resnet50_model.py from the training pipeline.
This MUST stay structurally identical to whatever build_model() produced when
resnet50_disaster_status_final.pt's state_dict was saved (same layers, same
NUM_CLASSES, same dropout shape) -- torch.load_state_dict() matches weights by
layer name/shape, so any mismatch here will raise a loud, immediate error rather
than silently loading wrong weights. That's a feature, not a bug: if this file
ever needs updating because the training architecture changed, load_state_dict()
will tell you exactly which layer stopped matching.
"""
NUM_CLASSES = 3   # accident, flood, normal -- confirmed from prepare_dataset.py's SOURCES keys


def build_model(freeze_backbone: bool = True, dropout: float = 0.5):
    """Return a ResNet50 with its final layer replaced for 3-class output.

    freeze_backbone/dropout only affect training behavior (requires_grad flags,
    dropout layer presence) -- for inference we rebuild the same shape regardless
    of what these were set to during training, since eval() + no_grad() make the
    freeze flag irrelevant and dropout is a no-op in eval mode anyway.

    torch and torchvision are imported HERE rather than at module scope on
    purpose. This module sits on the import chain
    main.py -> api/infer.py -> ml/inference_worker.py -> ml/resnet_service.py,
    so a top-level torch import made the whole backend fail to start when the ML
    extras were not installed -- the simulation, the API and the WebSocket
    stream do not need torch, and now they start without it.
    """
    import torch.nn as nn
    from torchvision.models import resnet50

    model = resnet50(weights=None)   # weights=None: we're about to overwrite everything via state_dict

    if freeze_backbone:
        for param in model.parameters():
            param.requires_grad = False

    in_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Dropout(dropout),
        nn.Linear(in_features, NUM_CLASSES)
    )
    return model