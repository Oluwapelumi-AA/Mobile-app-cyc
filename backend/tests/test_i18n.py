from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app import i18n
from app.i18n import LocalTime, Text
from app.models import Notification

COMMUNITIES = "/api/v1/communities"
PROFILE = "/api/v1/profiles/me"


@pytest.mark.parametrize(
    ("tag", "expected"),
    [
        ("fr", "fr"),
        ("fr-CA", "fr"),
        ("pt-BR", "pt"),
        ("pt_BR", "pt"),
        ("ES-419", "es"),
        ("yo", "en"),
        (None, "en"),
        ("", "en"),
    ],
)
def test_best_language(tag, expected):
    assert i18n.best_language(tag) == expected


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("fr-CH, fr;q=0.9, en;q=0.8", "fr"),
        ("yo, pt;q=0.5, es;q=0.7", "es"),
        ("de, *;q=0.5", "en"),
        ("es;q=0, pt", "pt"),
        ("en;q=bad, fr", "fr"),
        (None, "en"),
    ],
)
def test_negotiate(header, expected):
    assert i18n.negotiate(header) == expected


def test_every_catalog_has_only_known_keys_and_placeholders():
    english = i18n.CATALOGS["en"]
    for language, catalog in i18n.CATALOGS.items():
        assert set(catalog) <= set(english), language
        for key, template in catalog.items():
            names = {part.split("}")[0] for part in template.split("{")[1:]}
            english_names = {part.split("}")[0] for part in english[key].split("{")[1:]}
            assert names == english_names, (language, key)


def test_render_nested_text_and_times():
    when = datetime(2026, 11, 6, 17, 0, tzinfo=UTC)
    text = Text("notification.event_reminder.body", start=LocalTime(when, "Africa/Lagos"))
    assert i18n.render(text, "en") == "Starts Fri 06 Nov 2026, 18:00 (Africa/Lagos)."
    assert i18n.render(text, "fr") == "Début le 06/11/2026 18:00 (Africa/Lagos)."
    role = Text(
        "notification.community_role_changed.title",
        role=Text("role.admin"),
        community="Abuja Fellowship",
    )
    assert i18n.render(role, "en") == "You are now an admin of Abuja Fellowship"
    assert i18n.render(role, "es") == "Ahora eres administrador de Abuja Fellowship"
    assert i18n.render("plain", "fr") == "plain"
    assert i18n.render(None, "fr") is None


def test_missing_keys_fall_back_to_english(monkeypatch):
    monkeypatch.setitem(i18n.CATALOGS, "fr", {})
    assert i18n.render(Text("common.someone"), "fr") == "Someone"


def test_locales_endpoint(api):
    response = api.client.get("/api/v1/locales", headers={"Accept-Language": "pt-BR,pt;q=0.9"})
    assert response.status_code == 200
    body = response.json()
    assert body["default_language"] == "en"
    assert body["negotiated_language"] == "pt"
    assert {"code": "fr", "name": "French", "native_name": "Français"} in body["languages"]


def test_notifications_use_each_recipients_language(api):
    ids = {name: api.add_user(name) for name in ("owner", "ana", "luc", "ada")}
    languages = {"owner": "en", "ana": "pt-BR", "luc": "fr", "ada": "yo"}
    for name, language in languages.items():
        api.act_as(ids[name])
        api.client.post(PROFILE, json={"display_name": name.title(), "language_code": language})
    api.act_as(ids["owner"])
    cid = api.client.post(COMMUNITIES, json={"name": "Abuja Fellowship"}).json()["id"]
    for name in ("ana", "luc", "ada"):
        api.act_as(ids[name])
        api.client.post(f"{COMMUNITIES}/{cid}/join")
        api.act_as(ids["owner"])
        api.client.patch(f"{COMMUNITIES}/{cid}/members/{ids[name]}", json={"role": "moderator"})

    with api.session_factory() as db:
        titles = {
            user_id: title
            for user_id, title in db.execute(select(Notification.user_id, Notification.title))
        }
    assert titles[ids["ana"]] == "Agora você é moderador de Abuja Fellowship"
    assert titles[ids["luc"]] == "Vous êtes maintenant modérateur de Abuja Fellowship"
    assert titles[ids["ada"]] == "You are now a moderator of Abuja Fellowship"


def test_email_footer_is_translated(api):
    from app.services.email_sender import FakeEmailSender
    from app.services.notification_jobs import process_deliveries
    from app.services.push_provider import FakePushProvider

    owner, luc = api.add_user("owner"), api.add_user("luc")
    for user_id, language in ((owner, "en"), (luc, "fr")):
        api.act_as(user_id)
        api.client.post(PROFILE, json={"display_name": "Luc", "language_code": language})
    api.act_as(luc)
    api.client.patch(
        "/api/v1/notifications/preferences",
        json={"preferences": [{"category": "community", "email": True}]},
    )
    api.act_as(owner)
    cid = api.client.post(COMMUNITIES, json={"name": "Paris Jeunesse"}).json()["id"]
    api.act_as(luc)
    api.client.post(f"{COMMUNITIES}/{cid}/join")
    api.act_as(owner)
    api.client.patch(f"{COMMUNITIES}/{cid}/members/{luc}", json={"role": "admin"})

    email = FakeEmailSender()
    with api.session_factory() as db:
        process_deliveries(db, FakePushProvider(), email)
    [message] = email.outbox
    assert message.subject == "Vous êtes maintenant administrateur de Paris Jeunesse"
    assert "Réglages > Notifications" in message.text


def test_default_language_must_be_supported():
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(supported_languages=["en"], default_language="fr")
