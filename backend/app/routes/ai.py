from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CamelotObject, Relationship
from ..services.gemma_service import (
    generate_text,
    generate_extraction,
    get_model,
    is_configured,
)


router = APIRouter(
    prefix="/ai",
    tags=["AI"],
)


class AskRequest(BaseModel):
    prompt: str = Field(
        min_length=1,
        max_length=10000
    )

    project_id: int | None = None


class CompileRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=30000
    )

    project_id: int | None = None


@router.get("/status")
def status():

    configured = is_configured()

    return {
        "provider": "Google",
        "model": get_model(),
        "configured": configured,
        "enabled": configured,
        "message": (
            "Gemma 4 is connected and ready."
            if configured
            else "Gemma 4 is not configured."
        ),
    }


@router.post("/ask")
def ask(
    request: AskRequest,
    db: Session = Depends(get_db),
):

    project = None

    if request.project_id is not None:

        project = db.get(
            CamelotObject,
            request.project_id
        )

        if not project or project.type != "project":
            raise HTTPException(
                status_code=404,
                detail="Project not found."
            )

    context = ""

    if project:

        context = f"""
PROJECT CONTEXT

Project:
{project.title}

Description:
{project.content or "No description available."}

Status:
{project.status}
"""

        linked_objects = (
            db.query(CamelotObject)
            .filter(
                CamelotObject.project_id == project.id
            )
            .limit(30)
            .all()
        )

        if linked_objects:

            context += "\nPROJECT OBJECTS\n"

            for obj in linked_objects:

                context += (
                    f"- [{obj.type}] "
                    f"{obj.title} "
                    f"(status: {obj.status})\n"
                )

    prompt = f"""
You are the AI reasoning engine inside Temporal Intelligence Workspace,
an application called Camelot.

Your job is to help users understand projects, decisions,
dependencies, history, research and next actions.

Important rules:

1. Do not invent facts.
2. Clearly distinguish facts from suggestions.
3. Use the supplied project context when available.
4. Give practical answers.
5. Keep the answer concise but useful.

{context}

USER QUESTION:

{request.prompt}
"""

    answer = generate_text(prompt)

    return {
        "answer": answer,
        "configured": True,
        "project_id": request.project_id,
        "model": get_model(),
    }


@router.post("/compile")
def compile_information(
    request: CompileRequest,
):

    prompt = f"""
You are the structured intelligence engine of Camelot,
a Temporal Intelligence Workspace.

Convert the user's unstructured project information into
Camelot-compatible knowledge objects, relationships and events.

SUPPORTED OBJECT TYPES:

- project
- idea
- question
- task
- decision
- document

SUPPORTED STATUSES:

- active
- planned
- in_progress
- blocked
- completed
- archived

SUPPORTED RELATIONSHIPS:

- CONTAINS
- DEPENDS_ON
- SUPPORTS
- CONTRADICTS
- REFERENCES
- RELATED_TO
- CREATED_BY
- ASSIGNED_TO
- SUPERSEDES
- DERIVED_FROM

RULES:

1. Do not invent information.
2. Only extract information supported by the input.
3. Use temporary refs such as obj_1, obj_2, obj_3.
4. Relationships must reference valid temporary refs.
5. Create a decision object when an explicit decision exists.
6. Create a task when an actionable task exists.
7. Create a question when an unresolved question exists.
8. Create a document when the input describes a source, paper,
   specification, report or other reference material.
9. Use "idea" for proposed concepts.
10. Use "project" only when a project is explicitly described.
11. Keep titles concise.
12. If no relationship is supported by the input, return an empty list.
13. If no historical event is clearly present, return an empty list.
14. Never fabricate dates or people.
15. The output will be validated by the backend before anything
    is written to the database.

USER INFORMATION:

{request.text}
"""

    try:

        extraction = generate_extraction(prompt)

    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail=f"Gemma extraction failed: {str(exc)}"
        )

    return {
        "project_id": request.project_id,
        "model": get_model(),
        "result": extraction.model_dump(),
    }