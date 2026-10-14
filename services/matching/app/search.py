"""Validated BGE query embeddings and exact pgvector cosine mentor retrieval."""

import math
import unicodedata
from uuid import UUID

from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from .config import SearchSettings
from .indexing import DIMENSIONS, MODEL_NAME, EmbeddingInputTooLong

MAX_QUERY_LENGTH = 500
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class EmbeddingUnavailable(RuntimeError):
    """Model inference or embedding validation failed."""


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(strict=True, min_length=1, max_length=MAX_QUERY_LENGTH)
    top_k: StrictInt | None = Field(default=None, ge=1, le=50)
    similarity_threshold: float | None = Field(
        default=None, strict=True, ge=-1, le=1, allow_inf_nan=False)

    @field_validator("query", mode="before")
    @classmethod
    def sanitize_query(cls, value):
        if not isinstance(value, str):
            raise ValueError("query must be a string")
        # Check raw size as well as sanitized size so whitespace cannot bypass limits.
        if len(value) > MAX_QUERY_LENGTH:
            raise ValueError(f"query must be at most {MAX_QUERY_LENGTH} characters")
        if any(unicodedata.category(c).startswith("C") and not c.isspace() for c in value):
            raise ValueError("query contains unsupported control or invisible characters")
        result = " ".join(unicodedata.normalize("NFC", value).split())
        if not result:
            raise ValueError("query must contain non-whitespace text")
        return result


class MentorResult(BaseModel):
    profile_id: UUID
    headline: str | None
    former_kq_role: str | None
    former_kq_department: str | None
    current_job_title: str | None
    current_organization: str | None
    relevant_skills: list[str]
    similarity_score: float


class SearchResponse(BaseModel):
    results: list[MentorResult]
    top_k: int
    similarity_threshold: float


SEARCH_SQL = """
    WITH ranked AS (
        SELECT p.id AS profile_id, p.headline, p.former_kq_role,
            p.former_kq_department, p.current_job_title, p.current_organization,
            1 - (e.embedding <=> %(embedding)s::vector) AS similarity_score
        FROM profile_embeddings e
        JOIN profiles p ON p.id = e.profile_id
        JOIN mentorship_preferences m ON m.profile_id = p.id
        WHERE m.consent_to_matching = TRUE
          AND m.available_for_mentorship = TRUE
          AND e.model_name = %(model_name)s
    ), selected AS (
        SELECT * FROM ranked WHERE similarity_score >= %(threshold)s
        ORDER BY similarity_score DESC, profile_id ASC
        LIMIT %(top_k)s
    )
    SELECT selected.*,
        COALESCE((SELECT array_agg(s.name ORDER BY s.name)
            FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
            WHERE ps.profile_id = selected.profile_id), ARRAY[]::varchar[]) AS relevant_skills
    FROM selected
    ORDER BY similarity_score DESC, profile_id ASC
"""


def search_mentors(conn, encoder, request: SearchRequest, settings: SearchSettings):
    top_k = request.top_k if request.top_k is not None else settings.top_k
    threshold = (request.similarity_threshold if request.similarity_threshold is not None
                 else settings.similarity_threshold)
    # Profiles remain unprefixed. BGE recommends the instruction only for queries.
    try:
        vector = [float(v) for v in encoder.encode(QUERY_INSTRUCTION + request.query)]
        if len(vector) != DIMENSIONS or not all(math.isfinite(v) for v in vector):
            raise EmbeddingUnavailable("Query embedding must contain 768 finite values")
        if not math.isclose(sum(v * v for v in vector), 1.0, abs_tol=1e-4):
            raise EmbeddingUnavailable("Query embedding must be normalized and nonzero")
    except EmbeddingInputTooLong:
        raise
    except Exception as exc:
        raise EmbeddingUnavailable() from exc
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(SEARCH_SQL, {
            "embedding": "[" + ",".join(map(str, vector)) + "]",
            "model_name": MODEL_NAME, "threshold": threshold, "top_k": top_k,
        })
        results = [MentorResult(**row) for row in cur.fetchall()]
    return SearchResponse(results=results, top_k=top_k, similarity_threshold=threshold)


def check_search_database(conn):
    """Plan the existing query to check schema, permissions and pgvector without retrieval."""
    with conn.cursor() as cur:
        cur.execute("EXPLAIN " + SEARCH_SQL, {
            "embedding": "[1," + ",".join(["0"] * (DIMENSIONS - 1)) + "]",
            "model_name": MODEL_NAME, "threshold": 0.5, "top_k": 1,
        })
