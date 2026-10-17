import os

# Auth needs a signing key, and a fresh checkout has no .env. A SECRET_KEY
# already set in the environment is kept.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-for-production-use")


import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


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
