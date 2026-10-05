from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine, SessionLocal, migrate_legacy
from .seed import seed
from .routes import objects,relationships,graph,events,members,attachments,uploads,workspace,search,ai,health

Base.metadata.create_all(bind=engine)
migrate_legacy()
db=SessionLocal()
try: seed(db)
finally: db.close()

app=FastAPI(title='Camelot API',description='Temporal Intelligence Workspace data backend',version='0.5.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173','http://localhost:5174','http://127.0.0.1:5174','http://localhost:5175','http://127.0.0.1:5175','http://localhost:5176','http://127.0.0.1:5176','http://localhost:5177','http://127.0.0.1:5177','http://localhost:5178','http://127.0.0.1:5178','http://localhost:5179','http://127.0.0.1:5179','http://localhost:5180','http://127.0.0.1:5180'],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
for router in [health.router,objects.router,relationships.router,graph.router,events.router,members.router,attachments.router,uploads.router,workspace.router,search.router,ai.router]:app.include_router(router)
UPLOAD_DIR=Path(__file__).resolve().parents[1]/'uploads';UPLOAD_DIR.mkdir(parents=True,exist_ok=True)
app.mount('/uploads/files',StaticFiles(directory=UPLOAD_DIR),name='uploaded-files')
@app.get('/')
def root(): return {'name':'Camelot','version':'0.5.0','status':'online','ai_enabled':False}
