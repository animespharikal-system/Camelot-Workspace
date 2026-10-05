from sqlalchemy.orm import Session
from .models import Relationship, CamelotObject

def connected_ids(db:Session, root_id:int) -> set[int]:
    ids={root_id}; changed=True
    rels=db.query(Relationship).all()
    while changed:
        changed=False
        for r in rels:
            if r.source_id in ids and r.target_id not in ids: ids.add(r.target_id);changed=True
            if r.target_id in ids and r.source_id not in ids: ids.add(r.source_id);changed=True
    return ids


def project_scope_ids(db:Session, project_id:int) -> set[int]:
    """Return only objects belonging to a project's realm.

    CONTAINS edges establish legacy membership; project_id is the persisted
    realm marker for new relationships. Never traverse through another project.
    """
    ids={project_id}
    changed=True
    while changed:
        changed=False
        rows=db.query(Relationship).filter(Relationship.type=='CONTAINS').all()
        for r in rows:
            if r.source_id in ids:
                target=db.get(CamelotObject, r.target_id)
                if target and target.type != 'project' and r.target_id not in ids:
                    ids.add(r.target_id); changed=True
    scoped=db.query(CamelotObject.id).filter(CamelotObject.project_id==project_id).all()
    ids.update(row[0] for row in scoped)
    return ids
