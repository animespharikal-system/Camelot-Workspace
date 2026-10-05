from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator

OBJECT_TYPES = {'project','idea','question','task','decision','document'}
OBJECT_STATUSES = {'active','planned','in_progress','blocked','completed','archived'}
REL_TYPES = {'CONTAINS','DEPENDS_ON','SUPPORTS','CONTRADICTS','REFERENCES','RELATED_TO','CREATED_BY','ASSIGNED_TO','SUPERSEDES','DERIVED_FROM'}
MEMBER_STATUSES = {'online','away','offline'}

class ObjectCreate(BaseModel):
    project_id: int | None = None
    type: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=255)
    content: str | None = None
    status: str = 'active'
    metadata: dict[str, Any] = Field(default_factory=dict)
    @field_validator('type')
    @classmethod
    def valid_type(cls, v):
        v = v.strip().lower()
        if v not in OBJECT_TYPES: raise ValueError(f'type must be one of {sorted(OBJECT_TYPES)}')
        return v
    @field_validator('status')
    @classmethod
    def valid_status(cls, v):
        v=v.strip().lower()
        if v not in OBJECT_STATUSES: raise ValueError(f'status must be one of {sorted(OBJECT_STATUSES)}')
        return v

class ObjectCreateInside(ObjectCreate):
    parent_id:int
    relationship_type:str='CONTAINS'
    @field_validator('relationship_type')
    @classmethod
    def valid_relationship_type(cls,v):
        v=v.strip().upper()
        if v not in REL_TYPES: raise ValueError(f'relationship_type must be one of {sorted(REL_TYPES)}')
        return v

class ObjectUpdate(BaseModel):
    type: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None
    @field_validator('type')
    @classmethod
    def valid_type(cls, v):
        if v is None: return v
        v=v.strip().lower()
        if v not in OBJECT_TYPES: raise ValueError(f'type must be one of {sorted(OBJECT_TYPES)}')
        return v
    @field_validator('status')
    @classmethod
    def valid_status(cls, v):
        if v is None: return v
        v=v.strip().lower()
        if v not in OBJECT_STATUSES: raise ValueError(f'status must be one of {sorted(OBJECT_STATUSES)}')
        return v

class ObjectResponse(BaseModel):
    id:int; project_id:int|None; type:str; title:str; content:str|None; status:str; metadata:dict[str,Any]; created_at:datetime; updated_at:datetime
    model_config=ConfigDict(from_attributes=True)

class RelationshipCreate(BaseModel):
    source_id:int; target_id:int; type:str; weight:int=Field(default=1, ge=1, le=100)
    @field_validator('type')
    @classmethod
    def valid_type(cls,v):
        v=v.strip().upper()
        if v not in REL_TYPES: raise ValueError(f'type must be one of {sorted(REL_TYPES)}')
        return v

class RelationshipUpdate(BaseModel):
    type:str|None=None; weight:int|None=Field(default=None, ge=1, le=100)
    @field_validator('type')
    @classmethod
    def valid_type(cls,v):
        if v is None: return v
        v=v.strip().upper()
        if v not in REL_TYPES: raise ValueError(f'type must be one of {sorted(REL_TYPES)}')
        return v

class RelationshipResponse(BaseModel):
    id:int; source_id:int; target_id:int; type:str; weight:int; created_at:datetime
    model_config=ConfigDict(from_attributes=True)

class EventResponse(BaseModel):
    id:int; object_id:int|None; event_type:str; description:str; actor:str='You'; created_at:datetime
    model_config=ConfigDict(from_attributes=True)

class MemberCreate(BaseModel):
    name:str=Field(min_length=1,max_length=120); initials:str=Field(min_length=1,max_length=8); role:str=Field(min_length=1,max_length=80); status:str='online'; project_id:int|None=None
    @field_validator('status')
    @classmethod
    def valid_status(cls,v):
        v=v.lower().strip()
        if v not in MEMBER_STATUSES: raise ValueError(f'status must be one of {sorted(MEMBER_STATUSES)}')
        return v

class MemberUpdate(BaseModel):
    name:str|None=None; initials:str|None=None; role:str|None=None; status:str|None=None; project_id:int|None=None

class MemberResponse(MemberCreate):
    id:int
    model_config=ConfigDict(from_attributes=True)

class AttachmentResponse(BaseModel):
    id:int; object_id:int|None; name:str; kind:str; url:str|None; mime_type:str|None; size:int|None; checksum:str|None; created_at:datetime
    model_config=ConfigDict(from_attributes=True)

class PageMeta(BaseModel):
    limit:int; offset:int; total:int; has_more:bool

class GraphNode(BaseModel):
    id:int; type:str; title:str; status:str
class GraphEdge(BaseModel):
    id:int; source_id:int; target_id:int; type:str; weight:int
class GraphResponse(BaseModel):
    nodes:list[GraphNode]; edges:list[GraphEdge]

class HealthResponse(BaseModel):
    status:str; database:str; ai_enabled:bool=False
