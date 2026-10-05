from pathlib import Path
from uuid import uuid4
import hashlib
from fastapi import APIRouter,Depends,File,Form,HTTPException,UploadFile
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Attachment,CamelotObject,Relationship
from ..services.events import record

router=APIRouter(prefix='/uploads',tags=['file imports'])
UPLOAD_DIR=Path(__file__).resolve().parents[2]/'uploads';UPLOAD_DIR.mkdir(parents=True,exist_ok=True)
ALLOWED={'.pdf','.csv','.json','.txt','.md','.png','.jpg','.jpeg','.webp','.docx','.xlsx'}
MAX_BYTES=25*1024*1024

@router.post('/import')
async def import_file(file:UploadFile=File(...),object_id:int|None=Form(None),project_id:int|None=Form(None),create_document:bool=Form(True),db:Session=Depends(get_db)):
    suffix=Path(file.filename or '').suffix.lower()
    if suffix not in ALLOWED:raise HTTPException(400,f'Unsupported file type: {suffix or "unknown"}')
    if object_id and not db.get(CamelotObject,object_id):raise HTTPException(404,'Target object not found')
    if project_id:
        p=db.get(CamelotObject,project_id)
        if not p or p.type!='project':raise HTTPException(404,'Project not found')
    data=await file.read()
    if len(data)>MAX_BYTES:raise HTTPException(413,'File exceeds 25 MB limit')
    safe=Path(file.filename or 'import').name;stored=f'{uuid4().hex}{suffix}';(UPLOAD_DIR/stored).write_bytes(data)
    checksum=hashlib.sha256(data).hexdigest();target=object_id
    extracted=''
    if suffix in {'.txt','.md','.csv','.json'}:extracted=data.decode('utf-8',errors='replace')[:20000]
    if create_document:
        doc=CamelotObject(type='document',title=safe,content=(f'Imported local file: {safe}\n\n{extracted}' if extracted else f'Imported local file: {safe}'),status='active',metadata_json='{}',project_id=project_id);db.add(doc);db.flush();target=doc.id
        record(db,'DOCUMENT_IMPORTED',f'Imported {safe} from local computer',doc.id)
        if project_id:
            db.add(Relationship(source_id=project_id,target_id=doc.id,type='CONTAINS',weight=2));record(db,'DOCUMENT_LINKED',f'Imported document {safe} into project',project_id)
    a=Attachment(object_id=target,name=safe,kind='file',storage_name=stored,url=f'/uploads/files/{stored}',mime_type=file.content_type,size=len(data),checksum=checksum);db.add(a);db.flush();record(db,'FILE_ATTACHED',f'Attached local file {safe}',target);db.commit();db.refresh(a)
    return {'attachment':{'id':a.id,'object_id':a.object_id,'name':a.name,'kind':a.kind,'url':a.url,'mime_type':a.mime_type,'size':a.size,'checksum':a.checksum,'created_at':a.created_at},'object_id':target}
