"""
Source of truth for all wire-format string literals.
Contract §2 — "These are wire values. Do not translate, pluralise or re-case them."
"""
from enum import Enum


class Service(str, Enum):
    MEDICAL = "medical"
    FIRE = "fire"


class UnitType(str, Enum):
    AMBULANCE = "ambulance"
    FIRETRUCK = "firetruck"


SERVICE_TO_UNIT_TYPE = {
    Service.MEDICAL: UnitType.AMBULANCE,
    Service.FIRE: UnitType.FIRETRUCK,
}


class UnitStatus(str, Enum):
    AVAILABLE = "available"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ON_SCENE = "on_scene"
    TRANSPORTING = "transporting"
    RETURNING = "returning"


class FacilityType(str, Enum):
    HOSPITAL = "hospital"
    FIRE_STATION = "fire_station"


class MissionStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    EN_ROUTE_SCENE = "en_route_scene"
    ON_SCENE = "on_scene"
    TRANSPORTING = "transporting"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


ACTIVE_MISSION_STATUSES = {
    MissionStatus.ASSIGNED,
    MissionStatus.EN_ROUTE_SCENE,
    MissionStatus.ON_SCENE,
    MissionStatus.TRANSPORTING,
}


class LegType(str, Enum):
    TO_SCENE = "to_scene"
    TO_HOSPITAL = "to_hospital"
    RETURN = "return"   # only ever used on route.legType, never as a Leg.type


class Priority(int, Enum):
    P1_CRITICAL = 1
    P2_HIGH = 2
    P3_NORMAL = 3


class NodeStatus(str, Enum):
    NORMAL = "normal"
    CONGESTED = "congested"
    BLOCKED = "blocked"


class LightState(str, Enum):
    NORMAL_GREEN = "normal_green"
    NORMAL_RED = "normal_red"
    PREEMPT_GREEN = "preempt_green"
    RELEASING = "releasing"


class LogCategory(str, Enum):
    MISSION = "mission"
    DISPATCH = "dispatch"
    ROUTING = "routing"
    CONGESTION = "congestion"
    DISASTER = "disaster"
    SIGNAL = "signal"
    CONFLICT = "conflict"
    SIMULATION = "simulation"


class Severity(str, Enum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    CRITICAL = "critical"


# --- Emergency classes: (service, class) -> (label, default priority, dwell seconds) ---
EMERGENCY_CLASSES = {
    ("medical", "cardiac"):   ("Cardiac arrest",          Priority.P1_CRITICAL, 45),
    ("medical", "trauma"):    ("Major trauma",             Priority.P1_CRITICAL, 60),
    ("medical", "rta"):       ("Road accident",            Priority.P1_CRITICAL, 50),
    ("medical", "stroke"):    ("Suspected stroke",         Priority.P2_HIGH,     40),
    ("medical", "obstetric"): ("Obstetric emergency",      Priority.P2_HIGH,     55),
    ("medical", "transfer"):  ("Inter-facility transfer",  Priority.P3_NORMAL,   30),
    ("fire", "structure_fire"): ("Structure fire",         Priority.P1_CRITICAL, 90),
    ("fire", "vehicle_fire"):   ("Vehicle fire",           Priority.P2_HIGH,     60),
    ("fire", "hazmat"):         ("Hazmat spill",           Priority.P1_CRITICAL, 100),
    ("fire", "rescue"):         ("Technical rescue",       Priority.P2_HIGH,     80),
    ("fire", "alarm"):          ("Automatic alarm",        Priority.P3_NORMAL,   40),
}
CUSTOM_EMERGENCY_DEFAULT_PRIORITY = Priority.P2_HIGH
CUSTOM_EMERGENCY_DEFAULT_DWELL = 45

DISASTER_PRESETS = {"flood", "landslide", "earthquake"}


TICK_MS = 100
CONGESTION_HYSTERESIS_ENTER = 0.60
CONGESTION_HYSTERESIS_LEAVE = 0.45
CONGESTION_SLOWDOWN = 0.65
FREE_FLOW_SPEED = {
    UnitType.AMBULANCE: 16.7,
    UnitType.FIRETRUCK: 13.9,
    "civilian": 9.7,
}
HOLD_STOP_MARGIN_M = 30.0
HOLD_RETRY_INTERVAL_S = 2.0
ARRIVAL_TOLERANCE_M = 0.25
RETURNING_UNIT_PENALTY_S = 12.0
HOME_HOSPITAL_TOLERANCE = 1.10
LOG_RING_BUFFER = 800