"""Everything the home screen needs, so the app makes one request."""

from sqlalchemy.orm import Session

from app.core.identity import UserId
from app.models.meeting import MeetingStatus
from app.schemas.home import HomeRead
from app.services import (
    courses,
    events,
    meetings,
    membership,
    notifications,
    posts,
    resources,
)

SECTION_SIZE = 5


def home(db: Session, user_id: UserId) -> HomeRead:
    me = membership.my_membership(db, user_id)

    live, _ = meetings.list_meetings(db, user_id, SECTION_SIZE, None, status=MeetingStatus.LIVE)
    upcoming, _ = events.list_events(db, user_id, SECTION_SIZE * 3, None)
    upcoming = [e for e in upcoming if e.status != "cancelled"][:SECTION_SIZE]
    recent = []
    if me.chapter_id is not None:
        recent, _ = posts.list_feed(db, user_id, me.chapter_id, SECTION_SIZE, None)
    new_resources, _ = resources.list_resources(db, user_id, SECTION_SIZE, None)
    enrolled = courses.list_courses(db, user_id, limit=20, enrolled=True).items
    learning = [c for c in enrolled if c.completed_at is None][:SECTION_SIZE]

    return HomeRead(
        membership=me,
        unread_notifications=notifications.unread_count(db, user_id),
        live_now=live,
        upcoming_events=upcoming,
        recent_posts=recent,
        new_resources=new_resources,
        continue_learning=learning,
    )
