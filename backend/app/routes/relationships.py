from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..database import get_db
from ..models import CamelotObject, Relationship
from ..schemas import RelationshipCreate, RelationshipUpdate, RelationshipResponse
from ..services.events import record

router=APIRouter(prefix='/relationships',tags=['relationships'])

@router.post('/',response_model=RelationshipResponse,status_code=201)
def create(payload:RelationshipCreate,db:Session=Depends(get_db)):
    if payload.source_id==payload.target_id: raise HTTPException(400,'An object cannot be linked to itself')
    source=db.get(CamelotObject,payload.source_id);target=db.get(CamelotObject,payload.target_id)
    if not source or not target: raise HTTPException(404,'Source or target object not found')
    if source.type == 'project' and target.type == 'project':
        raise HTTPException(400,'Projects are top-level worlds and cannot contain or link to another project')

    # Every non-project object belongs to at most one project realm. Relationships
    # may connect objects within that realm, but they may never leak across realms.
    source_project = source.project_id if source.type != 'project' else source.id
    target_project = target.project_id if target.type != 'project' else target.id
    if source_project and target_project and source_project != target_project:
        raise HTTPException(409,'Objects from different projects cannot be linked')
    project_id = source_project or target_project

    if payload.type == 'CONTAINS' and target.type != 'project':
        existing_parent = db.query(Relationship).filter(
            Relationship.target_id == target.id,
            Relationship.type == 'CONTAINS',
            Relationship.id != None,
        ).first()
        if existing_parent and existing_parent.source_id != source.id:
            parent = db.get(CamelotObject, existing_parent.source_id)
            raise HTTPException(409, f'{target.title} already belongs to {parent.title if parent else "another parent"}')

    existing=db.query(Relationship).filter_by(source_id=source.id,target_id=target.id,type=payload.type).first()
    if existing: return existing
    rel=Relationship(source_id=source.id,target_id=target.id,type=payload.type,weight=payload.weight);db.add(rel);db.flush()

    if project_id:
        if source.type != 'project' and source.project_id is None: source.project_id = project_id
        if target.type != 'project' and target.project_id is None: target.project_id = project_id
    record(db,'RELATIONSHIP_CREATED',f'{source.title} → {rel.type} → {target.title}',source.id);db.commit();db.refresh(rel);return rel

@router.get('/',response_model=list[RelationshipResponse])
def list_relationships(object_id:int|None=None,type:str|None=None,limit:int=Query(500,ge=1,le=2000),db:Session=Depends(get_db)):
    q=db.query(Relationship)
    if object_id:q=q.filter((Relationship.source_id==object_id)|(Relationship.target_id==object_id))
    if type:q=q.filter(Relationship.type==type.upper())
    return q.order_by(Relationship.created_at.asc()).limit(limit).all()

@router.get('/{relationship_id}',response_model=RelationshipResponse)
def get(relationship_id:int,db:Session=Depends(get_db)):
    rel=db.get(Relationship,relationship_id)
    if not rel: raise HTTPException(404,'Relationship not found')
    return rel

@router.patch('/{relationship_id}',response_model=RelationshipResponse)
def update(relationship_id:int,payload:RelationshipUpdate,db:Session=Depends(get_db)):
    rel=db.get(Relationship,relationship_id)
    if not rel: raise HTTPException(404,'Relationship not found')
    changes=payload.model_dump(exclude_none=True)
    if 'type' in changes:
        duplicate=db.query(Relationship).filter(Relationship.source_id==rel.source_id,Relationship.target_id==rel.target_id,Relationship.type==changes['type'],Relationship.id!=rel.id).first()
        if duplicate: raise HTTPException(409,'That relationship already exists')
    for k,v in changes.items(): setattr(rel,k,v)
    record(db,'RELATIONSHIP_UPDATED',f'Updated relationship #{rel.id}',rel.source_id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409,'That relationship already exists')
    db.refresh(rel);return rel

@router.delete('/{relationship_id}',status_code=204)
def delete(relationship_id:int,db:Session=Depends(get_db)):
    rel=db.get(Relationship,relationship_id)
    if not rel: raise HTTPException(404,'Relationship not found')
    source=db.get(CamelotObject,rel.source_id);target=db.get(CamelotObject,rel.target_id)
    record(db,'RELATIONSHIP_DELETED',f'Removed link: {source.title if source else rel.source_id} → {rel.type} → {target.title if target else rel.target_id}',rel.source_id)
    db.delete(rel);db.commit()
