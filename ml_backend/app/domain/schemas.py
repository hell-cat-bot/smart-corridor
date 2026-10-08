"""
Entity shapes serialised to the dashboard. Field names must match the contract exactly (§4).
"""
from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ---------- §4.1 Node ----------
class Node(BaseModel):
    id: str
    lat: float
    lng: float
    name: str
    degree: int
    congestion: float = 0.0          # 0..1, EMA-smoothed
    rawDensity: float = 0.0          # pre-smoothing, debug/telemetry
    status: str = "normal"           # normal | congested | blocked
    cameraFed: bool = False          # backend addition (§9): true if a real camera detection
                                      # is currently overriding the simulated civilian density


# ---------- §4.6 Route ----------
class Route(BaseModel):
    path: List[str]                  # junctions only
    coords: List[List[float]]        # [lat,lng] full polyline
    cumulative: List[float]          # metres at each polyline point
    nodeCumulative: List[float]      # metres at each junction
    total: float
    travelled: float = 0.0
    legType: str                     # to_scene | to_hospital | return
    destNode: str
    originalPath: Optional[List[str]] = None
    unitType: str
    plannedAt: float


# ---------- §4.7 Blocked ----------
class Blocked(BaseModel):
    node: str
    since: float
    lastTry: float
    stopAt: float
    destNode: str


# ---------- §4.2 Unit ----------
class Unit(BaseModel):
    id: str
    label: str
    type: str                        # ambulance | firetruck
    service: str                     # medical | fire
    homeFacilityId: str
    baseFacilityId: str
    status: str = "available"
    missionId: Optional[str] = None
    node: str
    pos: Dict[str, float]
    heading: float = 0.0
    route: Optional[Route] = None
    blocked: Optional[Blocked] = None
    dwellRemaining: float = 0.0
    lastReplanAt: float = -999.0
    replanCount: int = 0
    missionsCompleted: int = 0


# ---------- §4.4 Leg ----------
class Leg(BaseModel):
    type: str                        # to_scene | to_hospital
    from_: str = Field(alias="from")
    to: str
    path: List[str]
    originalPath: Optional[List[str]] = None
    distance: float
    plannedEta: float
    freeFlowEta: float
    startedAt: float
    completedAt: Optional[float] = None
    replans: int = 0

    class Config:
        populate_by_name = True


class Candidate(BaseModel):
    unitId: str
    label: str
    fromNode: str
    facilityId: str
    eta: float
    distance: float
    cost: float
    score: float
    path: List[str]
    missionPriority: Optional[int] = None
    severityBoost: Optional[float] = None


# ---------- §4.3 Mission ----------
class Mission(BaseModel):
    id: str
    service: str
    emergencyClass: str
    emergencyLabel: str
    customEmergency: bool = False
    priority: int
    sceneNode: str
    note: str = ""
    status: str = "pending"
    unitId: Optional[str] = None
    suggestedUnitId: Optional[str] = None
    suggestedEta: Optional[float] = None
    candidates: List[Candidate] = []
    originFacilityId: Optional[str] = None
    hospitalFacilityId: Optional[str] = None
    legs: List[Leg] = []
    activeLeg: int = -1
    dwellTotal: float = 0.0
    dwellRemaining: float = 0.0
    createdAt: float
    approvedAt: Optional[float] = None
    onSceneAt: Optional[float] = None
    completedAt: Optional[float] = None
    replans: int = 0
    sourceDisasterId: Optional[str] = None   # backend addition: traceability for severity-linked dispatch


# ---------- §4.5 Facility / Disaster / Light ----------
class Facility(BaseModel):
    id: str
    type: str
    node: str
    name: str
    short: str
    beds: Optional[int] = None
    bays: Optional[int] = None
    synthetic: Optional[bool] = None


class Disaster(BaseModel):
    id: str
    type: str
    typeLabel: str
    node: str
    severity: float = 0.5
    note: str = ""
    label: str
    simTime: float
    timestamp: str


class Light(BaseModel):
    nodeId: str
    state: str
    servingUnitId: Optional[str] = None
    missionId: Optional[str] = None
    since: float
    releaseAt: Optional[float] = None
    contested: bool = False
    queue: List[str] = []


# ---------- §4.8 Log record ----------
class LogRecord(BaseModel):
    id: str
    seq: int
    wallTime: str
    simTime: float
    category: str
    severity: str
    message: str
    refs: Dict[str, Any] = {}
    data: Dict[str, Any] = {}