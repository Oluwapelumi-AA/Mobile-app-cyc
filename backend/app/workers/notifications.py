"""The notification worker: sends push and email jobs, event reminders, and
deletes old notifications.

    python -m app.workers.notifications           # keep running
    python -m app.workers.notifications --once    # one round, e.g. from cron

Run it next to the API (a second process or container with the same
settings). Several can run at once on PostgreSQL.
"""

import argparse
import logging
import signal
import time

from app.core.config import settings
from app.db.session import SessionLocal
from app.services import notification_jobs
from app.services.email_sender import EmailSender, get_email_sender
from app.services.push_provider import PushProvider, get_push_provider

logger = logging.getLogger("app.workers.notifications")

# Old notifications are pruned about once an hour, not every round.
PRUNE_EVERY_SECONDS = 3600
MAX_BATCHES_PER_ROUND = 20


def run_once(
    push: PushProvider, email: EmailSender, session_factory=SessionLocal, prune: bool = True
) -> dict:
    with session_factory() as db:
        reminded = notification_jobs.send_event_reminders(db)
        stats = notification_jobs.DeliveryStats()
        # Keep going while full batches come back, so a backlog drains fast.
        for _ in range(MAX_BATCHES_PER_ROUND):
            batch = notification_jobs.process_deliveries(db, push, email)
            stats.add(batch)
            if batch.handled < notification_jobs.DEFAULT_BATCH_SIZE:
                break
        pruned = notification_jobs.prune_notifications(db) if prune else 0
    return {
        "reminded": reminded,
        "sent": stats.sent,
        "skipped": stats.skipped,
        "retrying": stats.retrying,
        "failed": stats.failed,
        "removed_devices": stats.removed_devices,
        "pruned": pruned,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="run one round and exit")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    push, email = get_push_provider(), get_email_sender()
    if args.once:
        logger.info("notification round: %s", run_once(push, email))
        return

    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        logger.info("stopping after this round")

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    logger.info(
        "notification worker started (push=%s, email=%s, every %ss)",
        push.name,
        email.name,
        settings.notification_worker_interval_seconds,
    )
    last_prune = 0.0
    while not stopping:
        prune = time.monotonic() - last_prune >= PRUNE_EVERY_SECONDS
        try:
            result = run_once(push, email, prune=prune)
            if prune:
                last_prune = time.monotonic()
            if any(result.values()):
                logger.info("notification round: %s", result)
        except Exception:
            # A database blip must not stop the worker; try again next round.
            logger.exception("notification round failed")
        slept = 0.0
        while not stopping and slept < settings.notification_worker_interval_seconds:
            time.sleep(0.5)
            slept += 0.5


if __name__ == "__main__":
    main()
