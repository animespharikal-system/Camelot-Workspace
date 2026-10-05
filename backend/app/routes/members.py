from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Member, CamelotObject
from ..schemas import MemberCreate,MemberUpdate,MemberResponse
from ..services.events import record
router=APIRouter(prefix='/members',tags=['members'])
@router.get('/',response_model=list[MemberResponse])
def list_members(project_id:int|None=None,db:Session=Depends(get_db)):
    q=db.query(Member)
    if project_id:q=q.filter(Member.project_id==project_id)
    return q.order_by(Member.name.asc()).all()
@router.post('/',response_model=MemberResponse,status_code=201)
def create(payload:MemberCreate,db:Session=Depends(get_db)):
    if payload.project_id and (not db.get(CamelotObject,payload.project_id) or db.get(CamelotObject,payload.project_id).type!='project'): raise HTTPException(400,'project_id must reference a project')
    m=Member(**payload.model_dump());db.add(m);db.flush();record(db,'MEMBER_ADDED',f'Added member {m.name}');db.commit();db.refresh(m);return m
@router.patch('/{member_id}',response_model=MemberResponse)
def update(member_id:int,payload:MemberUpdate,db:Session=Depends(get_db)):
    m=db.get(Member,member_id)
    if not m:raise HTTPException(404,'Member not found')
    for k,v in payload.model_dump(exclude_unset=True).items():setattr(m,k,v)
    record(db,'MEMBER_UPDATED',f'Updated member {m.name}');db.commit();db.refresh(m);return m
@router.delete('/{member_id}',status_code=204)
def delete(member_id:int,db:Session=Depends(get_db)):
    m=db.get(Member,member_id)
    if not m:raise HTTPException(404,'Member not found')
    record(db,'MEMBER_REMOVED',f'Removed member {m.name}');db.delete(m);db.commit()
