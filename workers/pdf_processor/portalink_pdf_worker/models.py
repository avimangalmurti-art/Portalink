from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PdfJob:
    id: str
    post_id: str
    attachment_id: str
    source_bucket: str
    source_path: str
    page_offset: int
    attempt_count: int
    lease_token: str

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "PdfJob":
        return cls(
            id=str(row["id"]),
            post_id=str(row["post_id"]),
            attachment_id=str(row["attachment_id"]),
            source_bucket=str(row["source_bucket"]),
            source_path=str(row["source_path"]),
            page_offset=int(row.get("page_offset") or 0),
            attempt_count=int(row.get("attempt_count") or 1),
            lease_token=str(row["lease_token"]),
        )


@dataclass(frozen=True)
class RenderedPage:
    within_document_index: int
    width: int
    height: int
    output_path: str

    @property
    def aspect_ratio(self) -> float:
        return round(self.width / self.height, 6)


class PdfPipelineError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool,
        failed_page: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.failed_page = failed_page

