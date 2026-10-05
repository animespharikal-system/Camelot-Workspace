from sqlalchemy.orm import Session
from ..models import Event

def record(db: Session, event_type: str, description: str, object_id: int | None = None, actor: str = 'You') -> Event:
    event = Event(object_id=object_id, event_type=event_type, description=description, actor=actor)
    db.add(event)
    return event
