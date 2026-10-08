from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.state import app_state
from app.engine.disasters import inject_disaster, clear_disaster, clear_disaster_by_node

router = APIRouter(tags=["disasters"])


class CreateDisasterBody(BaseModel):
    node: str
    type: str
    typeLabel: Optional[str] = None
    severity: float = 0.5
    label: str = ""
    note: str = ""


@router.post("/api/disasters")
def post_disaster(body: CreateDisasterBody):
    d = inject_disaster(app_state.store, app_state.settings, app_state.log_store,
                         body.node, body.type, body.typeLabel, body.severity, body.label, body.note)
    if d is None:
        raise HTTPException(409, "junction already blocked, or maxDisasters cap reached")
    return d.model_dump()


@router.delete("/api/disasters/{disaster_id}")
def delete_disaster(disaster_id: str):
    if disaster_id not in app_state.store.disasters:
        raise HTTPException(404, "disaster not found")
    clear_disaster(app_state.store, app_state.settings, app_state.log_store, disaster_id)
    return {"cleared": disaster_id}


@router.delete("/api/disasters/by-node/{node_id}")
def delete_disaster_by_node(node_id: str):
    clear_disaster_by_node(app_state.store, app_state.settings, app_state.log_store, node_id)
    return {"clearedNode": node_id}