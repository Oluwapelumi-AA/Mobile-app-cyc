import os

# Auth needs a signing key, and a fresh checkout has no .env. A SECRET_KEY
# already set in the environment is kept.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-for-production-use")
# Tests never reach a real video provider or bucket, whatever .env says.
os.environ["VIDEO_PROVIDER"] = "fake"
os.environ["STORAGE_BACKEND"] = "none"
os.environ["PUSH_PROVIDER"] = "fake"
os.environ["EMAIL_BACKEND"] = "fake"


from uuid import uuid4  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


def _uuid(value):
    from uuid import UUID

    return UUID(value) if isinstance(value, str) else value


@pytest.fixture
def api(tmp_path):
    """A client on a fresh SQLite database, with users you can act as.

    ``api.add_user("name")`` creates a user and returns its id;
    ``api.act_as(user_id)`` makes later requests come from that user.
    """
    from app.api.deps import get_current_user_id
    from app.db.session import Base, get_db
    from app.main import app
    from app.models import AccountRole, User

    engine = create_engine(
        f"sqlite:///{tmp_path / 'api_test.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    class Api:
        session_factory = TestSession
        current_user_id = None

        def add_user(self, name: str, account_role: AccountRole = AccountRole.USER):
            with TestSession() as db:
                user = User(
                    email=f"{name}@example.com",
                    password_hash="test-password-hash",
                    account_role=account_role,
                )
                db.add(user)
                db.commit()
                return user.id

        def act_as(self, user_id):
            self.current_user_id = user_id

        # Chapters. Ids may be UUIDs or the strings the API returns.

        def add_chapter(self, name: str = "Lagos", *, is_active: bool = True, **fields):
            """Create a Chapter directly in the database and return its id."""
            from app.models import Chapter

            with TestSession() as db:
                chapter = Chapter(
                    slug=fields.pop("slug", None) or f"{name.lower().replace(' ', '-')}-{uuid4().hex[:6]}",
                    name=name,
                    country_code=fields.pop("country_code", "NG"),
                    timezone=fields.pop("timezone", "Africa/Lagos"),
                    is_active=is_active,
                    **fields,
                )
                db.add(chapter)
                db.commit()
                return chapter.id

        def add_profile(self, user_id, name: str | None = None, **fields):
            """Give a user a profile (needed for membership and display names)."""
            from app.models import UserProfile

            user_id = _uuid(user_id)
            fields = {k: _uuid(v) if k.endswith("_id") else v for k, v in fields.items()}
            with TestSession() as db:
                profile = db.get(UserProfile, user_id)
                if profile is None:
                    profile = UserProfile(
                        user_id=user_id,
                        display_name=name or "Member",
                        onboarding_steps={},
                    )
                    db.add(profile)
                for key, value in fields.items():
                    setattr(profile, key, value)
                db.commit()

        def add_member(self, user_id, chapter_id, name: str | None = None):
            """Make the user an official Member of the Chapter."""
            from app.models import MembershipStatus, User

            self.add_profile(user_id, name, chapter_id=chapter_id)
            with TestSession() as db:
                db.get(User, _uuid(user_id)).membership_status = MembershipStatus.MEMBER
                db.commit()

        def add_staff(self, user_id, chapter_id, role: str = "coordinator"):
            """Make the user the Chapter's Coordinator or a Moderator."""
            from app.models import ChapterStaff

            with TestSession() as db:
                db.add(
                    ChapterStaff(chapter_id=_uuid(chapter_id), user_id=_uuid(user_id), role=role)
                )
                db.commit()

        def grant(self, user_id, chapter_id, **item):
            """Grant a Guest one item (post_id=, event_id=, meeting_id= or resource_id=)."""
            from app.models import ChapterAccessGrant, ChapterAccessGrantItem

            with TestSession() as db:
                grant = ChapterAccessGrant(chapter_id=_uuid(chapter_id), user_id=_uuid(user_id))
                db.add(grant)
                db.flush()
                item = {key: _uuid(value) for key, value in item.items()}
                db.add(ChapterAccessGrantItem(grant_id=grant.id, **item))
                db.commit()

    context = Api()

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user_id] = lambda: context.current_user_id
    try:
        with TestClient(app) as client:
            context.client = client
            yield context
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user_id, None)
        engine.dispose()
