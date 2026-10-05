from fastapi import APIRouter,Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CamelotObject,Relationship,Event,Member,Attachment
router=APIRouter(prefix='/workspace',tags=['workspace'])
@router.get('/summary')
def summary(db:Session=Depends(get_db)):
    types=['project','idea','question','task','decision','document']
    counts={t:db.query(CamelotObject).filter(CamelotObject.type==t).count() for t in types}
    return {'counts':counts,'objects':db.query(CamelotObject).count(),'relationships':db.query(Relationship).count(),'events':db.query(Event).count(),'members':db.query(Member).count(),'attachments':db.query(Attachment).count()}
