from app.models import AccountRole, User

V1 = "/api/v1"
PASSWORD = "a-long-enough-password"


def signup(api, email="ada@example.com"):
    assert api.client.post(f"{V1}/auth/register", json={"email": email, "password": PASSWORD}).status_code == 201
    tokens = api.client.post(f"{V1}/auth/login", json={"email": email, "password": PASSWORD}).json()
    with api.session_factory() as db:
        user_id = db.query(User).filter_by(email=email).one().id
    return user_id, {"Authorization": f"Bearer {tokens['access_token']}"}, tokens["refresh_token"]


def delete(api, headers, password=PASSWORD):
    return api.client.post(f"{V1}/auth/delete-account", json={"password": password}, headers=headers)


def test_delete_account_anonymises_and_signs_out(api):
    lagos = api.add_chapter("Lagos")
    user_id, headers, refresh = signup(api)
    api.add_member(user_id, lagos, "Ada Obi")
    api.add_staff(user_id, lagos, "moderator")
    api.act_as(user_id)
    post = api.client.post(f"{V1}/chapters/{lagos}/posts", json={"body": "Hello all"}).json()

    assert delete(api, headers, "wrong-password").status_code == 400
    assert delete(api, headers).status_code == 204

    # Can't sign in or refresh any more.
    assert api.client.post(f"{V1}/auth/login", json={"email": "ada@example.com", "password": PASSWORD}).status_code == 401
    assert api.client.post(f"{V1}/auth/refresh", json={"refresh_token": refresh}).status_code == 401

    with api.session_factory() as db:
        user = db.get(User, user_id)
        assert user.email.endswith("@deleted.invalid") and not user.is_active
        assert user.membership_status == "guest"

    # Their post stays, from a "Deleted user"; they're off the staff list.
    admin = api.add_user("admin", AccountRole.ADMIN)
    api.act_as(admin)
    assert api.client.get(f"{V1}/posts/{post['id']}").status_code == 200
    assert api.client.get(f"{V1}/chapters/{lagos}/staff").json() == []
    assert api.client.get(f"{V1}/chapters/{lagos}/members").json() == []

    # The email can sign up again.
    assert api.client.post(f"{V1}/auth/register", json={"email": "ada@example.com", "password": PASSWORD}).status_code == 201


def test_last_admin_cannot_delete(api):
    user_id, headers, _ = signup(api)
    with api.session_factory() as db:
        db.get(User, user_id).account_role = AccountRole.ADMIN
        db.commit()
    response = delete(api, headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "last_admin"

    api.add_user("other-admin", AccountRole.ADMIN)
    assert delete(api, headers).status_code == 204
