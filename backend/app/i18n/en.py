"""English. Every key lives here; other catalogs may leave keys out."""

MESSAGES = {
    "common.someone": "Someone",
    # How a date and time is written, as a strftime pattern.
    "format.datetime": "%a %d %b %Y, %H:%M",
    # "You are now {role} of ...".
    "role.coordinator": "the Coordinator",
    "role.moderator": "a Moderator",
    "notification.comment_on_post.title": "{name} commented on your post",
    "notification.chapter_role_changed.title": "You are now {role} of {chapter}",
    "notification.chapter_staff_removed.title": "You're no longer on the staff of {chapter}",
    "notification.chapter_removed.title": "You were removed from {chapter}",
    "notification.chapter_banned.title": "You can no longer take part in {chapter}",
    "notification.chapter_banned.body": "A moderator banned you from posting, commenting and registering in this Chapter.",
    "notification.content_removed.title.post": "Your post in {chapter} was removed",
    "notification.content_removed.title.comment": "Your comment in {chapter} was removed",
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
    "notification.resource_published.title": "New in {chapter}: {resource}",
    "email.footer": (
        "You're getting this email from The Light App. "
        "You can change which emails you get in the app under Settings > Notifications."
    ),
}
