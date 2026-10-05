from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CamelotObject
from ..schemas import ObjectCreate,ObjectCreateInside,ObjectUpdate,ObjectResponse
from ..services.events import record
from ..services.objects import metadata_dict, apply_metadata

router=APIRouter(prefix='/objects',tags=['objects'])

def response(o):
    return ObjectResponse(id=o.id,project_id=o.project_id,type=o.type,title=o.title,content=o.content,status=o.status,metadata=metadata_dict(o),created_at=o.created_at,updated_at=o.updated_at)

@router.post('/',response_model=ObjectResponse,status_code=201)
def create(payload:ObjectCreate,db:Session=Depends(get_db)):
    project_id = payload.project_id
    if project_id is not None:
        project = db.get(CamelotObject, project_id)
        if not project or project.type != 'project': raise HTTPException(400,'project_id must reference a project')
    o=CamelotObject(type=payload.type,title=payload.title.strip(),content=payload.content,status=payload.status,project_id=project_id)
    apply_metadata(o,payload.metadata);db.add(o);db.flush();record(db,'OBJECT_CREATED',f'Created {o.type}: {o.title}',o.id);db.commit();db.refresh(o);return response(o)

@router.post('/inside',response_model=ObjectResponse,status_code=201)
def create_inside(payload:ObjectCreateInside,db:Session=Depends(get_db)):
    parent=db.get(CamelotObject,payload.parent_id)
    if not parent: raise HTTPException(404,'Parent object not found')
    project_id = parent.project_id if parent.type != 'project' else parent.id
    if parent.type == 'project': project_id = parent.id
    o=CamelotObject(type=payload.type,title=payload.title.strip(),content=payload.content,status=payload.status,project_id=project_id)
    apply_metadata(o,payload.metadata)
    db.add(o);db.flush()
    from ..models import Relationship
    rel=Relationship(source_id=parent.id,target_id=o.id,type=payload.relationship_type,weight=1)
    db.add(rel)
    record(db,'OBJECT_CREATED',f'Created {o.type}: {o.title} inside {parent.title}',o.id)
    record(db,'RELATIONSHIP_CREATED',f'{parent.title} → {rel.type} → {o.title}',parent.id)
    db.commit();db.refresh(o);return response(o)

@router.get('/',response_model=list[ObjectResponse])
def list_objects(q:str|None=None,type:str|None=None,status:str|None=None,project_id:int|None=None,limit:int=Query(100,ge=1,le=500),offset:int=Query(0,ge=0),db:Session=Depends(get_db)):
    query=db.query(CamelotObject)
    if q: query=query.filter(or_(CamelotObject.title.ilike(f'%{q}%'),CamelotObject.content.ilike(f'%{q}%')))
    if type: query=query.filter(CamelotObject.type==type.lower())
    if status: query=query.filter(CamelotObject.status==status.lower())
    if project_id:
        from ..graph import project_scope_ids
        ids=project_scope_ids(db,project_id)
        query=query.filter(CamelotObject.id.in_(ids))
    return [response(o) for o in query.order_by(CamelotObject.updated_at.desc()).offset(offset).limit(limit).all()]

@router.get('/{object_id}',response_model=ObjectResponse)
def get(object_id:int,db:Session=Depends(get_db)):
    o=db.get(CamelotObject,object_id)
    if not o: raise HTTPException(404,'Object not found')
    return response(o)

@router.patch('/{object_id}',response_model=ObjectResponse)
def update(object_id:int,payload:ObjectUpdate,db:Session=Depends(get_db)):
    o=db.get(CamelotObject,object_id)
    if not o: raise HTTPException(404,'Object not found')
    changes=payload.model_dump(exclude_unset=True)
    for key,value in changes.items():
        if key=='metadata': apply_metadata(o,value)
        elif value is not None and key=='title': setattr(o,key,value.strip())
        else: setattr(o,key,value)
    record(db,'OBJECT_UPDATED',f'Updated {o.type}: {o.title}',o.id);db.commit();db.refresh(o);return response(o)

@router.delete('/{object_id}',status_code=204)
def delete(object_id:int,db:Session=Depends(get_db)):
    o=db.get(CamelotObject,object_id)
    if not o: raise HTTPException(404,'Object not found')
    title=f'{o.type}: {o.title}';record(db,'OBJECT_DELETED',f'Deleted {title}')
    db.delete(o);db.commit()
