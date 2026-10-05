from fastapi import APIRouter,Depends,HTTPException,Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Attachment, CamelotObject
from ..schemas import AttachmentResponse
router=APIRouter(prefix='/attachments',tags=['attachments'])
@router.get('/',response_model=list[AttachmentResponse])
def list_attachments(object_id:int|None=None,limit:int=Query(100,ge=1,le=500),db:Session=Depends(get_db)):
    q=db.query(Attachment)
    if object_id:q=q.filter(Attachment.object_id==object_id)
    return q.order_by(Attachment.created_at.desc()).limit(limit).all()
@router.get('/{attachment_id}',response_model=AttachmentResponse)
def get(attachment_id:int,db:Session=Depends(get_db)):
    a=db.get(Attachment,attachment_id)
    if not a:raise HTTPException(404,'Attachment not found')
    return a
@router.delete('/{attachment_id}',status_code=204)
def delete(attachment_id:int,db:Session=Depends(get_db)):
    a=db.get(Attachment,attachment_id)
    if not a:raise HTTPException(404,'Attachment not found')
    db.delete(a);db.commit()
