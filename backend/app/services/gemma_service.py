import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

from ..ai_schemas import AIExtraction


load_dotenv()


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemma-4-26b-a4b-it"
)


if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not configured. "
        "Add it to backend/.env"
    )


client = genai.Client(api_key=GEMINI_API_KEY)


def is_configured() -> bool:
    return bool(GEMINI_API_KEY)


def get_model() -> str:
    return GEMINI_MODEL


def generate_text(prompt: str) -> str:
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )

    return response.text


def generate_extraction(prompt: str) -> AIExtraction:
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AIExtraction,
        ),
    )

    if getattr(response, "parsed", None) is not None:
        return response.parsed

    return AIExtraction.model_validate_json(response.text)