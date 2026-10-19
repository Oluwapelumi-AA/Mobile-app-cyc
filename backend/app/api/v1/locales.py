"""Which languages the API writes in."""

from typing import Annotated

from fastapi import APIRouter, Header
from pydantic import BaseModel

from app import i18n

router = APIRouter(prefix="/locales", tags=["Localization"])


class Language(BaseModel):
    code: str
    name: str
    native_name: str


class LocalesRead(BaseModel):
    default_language: str
    # Languages notifications and emails are written in. The app can offer
    # more for its own screens; anything else gets the default.
    languages: list[Language]
    # The best match for this request's Accept-Language header.
    negotiated_language: str


@router.get("", response_model=LocalesRead)
def list_locales(accept_language: Annotated[str | None, Header()] = None):
    """No sign-in needed."""
    return LocalesRead(
        default_language=i18n.default_language(),
        languages=[
            Language(code=code, name=name, native_name=native_name)
            for code in i18n.supported_languages()
            for name, native_name in [i18n.LANGUAGE_NAMES.get(code, (code, code))]
        ],
        negotiated_language=i18n.negotiate(accept_language),
    )
