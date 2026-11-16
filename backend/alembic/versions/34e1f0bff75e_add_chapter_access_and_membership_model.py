
"""add chapter access and membership model

Revision ID: 34e1f0bff75e
Revises: f13b8d9a2c41
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic.
revision: str = "34e1f0bff75e"
down_revision: Union[str, Sequence[str], None] = "f13b8d9a2c41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply Chapter access and membership changes."""

    # ---------------------------------------------------------
    # 1. Chapter access grants
    # ---------------------------------------------------------

    op.create_table(
        "chapter_access_grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("granted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["branches.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chapter_id",
            "user_id",
            name="uq_chapter_access_grant_user",
        ),
    )

    op.create_index(
        "ix_chapter_access_grants_chapter_id",
        "chapter_access_grants",
        ["chapter_id"],
    )

    op.create_index(
        "ix_chapter_access_grants_user_id",
        "chapter_access_grants",
        ["user_id"],
    )

    # ---------------------------------------------------------
    # 2. Chapter access requests
    # ---------------------------------------------------------

    op.create_table(
        "chapter_access_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "approved",
                "declined",
                "cancelled",
                name="chapter_access_request_status_enum",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["branches.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_chapter_access_requests_chapter_id",
        "chapter_access_requests",
        ["chapter_id"],
    )

    op.create_index(
        "ix_chapter_access_requests_user_id",
        "chapter_access_requests",
        ["user_id"],
    )

    op.create_index(
        "uq_chapter_access_request_pending",
        "chapter_access_requests",
        ["chapter_id", "user_id"],
        unique=True,
        sqlite_where=sa.text("status = 'pending'"),
        postgresql_where=sa.text("status = 'pending'"),
    )

    # ---------------------------------------------------------
    # 3. Chapter coverage areas
    # ---------------------------------------------------------

    op.create_table(
        "chapter_coverage_areas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("coverage_key", sa.String(length=180), nullable=False),
        sa.Column("area_type", sa.String(length=20), nullable=False),
        sa.Column("area_name", sa.String(length=150), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("radius_km", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "area_type IN ('country', 'region', 'city')",
            name="ck_chapter_coverage_area_type",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) "
            "OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_chapter_coverage_coordinates_pair",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_chapter_coverage_latitude",
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_chapter_coverage_longitude",
        ),
        sa.CheckConstraint(
            "radius_km IS NULL OR radius_km > 0",
            name="ck_chapter_coverage_radius",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["branches.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chapter_id",
            "coverage_key",
            name="uq_chapter_coverage_area_key",
        ),
    )

    op.create_index(
        "ix_chapter_coverage_areas_chapter_id",
        "chapter_coverage_areas",
        ["chapter_id"],
    )

    op.create_index(
        "ix_chapter_coverage_areas_country_code",
        "chapter_coverage_areas",
        ["country_code"],
    )

    # ---------------------------------------------------------
    # 4. Chapter access grant items
    # ---------------------------------------------------------

    op.create_table(
        "chapter_access_grant_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("grant_id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=True),
        sa.Column("chapter_post_id", sa.Uuid(), nullable=True),
        sa.Column("event_id", sa.Uuid(), nullable=True),
        sa.Column("meeting_id", sa.Uuid(), nullable=True),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            """
            (
                CASE WHEN post_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN chapter_post_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN event_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN meeting_id IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN resource_id IS NOT NULL THEN 1 ELSE 0 END
            ) = 1
            """,
            name="ck_chapter_access_grant_item_exactly_one_target",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_post_id"],
            ["chapter_posts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["grant_id"],
            ["chapter_access_grants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meetings.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["posts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["resources.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "grant_id",
            "chapter_post_id",
            name="uq_chapter_grant_chapter_post",
        ),
        sa.UniqueConstraint(
            "grant_id",
            "event_id",
            name="uq_chapter_grant_event",
        ),
        sa.UniqueConstraint(
            "grant_id",
            "meeting_id",
            name="uq_chapter_grant_meeting",
        ),
        sa.UniqueConstraint(
            "grant_id",
            "post_id",
            name="uq_chapter_grant_post",
        ),
        sa.UniqueConstraint(
            "grant_id",
            "resource_id",
            name="uq_chapter_grant_resource",
        ),
    )

    op.create_index(
        "ix_chapter_access_grant_items_grant_id",
        "chapter_access_grant_items",
        ["grant_id"],
    )

    # ---------------------------------------------------------
    # 5. One Coordinator per Chapter
    # ---------------------------------------------------------

    with op.batch_alter_table(
        "branch_coordinators",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        },
    ) as batch_op:
        batch_op.drop_constraint(
            "uq_branch_coordinators_branch_user",
            type_="unique",
        )
        batch_op.create_unique_constraint(
            "uq_branch_coordinators_one_per_chapter",
            ["branch_id"],
        )

    # ---------------------------------------------------------
    # 6. Add Chapter scope to Events
    # ---------------------------------------------------------

    with op.batch_alter_table(
        "events",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        },
    ) as batch_op:
        batch_op.add_column(
            sa.Column("chapter_id", sa.Uuid(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_events_chapter_id_branches",
            "branches",
            ["chapter_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_check_constraint(
            "ck_events_single_scope",
            "chapter_id IS NULL OR community_id IS NULL",
        )
        batch_op.create_index(
            "ix_events_chapter_id",
            ["chapter_id"],
        )
        batch_op.create_index(
            "ix_events_chapter_schedule",
            ["chapter_id", "starts_at", "id"],
        )

    # ---------------------------------------------------------
    # 7. Add Chapter scope to Meetings
    # ---------------------------------------------------------

    with op.batch_alter_table(
        "meetings",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        },
    ) as batch_op:
        batch_op.add_column(
            sa.Column("chapter_id", sa.Uuid(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_meetings_chapter_id_branches",
            "branches",
            ["chapter_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_check_constraint(
            "ck_meetings_single_scope",
            "chapter_id IS NULL OR community_id IS NULL",
        )
        batch_op.create_index(
            "ix_meetings_chapter_id",
            ["chapter_id"],
        )
        batch_op.create_index(
            "ix_meetings_chapter_created",
            ["chapter_id", "created_at", "id"],
        )

    # ---------------------------------------------------------
    # 8. Add Chapter scope to Resources
    # ---------------------------------------------------------

    with op.batch_alter_table(
        "resources",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        },
    ) as batch_op:
        batch_op.add_column(
            sa.Column("chapter_id", sa.Uuid(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_resources_chapter_id_branches",
            "branches",
            ["chapter_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_check_constraint(
            "ck_resources_single_scope",
            "chapter_id IS NULL OR community_id IS NULL",
        )
        batch_op.create_index(
            "ix_resources_chapter_id",
            ["chapter_id"],
        )
        batch_op.create_index(
            "ix_resources_chapter_status_published",
            ["chapter_id", "status", "published_at", "id"],
        )

    # ---------------------------------------------------------
    # 9. Extend user profiles
    # ---------------------------------------------------------

    with op.batch_alter_table(
        "user_profiles",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"
        },
    ) as batch_op:
        batch_op.add_column(
            sa.Column("city", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(
            sa.Column("preferred_chapter_id", sa.Uuid(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_user_profiles_preferred_chapter_id_branches",
            "branches",
            ["preferred_chapter_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_user_profiles_preferred_chapter_id",
            ["preferred_chapter_id"],
        )

  
    # ---------------------------------------------------------
    # 10. Add membership status to existing and future users
    # ---------------------------------------------------------

    bind = op.get_bind()
    dialect_name = bind.dialect.name

    op.add_column(
        "users",
        sa.Column(
            "membership_status",
            sa.String(length=6),
            server_default=sa.text("'guest'"),
            nullable=False,
        ),
    )

    if dialect_name == "sqlite":
        # SQLite cannot add an implicit Enum CHECK constraint
        # through ALTER TABLE ADD COLUMN. Use triggers instead,
        # without rebuilding the heavily referenced users table.

        op.execute(
            """
            CREATE TRIGGER trg_users_membership_status_insert
            BEFORE INSERT ON users
            FOR EACH ROW
            WHEN NEW.membership_status NOT IN ('guest', 'member')
            BEGIN
                SELECT RAISE(ABORT, 'invalid membership_status');
            END;
            """
        )

        op.execute(
            """
            CREATE TRIGGER trg_users_membership_status_update
            BEFORE UPDATE OF membership_status ON users
            FOR EACH ROW
            WHEN NEW.membership_status NOT IN ('guest', 'member')
            BEGIN
                SELECT RAISE(ABORT, 'invalid membership_status');
            END;
            """
        )

    else:
        op.create_check_constraint(
            "membership_status_enum",
            "users",
            "membership_status IN ('guest', 'member')",
        )

    
def downgrade() -> None:
    """Prevent accidental loss of Chapter data during downgrade."""

    raise RuntimeError(
        "This migration cannot be downgraded automatically because "
        "Chapter access grants, requests, coverage areas, and membership "
        "data may have been created after the upgrade. Restore a verified "
        "database backup if a rollback is required."
    )

