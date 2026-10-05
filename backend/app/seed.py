from sqlalchemy.orm import Session
from .models import CamelotObject, Relationship
from .services.objects import metadata_dict


def _repair_project_scopes(db: Session) -> None:
    """Repair legacy cross-project leakage from pre-project-scope builds.

    Every non-project object is assigned to one project realm. CONTAINS may have
    only one direct parent, and relationships between different project realms
    are removed. This is intentionally conservative and only repairs malformed
    legacy links; it never creates user content.
    """
    projects = [o for o in db.query(CamelotObject).filter(CamelotObject.type == 'project').all()]
    project_ids = {p.id for p in projects}
    objects = {o.id: o for o in db.query(CamelotObject).filter(CamelotObject.type != 'project').all()}
    contains = db.query(Relationship).filter(Relationship.type == 'CONTAINS').order_by(Relationship.created_at.asc(), Relationship.id.asc()).all()

    # Prefer an explicitly persisted project_id, otherwise inherit from the
    # nearest containment parent. Repeat until nested children settle.
    for _ in range(len(objects) + 1):
        changed = False
        for rel in contains:
            child = objects.get(rel.target_id)
            parent = db.get(CamelotObject, rel.source_id)
            if not child or not parent:
                continue
            parent_project = parent.id if parent.type == 'project' else parent.project_id
            if parent_project in project_ids and child.project_id is None:
                child.project_id = parent_project
                changed = True
        if not changed:
            break

    # If an object was connected to multiple project roots, keep its explicit
    # project_id when valid; otherwise keep the earliest project relationship.
    for obj in objects.values():
        candidates = []
        if obj.project_id in project_ids:
            candidates.append(obj.project_id)
        for rel in contains:
            if rel.target_id != obj.id:
                continue
            parent = db.get(CamelotObject, rel.source_id)
            pid = parent.id if parent and parent.type == 'project' else (parent.project_id if parent else None)
            if pid in project_ids and pid not in candidates:
                candidates.append(pid)
        if candidates:
            obj.project_id = candidates[0]

    # Remove cross-realm relationships and duplicate containment parents.
    seen_parent: set[int] = set()
    for rel in contains:
        child = objects.get(rel.target_id)
        parent = db.get(CamelotObject, rel.source_id)
        if not child or not parent:
            continue
        parent_project = parent.id if parent.type == 'project' else parent.project_id
        if parent_project and child.project_id and parent_project != child.project_id:
            db.delete(rel)
            continue
        if rel.target_id in seen_parent:
            db.delete(rel)
            continue
        seen_parent.add(rel.target_id)

    # Non-containment relationships may only exist within one realm.
    for rel in db.query(Relationship).filter(Relationship.type != 'CONTAINS').all():
        source = db.get(CamelotObject, rel.source_id)
        target = db.get(CamelotObject, rel.target_id)
        if not source or not target:
            continue
        sp = source.id if source.type == 'project' else source.project_id
        tp = target.id if target.type == 'project' else target.project_id
        if sp and tp and sp != tp:
            db.delete(rel)

    db.commit()


def seed(db: Session):
    # Camelot starts completely blank. Remove only the old system-seeded demo
    # objects from previous builds; never create platform objects as user content.
    system_objects = [o for o in db.query(CamelotObject).all() if metadata_dict(o).get('system') is True]
    if system_objects:
        ids = {o.id for o in system_objects}
        db.query(Relationship).filter((Relationship.source_id.in_(ids)) | (Relationship.target_id.in_(ids))).delete(synchronize_session=False)
        for obj in system_objects:
            db.delete(obj)
        db.commit()
    _repair_project_scopes(db)
