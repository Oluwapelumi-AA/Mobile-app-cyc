"""merge communities and branches into chapters

Chapters become the only grouping in the app.

- ``branches`` is renamed ``chapters`` and every ``branch_id`` column
  becomes ``chapter_id``.
- ``branch_coordinators`` becomes ``chapter_staff`` with a ``role`` column
  (``coordinator`` or ``moderator``). Existing Coordinators keep their role.
- Communities are removed. Their content moves to the Chapter the community
  belonged to (``communities.branch_id``):
  - posts (with comments and reactions), events, meetings and resources;
  - bans (``community_bans`` -> ``chapter_bans``);
  - reports and audit log entries.
  Content of a community that had no Chapter can't be placed anywhere and is
  deleted.
- ``chapter_posts`` / ``chapter_post_comments`` are folded into ``posts`` /
  ``comments`` (same ids), so reactions, reports and search now work on
  Chapter posts. Guest grants of a Chapter post now point at ``post_id``.
- Notification types and the ``community`` preference category are renamed
  to their Chapter equivalents; the onboarding step ``communities`` becomes
  ``chapter``.

Downgrade is not supported: communities and branches can't be rebuilt from
Chapters. Restore a database backup instead.

Revision ID: b7d4e2f9a1c3
Revises: 34e1f0bff75e
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7d4e2f9a1c3"
down_revision: Union[str, Sequence[str], None] = "34e1f0bff75e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REPORT_TARGETS_NEW = "'post', 'comment', 'user', 'chapter', 'event', 'resource'"
REPORT_TARGETS_BRIDGE = (
    "'post', 'comment', 'user', 'community', 'chapter', 'event', 'resource'"
)

# The Chapter a community belonged to, by community id.
COMMUNITY_CHAPTER = "(SELECT c.branch_id FROM communities c WHERE c.id = {column})"


def _fk_name(table: str, column: str) -> str | None:
    """The name of the foreign key on ``table.column``, if it has one.

    SQLite keeps unnamed foreign keys; batch mode then rebuilds the table
    without them when the column goes.
    """
    for fk in sa.inspect(op.get_bind()).get_foreign_keys(table):
        if fk["constrained_columns"] == [column] and fk.get("name"):
            return fk["name"]
    return None


def _has_index(table: str, name: str) -> bool:
    return any(index["name"] == name for index in sa.inspect(op.get_bind()).get_indexes(table))


def _drop_fk(batch, table: str, column: str) -> None:
    name = _fk_name(table, column)
    if name:
        batch.drop_constraint(name, type_="foreignkey")


def _delete_content(where_events: str, where_meetings: str, where_resources: str) -> None:
    """Delete events, meetings and resources (and what hangs off them).

    Foreign keys are not enforced during SQLite migrations, so dependent rows
    are removed explicitly.
    """
    execute = op.execute
    execute(
        "DELETE FROM chapter_access_grant_items WHERE event_id IN "
        f"(SELECT id FROM events WHERE {where_events})"
    )
    execute(
        "DELETE FROM event_registrations WHERE event_id IN "
        f"(SELECT id FROM events WHERE {where_events})"
    )
    execute(
        "UPDATE meetings SET event_id = NULL WHERE event_id IN "
        f"(SELECT id FROM events WHERE {where_events})"
    )
    execute(f"DELETE FROM events WHERE {where_events}")

    execute(
        "DELETE FROM chapter_access_grant_items WHERE meeting_id IN "
        f"(SELECT id FROM meetings WHERE {where_meetings})"
    )
    execute(
        "DELETE FROM meeting_recordings WHERE meeting_id IN "
        f"(SELECT id FROM meetings WHERE {where_meetings})"
    )
    execute(f"DELETE FROM meetings WHERE {where_meetings}")

    for table in ("chapter_access_grant_items", "resource_bookmarks", "resource_progress"):
        execute(
            f"DELETE FROM {table} WHERE resource_id IN "
            f"(SELECT id FROM resources WHERE {where_resources})"
        )
    execute(f"DELETE FROM resources WHERE {where_resources}")


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. branches -> chapters
    # ------------------------------------------------------------------
    op.rename_table("branches", "chapters")
    if _has_index("chapters", "ix_branches_country_code"):
        op.drop_index("ix_branches_country_code", table_name="chapters")
    op.create_index("ix_chapters_country_code", "chapters", ["country_code"])

    # ------------------------------------------------------------------
    # 2. branch_coordinators -> chapter_staff (coordinator / moderator)
    # ------------------------------------------------------------------
    op.create_table(
        "chapter_staff",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("assigned_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('coordinator', 'moderator')", name="ck_chapter_staff_role"),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_chapter_staff_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_chapter_staff_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"], ["users.id"], name="fk_chapter_staff_assigned_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "user_id", name="uq_chapter_staff_chapter_user"),
    )
    op.create_index("ix_chapter_staff_chapter_id", "chapter_staff", ["chapter_id"])
    op.create_index("ix_chapter_staff_user_id", "chapter_staff", ["user_id"])
    op.create_index(
        "uq_chapter_staff_one_coordinator",
        "chapter_staff",
        ["chapter_id"],
        unique=True,
        sqlite_where=sa.text("role = 'coordinator'"),
        postgresql_where=sa.text("role = 'coordinator'"),
    )
    op.execute(
        "INSERT INTO chapter_staff (id, chapter_id, user_id, role, assigned_by, created_at) "
        "SELECT id, branch_id, user_id, 'coordinator', assigned_by, created_at "
        "FROM branch_coordinators"
    )
    op.drop_table("branch_coordinators")

    # ------------------------------------------------------------------
    # 3. user_profiles.branch_id -> chapter_id; onboarding step rename
    # ------------------------------------------------------------------
    with op.batch_alter_table("user_profiles") as batch:
        if _has_index("user_profiles", "ix_user_profiles_branch_id"):
            batch.drop_index("ix_user_profiles_branch_id")
        _drop_fk(batch, "user_profiles", "branch_id")
        batch.alter_column("branch_id", new_column_name="chapter_id")
    with op.batch_alter_table("user_profiles") as batch:
        batch.create_foreign_key(
            "fk_user_profiles_chapter_id_chapters", "chapters", ["chapter_id"], ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_user_profiles_chapter_id", ["chapter_id"])

    profiles = sa.table(
        "user_profiles",
        sa.column("user_id", sa.Uuid()),
        sa.column("onboarding_steps", sa.JSON()),
    )
    for user_id, steps in bind.execute(sa.select(profiles.c.user_id, profiles.c.onboarding_steps)):
        if isinstance(steps, str):
            steps = json.loads(steps)
        if not isinstance(steps, dict) or "communities" not in steps:
            continue
        steps = dict(steps)
        status = steps.pop("communities")
        steps.setdefault("chapter", status)
        bind.execute(
            profiles.update().where(profiles.c.user_id == user_id).values(onboarding_steps=steps)
        )

    # ------------------------------------------------------------------
    # 4. Posts: community posts and Chapter posts become one table
    # ------------------------------------------------------------------
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("chapter_id", sa.Uuid(), nullable=True))
    op.execute(f"UPDATE posts SET chapter_id = {COMMUNITY_CHAPTER.format(column='posts.community_id')}")

    # Posts of communities with no Chapter can't be placed: remove them.
    orphan_posts = "SELECT id FROM posts WHERE chapter_id IS NULL"
    orphan_comments = f"SELECT id FROM comments WHERE post_id IN ({orphan_posts})"
    op.execute(f"DELETE FROM reactions WHERE target_type = 'comment' AND target_id IN ({orphan_comments})")
    op.execute(f"DELETE FROM reactions WHERE target_type = 'post' AND target_id IN ({orphan_posts})")
    op.execute(f"DELETE FROM chapter_access_grant_items WHERE post_id IN ({orphan_posts})")
    op.execute(f"DELETE FROM comments WHERE post_id IN ({orphan_posts})")
    op.execute("DELETE FROM posts WHERE chapter_id IS NULL")

    with op.batch_alter_table("posts") as batch:
        if _has_index("posts", "ix_posts_community_feed"):
            batch.drop_index("ix_posts_community_feed")
        _drop_fk(batch, "posts", "community_id")
        batch.drop_column("community_id")

    # Chapter posts keep their ids, so Guest grants can point at them. The
    # one-target check is relaxed while a grant item briefly has both ids.
    with op.batch_alter_table("chapter_access_grant_items") as batch:
        batch.drop_constraint("ck_chapter_access_grant_item_exactly_one_target", type_="check")
    op.execute(
        "INSERT INTO posts (id, chapter_id, author_id, body, created_at, updated_at) "
        "SELECT id, branch_id, author_id, body, created_at, updated_at FROM chapter_posts"
    )
    op.execute(
        "INSERT INTO comments (id, post_id, author_id, body, created_at, updated_at) "
        "SELECT id, post_id, author_id, body, created_at, created_at FROM chapter_post_comments"
    )
    op.execute(
        "UPDATE chapter_access_grant_items SET post_id = chapter_post_id "
        "WHERE chapter_post_id IS NOT NULL"
    )

    with op.batch_alter_table("posts") as batch:
        batch.alter_column("chapter_id", existing_type=sa.Uuid(), nullable=False)
        batch.create_foreign_key(
            "fk_posts_chapter_id_chapters", "chapters", ["chapter_id"], ["id"], ondelete="CASCADE"
        )
        batch.create_index("ix_posts_chapter_feed", ["chapter_id", "created_at", "id"])

    # ------------------------------------------------------------------
    # 5. Guest grant items: chapter_post_id is now post_id
    # ------------------------------------------------------------------
    with op.batch_alter_table("chapter_access_grant_items") as batch:
        batch.drop_constraint("uq_chapter_grant_chapter_post", type_="unique")
        _drop_fk(batch, "chapter_access_grant_items", "chapter_post_id")
        batch.drop_column("chapter_post_id")
    with op.batch_alter_table("chapter_access_grant_items") as batch:
        batch.create_check_constraint(
            "ck_chapter_access_grant_item_exactly_one_target",
            "(CASE WHEN post_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN event_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN meeting_id IS NOT NULL THEN 1 ELSE 0 END"
            " + CASE WHEN resource_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
        )

    op.drop_table("chapter_post_comments")
    op.drop_table("chapter_posts")

    # ------------------------------------------------------------------
    # 6. Events, meetings, resources: community-owned -> Chapter-owned
    # ------------------------------------------------------------------
    # The old "Chapter or community, not both" checks go first, so rows can
    # carry both ids for a moment.
    for table in ("events", "meetings", "resources"):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f"ck_{table}_single_scope", type_="check")
    for table in ("events", "meetings", "resources"):
        op.execute(
            f"UPDATE {table} SET chapter_id = "
            f"{COMMUNITY_CHAPTER.format(column=f'{table}.community_id')} "
            "WHERE community_id IS NOT NULL AND chapter_id IS NULL"
        )
    orphaned = "community_id IS NOT NULL AND chapter_id IS NULL"
    _delete_content(orphaned, orphaned, orphaned)

    community_indexes = {
        "events": "ix_events_community_schedule",
        "meetings": "ix_meetings_community_created",
        "resources": "ix_resources_community_status_published",
    }
    for table, index in community_indexes.items():
        with op.batch_alter_table(table) as batch:
            if _has_index(table, index):
                batch.drop_index(index)
            _drop_fk(batch, table, "community_id")
            batch.drop_column("community_id")

    # ------------------------------------------------------------------
    # 7. Reports: community_id -> chapter_id, target 'community' -> 'chapter'
    # ------------------------------------------------------------------
    with op.batch_alter_table("content_reports") as batch:
        batch.add_column(sa.Column("chapter_id", sa.Uuid(), nullable=True))
        batch.drop_constraint("ck_content_reports_target_type", type_="check")
        batch.create_check_constraint(
            "ck_content_reports_target_type", f"target_type IN ({REPORT_TARGETS_BRIDGE})"
        )
    op.execute(
        "UPDATE content_reports SET chapter_id = "
        f"{COMMUNITY_CHAPTER.format(column='content_reports.community_id')} "
        "WHERE community_id IS NOT NULL"
    )
    # Reports about a community become reports about its Chapter (reviewed by
    # app staff); those about a community with no Chapter are dropped.
    op.execute(
        "DELETE FROM content_reports WHERE target_type = 'community' AND "
        f"{COMMUNITY_CHAPTER.format(column='content_reports.target_id')} IS NULL"
    )
    op.execute(
        "UPDATE content_reports SET target_type = 'chapter', target_id = "
        f"{COMMUNITY_CHAPTER.format(column='content_reports.target_id')} "
        "WHERE target_type = 'community'"
    )
    # Two reports by one person about the same community/Chapter can now
    # collide on (reporter, target): keep the newest.
    op.execute(
        "DELETE FROM content_reports WHERE target_type = 'chapter' AND id NOT IN ("
        "SELECT id FROM (SELECT r.id FROM content_reports r WHERE r.target_type = 'chapter' "
        "AND r.created_at = (SELECT MAX(r2.created_at) FROM content_reports r2 "
        "WHERE r2.target_type = 'chapter' AND r2.target_id = r.target_id "
        "AND r2.reporter_id IS NOT DISTINCT FROM r.reporter_id)) keep)"
        if bind.dialect.name == "postgresql"
        else "DELETE FROM content_reports WHERE target_type = 'chapter' AND id NOT IN ("
        "SELECT r.id FROM content_reports r WHERE r.target_type = 'chapter' "
        "AND r.created_at = (SELECT MAX(r2.created_at) FROM content_reports r2 "
        "WHERE r2.target_type = 'chapter' AND r2.target_id = r.target_id "
        "AND r2.reporter_id IS r.reporter_id))"
    )
    with op.batch_alter_table("content_reports") as batch:
        if _has_index("content_reports", "ix_content_reports_community_status"):
            batch.drop_index("ix_content_reports_community_status")
        _drop_fk(batch, "content_reports", "community_id")
        batch.drop_column("community_id")
        batch.drop_constraint("ck_content_reports_target_type", type_="check")
        batch.create_check_constraint(
            "ck_content_reports_target_type", f"target_type IN ({REPORT_TARGETS_NEW})"
        )
        batch.create_foreign_key(
            "fk_content_reports_chapter_id_chapters", "chapters", ["chapter_id"], ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_content_reports_chapter_status", ["chapter_id", "status"])

    # ------------------------------------------------------------------
    # 8. community_bans -> chapter_bans
    # ------------------------------------------------------------------
    op.create_table(
        "chapter_bans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("banned_by", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_chapter_bans_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_chapter_bans_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["banned_by"], ["users.id"], name="fk_chapter_bans_banned_by_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "user_id", name="uq_chapter_bans_chapter_user"),
    )
    op.create_index("ix_chapter_bans_user_id", "chapter_bans", ["user_id"])
    # One ban per person per Chapter: the earliest one wins.
    op.execute(
        "INSERT INTO chapter_bans (id, chapter_id, user_id, banned_by, reason, created_at) "
        "SELECT b.id, c.branch_id, b.user_id, b.banned_by, b.reason, b.created_at "
        "FROM community_bans b JOIN communities c ON c.id = b.community_id "
        "WHERE c.branch_id IS NOT NULL AND b.created_at = ("
        "  SELECT MIN(b2.created_at) FROM community_bans b2 "
        "  JOIN communities c2 ON c2.id = b2.community_id "
        "  WHERE c2.branch_id = c.branch_id AND b2.user_id = b.user_id)"
    )
    op.drop_table("community_bans")

    # ------------------------------------------------------------------
    # 9. Audit log: community_id -> chapter_id; branch.* -> chapter.*
    # ------------------------------------------------------------------
    with op.batch_alter_table("audit_logs") as batch:
        batch.add_column(sa.Column("chapter_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE audit_logs SET chapter_id = "
        f"{COMMUNITY_CHAPTER.format(column='audit_logs.community_id')} "
        "WHERE community_id IS NOT NULL"
    )
    op.execute(
        "UPDATE audit_logs SET chapter_id = target_id "
        "WHERE target_type = 'branch' AND chapter_id IS NULL"
    )
    for old, new in (
        ("branch.created", "chapter.created"),
        ("branch.updated", "chapter.updated"),
        ("branch.archived", "chapter.archived"),
        ("branch.restored", "chapter.restored"),
    ):
        op.execute(f"UPDATE audit_logs SET action = '{new}' WHERE action = '{old}'")
    op.execute("UPDATE audit_logs SET target_type = 'chapter' WHERE target_type = 'branch'")
    with op.batch_alter_table("audit_logs") as batch:
        if _has_index("audit_logs", "ix_audit_logs_community_created"):
            batch.drop_index("ix_audit_logs_community_created")
        batch.drop_column("community_id")
        batch.create_index("ix_audit_logs_chapter_created", ["chapter_id", "created_at", "id"])

    # ------------------------------------------------------------------
    # 10. Notifications
    # ------------------------------------------------------------------
    for old, new in (
        ("community_role_changed", "chapter_role_changed"),
        ("community_removed", "chapter_removed"),
        ("community_banned", "chapter_banned"),
    ):
        op.execute(f"UPDATE notifications SET type = '{new}' WHERE type = '{old}'")
    op.execute("UPDATE notifications SET category = 'chapter' WHERE category = 'community'")
    op.execute(
        "UPDATE notification_preferences SET category = 'chapter' WHERE category = 'community'"
    )

    # ------------------------------------------------------------------
    # 11. Communities are gone
    # ------------------------------------------------------------------
    op.drop_table("community_memberships")
    op.drop_table("communities")


def downgrade() -> None:
    raise NotImplementedError(
        "Communities and branches can't be rebuilt from Chapters. "
        "Restore a database backup taken before this migration instead."
    )
