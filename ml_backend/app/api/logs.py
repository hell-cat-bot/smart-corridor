from fastapi import APIRouter
from typing import Optional
from app.state import app_state

router = APIRouter(tags=["logs"])


@router.get("/api/logs")
def get_logs(category: Optional[str] = None, severity: Optional[str] = None,
             since: Optional[float] = None, limit: int = 200):
    records = app_state.log_store.query(category=category, severity=severity, since=since, limit=limit)
    return [r.model_dump() for r in records]