"""The mobile app's home screen, in one request."""

from pydantic import BaseModel

from app.schemas.course import CourseSummary
from app.schemas.event import EventRead
from app.schemas.meeting import MeetingRead
from app.schemas.membership import MyMembershipRead
from app.schemas.post import PostRead
from app.schemas.resource import ResourceSummary


class HomeRead(BaseModel):
    membership: MyMembershipRead
    unread_notifications: int
    # Sessions happening right now that you can join.
    live_now: list[MeetingRead]
    # The next events you can see, soonest first.
    upcoming_events: list[EventRead]
    # Latest posts in your Chapter; empty if you aren't a Member.
    recent_posts: list[PostRead]
    # Newest published resources you can see.
    new_resources: list[ResourceSummary]
    # Courses you're enrolled in and haven't finished.
    continue_learning: list[CourseSummary]
