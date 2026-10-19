"""Webhook endpoint the video provider calls. No user auth: the provider's
signature is checked instead."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.services import meetings
from app.services.video_provider import (
    InvalidWebhook,
    VideoProvider,
    VideoUnavailable,
    get_video_provider,
)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/video")
async def receive_video_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    provider: Annotated[VideoProvider, Depends(get_video_provider)],
):
    """Room started/ended and recording events. Retries are applied once."""
    body = await request.body()
    try:
        event = provider.parse_webhook(body, dict(request.headers))
    except VideoUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "video_unavailable", "message": "Video is not configured."},
        ) from None
    except InvalidWebhook:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_webhook", "message": "Webhook signature is not valid."},
        ) from None
    # The database work is blocking, so keep it off the event loop.
    result = await run_in_threadpool(meetings.handle_webhook, db, provider, event)
    return {"status": result}
