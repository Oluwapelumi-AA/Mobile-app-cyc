"""Convert chapter departments to a global catalog and add member assignment.

Revision ID: f13b8d9a2c41
Revises: da72e96b4f10
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa

revision: str = "f13b8d9a2c41"
down_revision: Union[str, Sequence[str], None] = "da72e96b4f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Preserve every existing department row. If names collide across chapters,
    # retain each row and make later names unique using its former chapter ID.
    rows = bind.execute(
        sa.text("SELECT id, branch_id, name FROM departments ORDER BY id")
    ).mappings().all()
    seen = set()
    for row in rows:
        original = (row["name"] or "").strip()
        key = original.casefold()
        if key in seen:
            chapter_tag = str(row["branch_id"])[:8]
            candidate = f"{original} ({chapter_tag})"
            suffix = 2
            while candidate.casefold() in seen:
                candidate = f"{original} ({chapter_tag}-{suffix})"
                suffix += 1
            bind.execute(
                sa.text("UPDATE departments SET name=:name WHERE id=:id"),
                {"name": candidate, "id": row["id"]},
            )
            key = candidate.casefold()
        seen.add(key)

    # Resolve the FK name from the actual database. PostgreSQL and SQLite may
    # represent unnamed foreign keys differently.
    inspector = sa.inspect(bind)
    department_fks = inspector.get_foreign_keys("departments")
    branch_fk = next(
        (fk for fk in department_fks if fk.get("constrained_columns") == ["branch_id"]),
        None,
    )
    fk_name = (branch_fk or {}).get("name") or "fk_departments_branch_id_branches"

    naming = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
    with op.batch_alter_table("departments", naming_convention=naming) as batch:
        batch.drop_constraint("uq_departments_branch_name", type_="unique")
        batch.drop_constraint(fk_name, type_="foreignkey")
        batch.drop_index("ix_departments_branch_id")
        batch.drop_column("branch_id")
        batch.create_unique_constraint("uq_departments_name", ["name"])

    # Seed the four agreed global departments without overwriting existing rows.
    existing = {
        (name or "").strip().casefold()
        for name in bind.execute(sa.text("SELECT name FROM departments")).scalars()
    }
    for name in ("Prayer", "Media", "Bible", "Worship Team"):
        if name.casefold() not in existing:
            bind.execute(
                sa.text("""INSERT INTO departments
                    (id, name, description, created_by, created_at, updated_at)
                    VALUES (:id, :name, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"""),
                {"id": uuid.uuid4().hex, "name": name},
            )

    with op.batch_alter_table("user_profiles", naming_convention=naming) as batch:
        batch.add_column(sa.Column("department_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_user_profiles_department_id_departments",
            "departments", ["department_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_index("ix_user_profiles_department_id", ["department_id"])


def downgrade() -> None:
    raise RuntimeError(
        "Unsafe downgrade blocked: global departments cannot be mapped back to "
        "chapter-specific rows without an explicit chapter mapping. Restore a "
        "pre-migration database backup instead."
    )
