from __future__ import annotations

import argparse
import logging
import os
import signal
import socket
import sys
import time

from .config import Settings
from .repository import SupabaseRepository
from .worker import process_job


LOGGER = logging.getLogger(__name__)
STOP_REQUESTED = False


def _request_stop(signum: int, _frame: object) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    LOGGER.info("Received signal %s; stopping after the current job", signum)


def run(*, once: bool = False) -> int:
    settings = Settings.from_environment()
    repository = SupabaseRepository(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    failures = 0

    LOGGER.info("PDF worker %s is ready", worker_id)
    while not STOP_REQUESTED:
        try:
            job = repository.claim(worker_id, settings.lease_seconds)
            failures = 0
        except Exception:
            failures += 1
            delay = min(60, settings.poll_seconds * (2 ** min(failures, 5)))
            LOGGER.exception("Could not claim a PDF job; retrying in %d seconds", delay)
            if once:
                return 1
            time.sleep(delay)
            continue

        if job is None:
            if once:
                return 0
            time.sleep(settings.poll_seconds)
            continue

        process_job(repository, settings, job)
        if once:
            return 0
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Process queued Portalink PDFs")
    parser.add_argument("--once", action="store_true", help="Claim at most one job and exit")
    parser.add_argument("--export-http", action="store_true", help="Serve authenticated public portfolio exports instead of processing the queue")
    args = parser.parse_args()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not args.export_http:
        signal.signal(signal.SIGINT, _request_stop)
        signal.signal(signal.SIGTERM, _request_stop)
    try:
        if args.export_http:
            from .portfolio_export import serve_exports
            serve_exports()
            return
        raise SystemExit(run(once=args.once))
    except ValueError as error:
        LOGGER.error("Configuration error: %s", error)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()

