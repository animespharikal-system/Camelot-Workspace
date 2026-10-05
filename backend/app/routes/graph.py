from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import CamelotObject, Relationship
from ..schemas import GraphResponse, GraphNode, GraphEdge
from ..graph import connected_ids, project_scope_ids

router=APIRouter(prefix='/graph',tags=['knowledge graph'])

@router.get('/snapshot',response_model=GraphResponse)
def snapshot(project_id:int|None=None,object_id:int|None=None,db:Session=Depends(get_db)):
    if project_id is not None:
        p=db.get(CamelotObject,project_id)
        if not p or p.type!='project': raise HTTPException(404,'Project not found')
        ids=project_scope_ids(db,project_id)
    elif object_id is not None:
        if not db.get(CamelotObject,object_id): raise HTTPException(404,'Object not found')
        ids=connected_ids(db,object_id)
    else:
        ids={o.id for o in db.query(CamelotObject).all()}
    objects=db.query(CamelotObject).filter(CamelotObject.id.in_(ids)).all()
    rels=db.query(Relationship).filter(Relationship.source_id.in_(ids),Relationship.target_id.in_(ids)).all()
    return GraphResponse(nodes=[GraphNode(id=o.id,type=o.type,title=o.title,status=o.status) for o in objects],edges=[GraphEdge(id=r.id,source_id=r.source_id,target_id=r.target_id,type=r.type,weight=r.weight) for r in rels])
