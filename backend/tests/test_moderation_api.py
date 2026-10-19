import uuid

import pytest
from sqlalchemy import select

from app.models import AccountRole, AuditLog, Comment, Notification, Post, Reaction

COMMUNITIES = "/api/v1/communities"
PROFILE = "/api/v1/profiles/me"
REPORTS = "/api/v1/reports"
QUEUE = "/api/v1/moderation/reports"
AUDIT = "/api/v1/moderation/audit-logs"
EVENTS = "/api/v1/events"


@pytest.fixture
def world(api):
    """A public community with an owner, a moderator and two members, a
    second community moderated by someone else, and an app moderator."""
    ids = {name: api.add_user(name) for name in ("owner", "mod", "alice", "bob", "other")}
    ids["staff"] = api.add_user("staff", AccountRole.MODERATOR)
    for name in ("owner", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(PROFILE, json={"display_name": name.title(), "bio": f"I am {name}"})
    api.act_as(ids["owner"])
    cid = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()["id"]
    for name in ("mod", "alice", "bob"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(ids["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids['mod']}", json={"role": "moderator"})
    api.act_as(ids["other"])
    other_cid = api.client.post(COMMUNITIES, json={"name": "Lagos Youth"}).json()["id"]
    return {"community_id": cid, "other_community_id": other_cid, **ids}


def post(api, user_id, community_id, body="Buy cheap followers at spam.example"):
    api.act_as(user_id)
    response = api.client.post(f"{COMMUNITIES}/{community_id}/posts", json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def comment(api, user_id, post_id, body="Click my link"):
    api.act_as(user_id)
    response = api.client.post(f"/api/v1/posts/{post_id}/comments", json={"body": body})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def report(api, user_id, target_type, target_id, reason="spam", **extra):
    api.act_as(user_id)
    return api.client.post(
        REPORTS,
        json={"target_type": target_type, "target_id": str(target_id), "reason": reason, **extra},
    )


def reported(api, user_id, target_type, target_id, **extra):
    response = report(api, user_id, target_type, target_id, **extra)
    assert response.status_code == 201, response.text
    return response.json()


def queue(api, user_id, **params):
    api.act_as(user_id)
    response = api.client.get(QUEUE, params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def resolve(api, user_id, report_id, **payload):
    api.act_as(user_id)
    return api.client.post(f"{QUEUE}/{report_id}/resolve", json=payload)


def audit_actions(api, **params):
    with api.session_factory() as db:
        statement = select(AuditLog.action).order_by(AuditLog.created_at)
        for name, value in params.items():
            statement = statement.where(getattr(AuditLog, name) == value)
        return list(db.scalars(statement))


# Reporting


def test_member_reports_a_post(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    body = reported(api, world["alice"], "post", post_id, details="  Selling followers  ")
    assert body["status"] == "open"
    assert body["details"] == "Selling followers"
    assert body["reviewed_at"] is None
    # Reporters don't see moderator-only fields.
    assert "snapshot" not in body and "reviewed_by" not in body

    api.act_as(world["alice"])
    mine = api.client.get(f"{REPORTS}/mine").json()["items"]
    assert [item["id"] for item in mine] == [body["id"]]


def test_report_keeps_a_snapshot_after_an_edit(api, world):
    post_id = post(api, world["bob"], world["community_id"], body="Original text")
    reported(api, world["alice"], "post", post_id)
    api.act_as(world["bob"])
    api.client.patch(f"/api/v1/posts/{post_id}", json={"body": "Edited text"})
    [item] = queue(api, world["mod"])
    assert item["snapshot"] == {"body": "Original text"}
    assert item["target_owner_id"] == str(world["bob"])
    assert item["community_id"] == world["community_id"]
    assert item["target_exists"] is True


def test_cannot_report_yourself_or_twice(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    response = report(api, world["bob"], "post", post_id)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "cannot_report_self"
    response = report(api, world["bob"], "user", world["bob"])
    assert response.json()["detail"]["code"] == "cannot_report_self"

    reported(api, world["alice"], "post", post_id)
    response = report(api, world["alice"], "post", post_id, reason="hate")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "already_reported"


def test_reporting_again_after_review_reopens(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    first = reported(api, world["alice"], "post", post_id)
    assert resolve(api, world["mod"], first["id"], status="dismissed").status_code == 200
    again = reported(api, world["alice"], "post", post_id, reason="harassment")
    assert again["id"] == first["id"]
    assert again["status"] == "open"
    assert again["reason"] == "harassment"
    assert again["reviewed_at"] is None


def test_hidden_or_missing_targets_are_not_found(api, world):
    api.act_as(world["other"])
    private_id = api.client.post(
        COMMUNITIES, json={"name": "Leaders Circle", "visibility": "private"}
    ).json()["id"]
    hidden = post(api, world["other"], private_id)
    response = report(api, world["alice"], "post", hidden)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "post_not_found"
    response = report(api, world["alice"], "community", private_id)
    assert response.json()["detail"]["code"] == "community_not_found"
    response = report(api, world["alice"], "user", uuid.uuid4())
    assert response.json()["detail"]["code"] == "user_not_found"
    response = report(api, world["alice"], "comment", uuid.uuid4())
    assert response.json()["detail"]["code"] == "comment_not_found"


@pytest.mark.parametrize(
    "payload",
    [
        {"target_type": "post", "target_id": "not-a-uuid", "reason": "spam"},
        {"target_type": "message", "target_id": str(uuid.uuid4()), "reason": "spam"},
        {"target_type": "post", "target_id": str(uuid.uuid4()), "reason": "boring"},
        {"target_type": "post", "target_id": str(uuid.uuid4()), "reason": "spam", "details": "x" * 1001},
    ],
)
def test_bad_reports_are_rejected(api, world, payload):
    api.act_as(world["alice"])
    assert api.client.post(REPORTS, json=payload).status_code == 422


def test_user_event_resource_and_community_reports(api, world):
    from datetime import UTC, datetime, timedelta

    snapshot = reported(api, world["alice"], "user", world["bob"], reason="impersonation")
    api.act_as(world["staff"])
    item = api.client.get(f"{QUEUE}/{snapshot['id']}").json()
    assert item["snapshot"]["display_name"] == "Bob"
    assert item["community_id"] is None

    api.act_as(world["owner"])
    starts = datetime.now(UTC) + timedelta(days=2)
    event_id = api.client.post(
        EVENTS,
        json={
            "community_id": world["community_id"],
            "title": "Prayer Night",
            "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "timezone": "Africa/Lagos",
        },
    ).json()["id"]
    event_report = reported(api, world["alice"], "event", event_id)
    community_report = reported(api, world["alice"], "community", world["community_id"])

    # Community content goes to the community; the community itself to staff.
    mod_ids = {item["id"] for item in queue(api, world["mod"])}
    assert event_report["id"] in mod_ids
    assert community_report["id"] not in mod_ids
    staff_ids = {item["id"] for item in queue(api, world["staff"], app_wide=True)}
    assert staff_ids == {snapshot["id"], community_report["id"]}


# The queue


def test_queue_is_scoped_to_communities_you_moderate(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    reported(api, world["alice"], "post", post_id)
    other_post = post(api, world["other"], world["other_community_id"], body="Hello")
    api.act_as(world["alice"])
    api.client.post(f"{COMMUNITIES}/{world['other_community_id']}/join")
    reported(api, world["alice"], "post", other_post)

    assert len(queue(api, world["mod"])) == 1
    assert len(queue(api, world["other"])) == 1
    assert len(queue(api, world["staff"])) == 2
    assert queue(api, world["alice"]) == []

    api.act_as(world["alice"])
    response = api.client.get(QUEUE, params={"community_id": world["community_id"]})
    assert response.status_code == 403
    response = api.client.get(QUEUE, params={"app_wide": True})
    assert response.status_code == 403


def test_queue_counts_reports_on_the_same_target(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    reported(api, world["alice"], "post", post_id)
    reported(api, world["owner"], "post", post_id, reason="hate")
    items = queue(api, world["mod"])
    assert [item["open_reports_on_target"] for item in items] == [2, 2]


def test_others_cannot_read_a_report(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    report_id = reported(api, world["alice"], "post", post_id)["id"]
    for who in ("alice", "other"):
        api.act_as(world[who])
        response = api.client.get(f"{QUEUE}/{report_id}")
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "report_not_found"


# Reviewing


def test_dismissing_closes_every_open_report_on_the_target(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    first = reported(api, world["alice"], "post", post_id)
    reported(api, world["owner"], "post", post_id)
    response = resolve(api, world["mod"], first["id"], status="dismissed", note="Not spam")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "dismissed"
    assert body["reviewed_by"] == str(world["mod"])
    assert body["resolution_note"] == "Not spam"
    assert queue(api, world["mod"]) == []
    assert len(queue(api, world["mod"], status="dismissed")) == 2
    assert len(queue(api, world["mod"], status="any")) == 2
    assert audit_actions(api) == ["member.role_changed", "report.dismissed"]

    response = resolve(api, world["mod"], first["id"], status="actioned")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "report_closed"

    api.act_as(world["alice"])
    [mine] = api.client.get(f"{REPORTS}/mine").json()["items"]
    assert mine["status"] == "dismissed"
    assert mine["reviewed_at"] is not None


def test_removing_a_reported_post(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    comment(api, world["alice"], post_id)
    report_id = reported(api, world["alice"], "post", post_id)["id"]
    response = resolve(
        api, world["mod"], report_id, status="actioned", remove_content=True, note="Spam"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["content_removed"] is True
    assert body["target_exists"] is False

    with api.session_factory() as db:
        assert db.get(Post, uuid.UUID(post_id)) is None
        assert db.scalars(select(Comment)).all() == []
        [removed] = db.scalars(select(AuditLog).where(AuditLog.action == "post.removed"))
        assert removed.data["body"] == "Buy cheap followers at spam.example"
        assert removed.data["report_id"] == report_id
        [notice] = db.scalars(
            select(Notification).where(
                Notification.user_id == world["bob"], Notification.type == "content_removed"
            )
        )
        assert notice.title == "Your post in Abuja Fellowship was removed"


def test_removing_a_reported_comment(api, world):
    post_id = post(api, world["alice"], world["community_id"], body="Prayer request")
    comment_id = comment(api, world["bob"], post_id)
    api.act_as(world["alice"])
    response = api.client.put(f"/api/v1/reactions/comments/{comment_id}", json={"reaction_type": "like"})
    assert response.status_code == 200, response.text
    report_id = reported(api, world["alice"], "comment", comment_id)["id"]
    response = resolve(api, world["staff"], report_id, status="actioned", remove_content=True)
    assert response.status_code == 200, response.text
    with api.session_factory() as db:
        assert db.get(Comment, uuid.UUID(comment_id)) is None
        assert db.scalars(select(Reaction)).all() == []
    assert "comment.removed" in audit_actions(api, community_id=uuid.UUID(world["community_id"]))


def test_remove_content_only_for_posts_and_comments(api, world):
    report_id = reported(api, world["alice"], "user", world["bob"])["id"]
    response = resolve(api, world["staff"], report_id, status="actioned", remove_content=True)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "cannot_remove_content"
    response = resolve(api, world["staff"], report_id, status="dismissed", remove_content=True)
    assert response.status_code == 422
    response = resolve(api, world["staff"], report_id, status="open")
    assert response.status_code == 422


def test_already_deleted_content_is_not_removed_twice(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    report_id = reported(api, world["alice"], "post", post_id)["id"]
    api.act_as(world["bob"])
    api.client.delete(f"/api/v1/posts/{post_id}")
    response = resolve(api, world["mod"], report_id, status="actioned", remove_content=True)
    assert response.status_code == 200
    assert response.json()["content_removed"] is False


def test_moderators_cannot_review_reports_about_themselves(api, world):
    post_id = post(api, world["mod"], world["community_id"])
    report_id = reported(api, world["alice"], "post", post_id)["id"]
    response = resolve(api, world["mod"], report_id, status="dismissed")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "cannot_review_own"
    assert resolve(api, world["owner"], report_id, status="dismissed").status_code == 200


def test_members_cannot_review(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    report_id = reported(api, world["alice"], "post", post_id)["id"]
    response = resolve(api, world["alice"], report_id, status="dismissed")
    assert response.status_code == 404


# Moderators deleting through the normal endpoints


def test_moderator_delete_is_logged_and_author_told(api, world):
    post_id = post(api, world["bob"], world["community_id"])
    own = post(api, world["alice"], world["community_id"], body="Mine")
    api.act_as(world["mod"])
    assert api.client.delete(f"/api/v1/posts/{post_id}").status_code == 204
    api.act_as(world["alice"])
    assert api.client.delete(f"/api/v1/posts/{own}").status_code == 204
    # Only the moderator's delete is logged.
    assert audit_actions(api, action="post.removed") == ["post.removed"]
    with api.session_factory() as db:
        types = list(db.scalars(select(Notification.type)))
    assert types.count("content_removed") == 1


# Bans


def ban(api, user_id, community_id, target_id, **payload):
    api.act_as(user_id)
    return api.client.put(f"{COMMUNITIES}/{community_id}/bans/{target_id}", json=payload or None)


def test_ban_removes_and_blocks_rejoining(api, world):
    cid = world["community_id"]
    response = ban(api, world["mod"], cid, world["bob"], reason="Repeated spam")
    assert response.status_code == 201, response.text
    assert response.json()["reason"] == "Repeated spam"

    api.act_as(world["bob"])
    assert api.client.get(f"{COMMUNITIES}/{cid}").json()["my_role"] is None
    response = api.client.post(f"{COMMUNITIES}/{cid}/join")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "banned"

    response = ban(api, world["mod"], cid, world["bob"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "already_banned"

    api.act_as(world["mod"])
    bans = api.client.get(f"{COMMUNITIES}/{cid}/bans").json()["items"]
    assert [item["user_id"] for item in bans] == [str(world["bob"])]
    assert api.client.delete(f"{COMMUNITIES}/{cid}/bans/{world['bob']}").status_code == 204
    response = api.client.delete(f"{COMMUNITIES}/{cid}/bans/{world['bob']}")
    assert response.json()["detail"]["code"] == "ban_not_found"

    api.act_as(world["bob"])
    assert api.client.post(f"{COMMUNITIES}/{cid}/join").status_code == 201
    assert audit_actions(api, target_id=world["bob"]) == ["member.banned", "member.unbanned"]
    with api.session_factory() as db:
        [notice] = db.scalars(select(Notification).where(Notification.user_id == world["bob"]))
    assert notice.type == "community_banned"


def test_ban_someone_who_is_not_a_member(api, world):
    response = ban(api, world["owner"], world["community_id"], world["other"])
    assert response.status_code == 201
    api.act_as(world["other"])
    assert api.client.post(f"{COMMUNITIES}/{world['community_id']}/join").status_code == 403


def test_ban_rules(api, world):
    cid = world["community_id"]
    assert ban(api, world["alice"], cid, world["bob"]).status_code == 403
    response = ban(api, world["mod"], cid, world["mod"])
    assert response.json()["detail"]["code"] == "cannot_ban_self"
    response = ban(api, world["mod"], cid, world["owner"])
    assert response.json()["detail"]["code"] == "cannot_ban_owner"
    api.act_as(world["owner"])
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{world['alice']}", json={"role": "moderator"})
    response = ban(api, world["mod"], cid, world["alice"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_role"
    response = ban(api, world["mod"], cid, uuid.uuid4())
    assert response.json()["detail"]["code"] == "user_not_found"
    # App moderators can ban in any community.
    assert ban(api, world["staff"], cid, world["alice"]).status_code == 201
    api.act_as(world["alice"])
    assert api.client.get(f"{COMMUNITIES}/{cid}/bans").status_code == 403


# The audit log


def test_audit_log_access(api, world):
    cid = world["community_id"]
    ban(api, world["mod"], cid, world["bob"])

    api.act_as(world["staff"])
    items = api.client.get(AUDIT).json()["items"]
    assert [item["action"] for item in items] == ["member.banned", "member.role_changed"]
    assert items[0]["actor_id"] == str(world["mod"])
    assert items[1]["data"] == {"from": "member", "to": "moderator"}
    filtered = api.client.get(AUDIT, params={"action": "member.banned"}).json()["items"]
    assert len(filtered) == 1

    api.act_as(world["mod"])
    response = api.client.get(AUDIT)
    assert response.status_code == 403
    assert len(api.client.get(AUDIT, params={"community_id": cid}).json()["items"]) == 2

    api.act_as(world["alice"])
    assert api.client.get(AUDIT, params={"community_id": cid}).status_code == 403
    api.act_as(world["other"])
    response = api.client.get(AUDIT, params={"community_id": world["other_community_id"]})
    assert response.json()["items"] == []


def test_audit_log_pages(api, world):
    for _ in range(3):
        post_id = post(api, world["bob"], world["community_id"])
        api.act_as(world["mod"])
        api.client.delete(f"/api/v1/posts/{post_id}")
    api.act_as(world["staff"])
    first = api.client.get(AUDIT, params={"limit": 2}).json()
    assert len(first["items"]) == 2
    rest = api.client.get(AUDIT, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert len(rest["items"]) == 2
    assert rest["next_cursor"] is None


def test_deleting_a_community_is_logged(api, world):
    api.act_as(world["other"])
    assert api.client.delete(f"{COMMUNITIES}/{world['other_community_id']}").status_code == 204
    assert audit_actions(api, action="community.deleted") == ["community.deleted"]
