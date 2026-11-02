"""Validated BGE query embeddings and exact pgvector cosine mentor retrieval."""

import math
import threading
import unicodedata
from typing import Literal
from uuid import UUID

from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from .config import SearchSettings
from .hybrid import BM25, fuse
from .indexing import DIMENSIONS, MODEL_NAME, EmbeddingInputTooLong, source_text

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
    ranking: Literal["semantic", "hybrid"] | None = None

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
    ranking: Literal["semantic", "hybrid"] = "semantic"


HYBRID_CANDIDATES = 50
CORPUS_SQL = """
    SELECT p.id::text AS profile_id, p.headline, p.biography, m.mentorship_topics,
        COALESCE((SELECT array_agg(s.name) FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
            WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('organization', w.organization, 'job_title', w.job_title,
            'description', w.description)) FROM work_experience w WHERE w.profile_id = p.id), '[]'::jsonb) AS experience
    FROM profile_embeddings e JOIN profiles p ON p.id = e.profile_id
    JOIN mentorship_preferences m ON m.profile_id = p.id
    WHERE m.consent_to_matching AND m.available_for_mentorship AND e.model_name = %(model_name)s
"""
SIGNATURE_SQL = """
    SELECT count(*), max(e.indexed_at)::text FROM profile_embeddings e
    JOIN mentorship_preferences m ON m.profile_id = e.profile_id
    WHERE m.consent_to_matching AND m.available_for_mentorship AND e.model_name = %(model_name)s
"""
_corpus_lock = threading.Lock()
_corpus = {"signature": None, "bm25": None}


def keyword_index(conn):
    """BM25 over the same text that is embedded; rebuilt whenever the mentor corpus changes."""
    with conn.cursor() as cur:
        cur.execute(SIGNATURE_SQL, {"model_name": MODEL_NAME})
        signature = cur.fetchone()
    with _corpus_lock:
        if _corpus["signature"] != signature:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(CORPUS_SQL, {"model_name": MODEL_NAME})
                _corpus["bm25"] = BM25({row["profile_id"]: source_text(row) for row in cur.fetchall()})
            _corpus["signature"] = signature
        return _corpus["bm25"]


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
    ranking = request.ranking or settings.ranking
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
            "model_name": MODEL_NAME, "threshold": threshold,
            "top_k": max(top_k, HYBRID_CANDIDATES) if ranking == "hybrid" else top_k,
        })
        results = [MentorResult(**row) for row in cur.fetchall()]
    if ranking == "hybrid" and results:
        # The threshold already decided who qualifies; keywords only reorder those candidates.
        by_id = {str(r.profile_id): r for r in results}
        order = fuse([str(r.profile_id) for r in results], keyword_index(conn).scores(request.query), top_k)
        results = [by_id[i] for i in order]
    return SearchResponse(results=results[:top_k], top_k=top_k, similarity_threshold=threshold, ranking=ranking)


def check_search_database(conn):
    """Plan the existing query to check schema, permissions and pgvector without retrieval."""
    with conn.cursor() as cur:
        cur.execute("EXPLAIN " + SEARCH_SQL, {
            "embedding": "[1," + ",".join(["0"] * (DIMENSIONS - 1)) + "]",
            "model_name": MODEL_NAME, "threshold": 0.5, "top_k": 1,
        })


class RecommendRequest(BaseModel):
    """Recommend mentors for a member from their own profile text; no query is needed."""
    model_config = ConfigDict(extra="forbid")
    profile_id: UUID
    top_k: StrictInt = Field(default=4, ge=1, le=20)
    exclude: list[UUID] = Field(default_factory=list, max_length=200)


class RecommendResponse(BaseModel):
    results: list[MentorResult]


MEMBER_SQL = """
    SELECT p.headline, p.biography, p.current_job_title, p.industry, NULL AS mentorship_topics,
        COALESCE((SELECT array_agg(s.name) FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
            WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('organization', w.organization, 'job_title', w.job_title,
            'description', w.description)) FROM work_experience w WHERE w.profile_id = p.id), '[]'::jsonb) AS experience
    FROM profiles p WHERE p.id = %(profile_id)s
"""
# Profile-to-profile similarity is symmetric (both sides are passages), so scores run
# higher than query-to-passage scores; the threshold is correspondingly stricter.
RECOMMEND_THRESHOLD = 0.6
RECOMMEND_SQL = SEARCH_SQL.replace(
    "AND e.model_name = %(model_name)s",
    "AND e.model_name = %(model_name)s AND p.id <> %(profile_id)s AND NOT (p.id = ANY(%(exclude)s::uuid[]))")


def recommend_mentors(conn, encoder, request: RecommendRequest):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(MEMBER_SQL, {"profile_id": request.profile_id})
        member = cur.fetchone()
    text = source_text(member) if member else ""
    if member and member.get("current_job_title"):
        text = f"Current role: {member['current_job_title']}\n{text}"
    if not text.strip():
        return RecommendResponse(results=[])
    try:
        vector = [float(v) for v in encoder.encode(text)]
        if len(vector) != DIMENSIONS or not all(math.isfinite(v) for v in vector):
            raise EmbeddingUnavailable("Profile embedding must contain 768 finite values")
    except EmbeddingInputTooLong:
        raise
    except Exception as exc:
        raise EmbeddingUnavailable() from exc
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(RECOMMEND_SQL, {
            "embedding": "[" + ",".join(map(str, vector)) + "]", "model_name": MODEL_NAME,
            "threshold": RECOMMEND_THRESHOLD, "top_k": request.top_k,
            "profile_id": request.profile_id, "exclude": [str(i) for i in request.exclude],
        })
        return RecommendResponse(results=[MentorResult(**row) for row in cur.fetchall()])
