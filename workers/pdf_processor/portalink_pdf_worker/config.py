from __future__ import annotations

from dataclasses import dataclass
import os


MAX_PAGE_DIMENSION = 2048
WEBP_QUALITY = 85
RENDER_DPI = 200


def _positive_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value < minimum or value > maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    poll_seconds: int = 2
    job_timeout_seconds: int = 900
    page_timeout_seconds: int = 45
    page_memory_limit_mb: int = 1024
    lease_seconds: int = 1200

    @classmethod
    def from_environment(cls) -> "Settings":
        url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url.startswith("https://") or not url.endswith(".supabase.co"):
            raise ValueError("SUPABASE_URL must be the project's https://*.supabase.co URL")
        if len(key) < 40:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY is missing or invalid")

        job_timeout = _positive_int("PDF_JOB_TIMEOUT_SECONDS", 900, 60, 3300)
        lease = _positive_int(
            "PDF_JOB_LEASE_SECONDS",
            max(1200, job_timeout + 120),
            job_timeout + 60,
            3600,
        )
        return cls(
            supabase_url=url,
            supabase_service_role_key=key,
            poll_seconds=_positive_int("PDF_POLL_SECONDS", 2, 1, 60),
            job_timeout_seconds=job_timeout,
            page_timeout_seconds=_positive_int("PDF_PAGE_TIMEOUT_SECONDS", 45, 5, 300),
            page_memory_limit_mb=_positive_int("PDF_PAGE_MEMORY_LIMIT_MB", 1024, 256, 4096),
            lease_seconds=lease,
        )
