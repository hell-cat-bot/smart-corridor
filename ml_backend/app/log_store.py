"""§4.8 — structured log record. Frontend kept newest 800; here it's a ring buffer, queryable."""
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.domain.constants import LOG_RING_BUFFER
from app.domain.schemas import LogRecord


class LogStore:
    def __init__(self, capacity: int = LOG_RING_BUFFER):
        self.capacity = capacity
        self._records: List[LogRecord] = []
        self._seq = 0

    def log(self, sim_time: float, category: str, severity: str, message: str,
             refs: Optional[Dict] = None, data: Optional[Dict] = None) -> LogRecord:
        self._seq += 1
        rec = LogRecord(
            id=f"LOG-{self._seq}",
            seq=self._seq,
            wallTime=datetime.now(timezone.utc).isoformat(),
            simTime=sim_time,
            category=category,
            severity=severity,
            message=message,
            refs=refs or {},
            data=data or {},
        )
        self._records.append(rec)
        if len(self._records) > self.capacity:
            self._records.pop(0)
        return rec

    def query(self, category: Optional[str] = None, severity: Optional[str] = None,
              since: Optional[float] = None, limit: int = 200) -> List[LogRecord]:
        results = self._records
        if category:
            results = [r for r in results if r.category == category]
        if severity:
            results = [r for r in results if r.severity == severity]
        if since is not None:
            results = [r for r in results if r.simTime >= since]
        return results[-limit:]