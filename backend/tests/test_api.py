import os, tempfile, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ['DATABASE_URL']='sqlite:///'+tempfile.mktemp(suffix='.db')
from fastapi.testclient import TestClient
from app.main import app

client=TestClient(app)

def test_health():
    r=client.get('/health'); assert r.status_code==200; assert r.json()['status']=='ok'

def test_object_relationship_graph():
    p=client.post('/objects/',json={'type':'project','title':'Test Project'}); assert p.status_code==201
    i=client.post('/objects/',json={'type':'idea','title':'Test Idea'}); assert i.status_code==201
    pid=p.json()['id']; iid=i.json()['id']
    rel=client.post('/relationships/',json={'source_id':iid,'target_id':pid,'type':'RELATED_TO'}); assert rel.status_code==201
    graph=client.get('/graph/snapshot',params={'project_id':pid}); assert graph.status_code==200
    assert {n['id'] for n in graph.json()['nodes']}=={pid,iid}
    assert len(graph.json()['edges'])==1


def test_create_inside_and_ai_trigger():
    p=client.post('/objects/',json={'type':'project','title':'DataSakti'}); assert p.status_code==201
    pid=p.json()['id']
    i=client.post('/objects/inside',json={'type':'idea','title':'Features','parent_id':pid,'relationship_type':'CONTAINS'}); assert i.status_code==201
    iid=i.json()['id']
    graph=client.get('/graph/snapshot',params={'project_id':pid}).json()
    assert {n['id'] for n in graph['nodes']}=={pid,iid}
    assert graph['edges'][0]['type']=='CONTAINS'
    ai=client.post('/ai/suggestions',params={'project_id':pid}); assert ai.status_code==200
    assert ai.json()['triggered'] is True


def test_project_scope_isolation_and_cors():
    a=client.post('/objects/',json={'type':'project','title':'Project A'}).json()
    b=client.post('/objects/',json={'type':'project','title':'Project B'}).json()
    x=client.post('/objects/',json={'type':'idea','title':'A Idea'}).json()
    y=client.post('/objects/',json={'type':'idea','title':'B Idea'}).json()
    client.post('/relationships/',json={'source_id':a['id'],'target_id':x['id'],'type':'CONTAINS'})
    client.post('/relationships/',json={'source_id':b['id'],'target_id':y['id'],'type':'CONTAINS'})
    ga=client.get('/graph/snapshot',params={'project_id':a['id']}).json()
    gb=client.get('/graph/snapshot',params={'project_id':b['id']}).json()
    assert {n['id'] for n in ga['nodes']}=={a['id'],x['id']}
    assert {n['id'] for n in gb['nodes']}=={b['id'],y['id']}
    cors=client.options('/objects/',headers={'Origin':'http://localhost:5174','Access-Control-Request-Method':'GET'})
    assert cors.status_code==200
    assert cors.headers['access-control-allow-origin']=='http://localhost:5174'


def test_project_children_are_scoped_even_before_linking_and_cannot_cross_projects():
    a=client.post('/objects/',json={'type':'project','title':'MedPlus'}).json()
    b=client.post('/objects/',json={'type':'project','title':'DataSakti'}).json()
    child=client.post('/objects/',json={'type':'idea','title':'Features','project_id':a['id']}).json()
    loose=client.post('/objects/',json={'type':'idea','title':'Loose A','project_id':a['id']}).json()
    gb=client.get('/graph/snapshot',params={'project_id':a['id']}).json()
    assert {n['id'] for n in gb['nodes']} == {a['id'],child['id'],loose['id']}
    # A child cannot be contained by a second project.
    cross=client.post('/relationships/',json={'source_id':b['id'],'target_id':child['id'],'type':'CONTAINS'})
    assert cross.status_code==409
    # Nor can any relationship leak between project realms.
    cross2=client.post('/relationships/',json={'source_id':child['id'],'target_id':b['id'],'type':'SUPPORTS'})
    assert cross2.status_code==409
    # A child-to-child relationship inside the same project is valid.
    inner=client.post('/relationships/',json={'source_id':child['id'],'target_id':loose['id'],'type':'SUPPORTS'})
    assert inner.status_code==201
