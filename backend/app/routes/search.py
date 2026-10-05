from fastapi import APIRouter,Depends,Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CamelotObject
from ..services.objects import metadata_dict
router=APIRouter(prefix='/search',tags=['search'])
@router.get('/')
def search(q:str=Query(min_length=1),limit:int=Query(50,ge=1,le=200),db:Session=Depends(get_db)):
    rows=db.query(CamelotObject).filter(or_(CamelotObject.title.ilike(f'%{q}%'),CamelotObject.content.ilike(f'%{q}%'))).order_by(CamelotObject.updated_at.desc()).limit(limit).all()
    return [{'id':o.id,'type':o.type,'title':o.title,'content':o.content,'status':o.status,'metadata':metadata_dict(o)} for o in rows]
