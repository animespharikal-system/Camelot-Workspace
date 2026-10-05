from typing import Literal

from pydantic import BaseModel, Field


ObjectType = Literal[
    "project",
    "idea",
    "question",
    "task",
    "decision",
    "document",
]

ObjectStatus = Literal[
    "active",
    "planned",
    "in_progress",
    "blocked",
    "completed",
    "archived",
]

RelationshipType = Literal[
    "CONTAINS",
    "DEPENDS_ON",
    "SUPPORTS",
    "CONTRADICTS",
    "REFERENCES",
    "RELATED_TO",
    "CREATED_BY",
    "ASSIGNED_TO",
    "SUPERSEDES",
    "DERIVED_FROM",
]


class AIObject(BaseModel):
    ref: str = Field(
        description="Unique temporary reference such as obj_1 or obj_2."
    )

    type: ObjectType = Field(
        description="Camelot object type."
    )

    title: str = Field(
        description="Short, meaningful title."
    )

    content: str | None = Field(
        default=None,
        description="Useful description or extracted information."
    )

    status: ObjectStatus = Field(
        default="active",
        description="Current status of the object."
    )


class AIRelationship(BaseModel):
    source_ref: str = Field(
        description="Reference of the source object."
    )

    target_ref: str = Field(
        description="Reference of the target object."
    )

    type: RelationshipType = Field(
        description="Relationship between the two objects."
    )

    weight: int = Field(
        default=1,
        ge=1,
        le=100,
        description="Relationship strength from 1 to 100."
    )


class AIEvent(BaseModel):
    object_ref: str | None = Field(
        default=None,
        description="Object reference associated with this event."
    )

    event_type: str = Field(
        description="Type of historical event."
    )

    description: str = Field(
        description="What happened."
    )


class AIExtraction(BaseModel):
    summary: str = Field(
        description="Short summary of the supplied information."
    )

    objects: list[AIObject] = Field(
        default_factory=list,
        description="Objects extracted from the information."
    )

    relationships: list[AIRelationship] = Field(
        default_factory=list,
        description="Relationships between extracted objects."
    )

    events: list[AIEvent] = Field(
        default_factory=list,
        description="Historical events discovered in the information."
    )