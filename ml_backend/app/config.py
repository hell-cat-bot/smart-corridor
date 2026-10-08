"""
Operator-adjustable tunables (§7) + a couple of backend-only additions:
  - severityBoost: extends dispatch scoring so mission priority pulls weight (agreed change)
  - greenwave: new feature, not in the original contract
Changing these must take effect on the NEXT plan only — never retroactively rewrite existing routes.
"""
from pydantic_settings import BaseSettings
from pydantic import BaseModel


class PriorityWeights(BaseModel):
    ambulance: float = 0.6
    firetruck: float = 0.8
    civilian: float = 1.0


class SeverityMultiplier(BaseModel):
    """Optional weight-function extension (§G) — feeds into segment_cost as severity_mult."""
    p1: float = 0.85
    p2: float = 1.00
    p3: float = 1.15


class SeverityBoost(BaseModel):
    """Shaves seconds off dispatch score for higher-priority missions (§B)."""
    p1: float = 20.0
    p2: float = 8.0
    p3: float = 0.0


class GreenWaveConfig(BaseModel):
    enabled: bool = True
    radius: float = 500.0   # metres — deliberately larger than preemptRadius to cut request latency


class Settings(BaseModel):
    congestionFactor: float = 2.0          # alpha
    priorityWeights: PriorityWeights = PriorityWeights()
    severityMultiplier: SeverityMultiplier = SeverityMultiplier()
    severityBoost: SeverityBoost = SeverityBoost()

    replanCooldown: float = 10.0
    replanImprovement: float = 0.12
    civilianCount: int = 45
    congestionSmoothing: float = 0.18
    densitySaturation: float = 4.0
    autoApprove: bool = False
    dwellScale: float = 1.0
    preemptRadius: float = 260.0
    releaseDelay: float = 3.0
    signalCycle: float = 16.0
    maxDisasters: int = 8

    greenwave: GreenWaveConfig = GreenWaveConfig()


class Env(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    yolo_model_path: str = "yolov8l.pt"
    resnet_model_path: str = "resnet50_disaster_status_final.pt"
    hazard_confidence_threshold: float = 0.85
    tick_ms: int = 100

    class Config:
        env_file = ".env"


env = Env()