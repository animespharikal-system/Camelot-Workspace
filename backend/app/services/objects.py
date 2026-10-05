import json
from sqlalchemy.orm import Session
from ..models import CamelotObject

def metadata_dict(obj):
    try: return json.loads(obj.metadata_json) if obj.metadata_json else {}
    except json.JSONDecodeError: return {}

def apply_metadata(obj, value):
    obj.metadata_json = json.dumps(value or {}, ensure_ascii=False)
