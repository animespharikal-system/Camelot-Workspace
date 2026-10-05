from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Event
from ..schemas import EventResponse
router=APIRouter(prefix='/events',tags=['chronicle'])
@router.get('/',response_model=list[EventResponse])
def list_events(object_id:int|None=None,event_type:str|None=None,project_id:int|None=None,limit:int=Query(100,ge=1,le=500),db:Session=Depends(get_db)):
    q=db.query(Event)
    if object_id:q=q.filter(Event.object_id==object_id)
    if project_id:
        from ..graph import project_scope_ids
        ids=project_scope_ids(db,project_id)
        q=q.filter(Event.object_id.in_(ids)| (Event.object_id==project_id))
    if event_type:q=q.filter(Event.event_type==event_type)
    return q.order_by(Event.created_at.desc()).limit(limit).all()
