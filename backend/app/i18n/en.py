"""English. Every key lives here; other catalogs may leave keys out."""

MESSAGES = {
    "common.someone": "Someone",
    # How a date and time is written, as a strftime pattern.
    "format.datetime": "%a %d %b %Y, %H:%M",
    # "You are now {role} of ...".
    "role.owner": "an owner",
    "role.admin": "an admin",
    "role.moderator": "a moderator",
    "role.member": "a member",
    "notification.comment_on_post.title": "{name} commented on your post",
    "notification.community_role_changed.title": "You are now {role} of {community}",
    "notification.community_removed.title": "You were removed from {community}",
    "notification.community_banned.title": "You can no longer take part in {community}",
    "notification.community_banned.body": "A moderator removed you from the community.",
    "notification.content_removed.title.post": "Your post in {community} was removed",
    "notification.content_removed.title.comment": "Your comment in {community} was removed",
    "notification.content_removed.body": (
        "A moderator removed it for breaking the community guidelines."
    ),
    "notification.event_spot_confirmed.title": "You have a spot at {event}",
    "notification.event_spot_confirmed.body": (
        "A place opened up and you're off the waitlist."
    ),
    "notification.event_rescheduled.title": "{event} has a new time",
    "notification.event_rescheduled.body": "It now starts {start}.",
    "notification.event_cancelled.title": "{event} was cancelled",
    "notification.event_reminder.title": "{event} starts soon",
    "notification.event_reminder.body": "Starts {start}.",
    "notification.meeting_live.title": "{meeting} is live",
    "notification.meeting_live.body.meeting": "The meeting has started. Join now.",
    "notification.meeting_live.body.livestream": "The livestream has started. Join now.",
    "notification.resource_published.title": "New in {community}: {resource}",
    "email.footer": (
        "You're getting this email from The Light App. "
        "You can change which emails you get in the app under Settings > Notifications."
    ),
}
