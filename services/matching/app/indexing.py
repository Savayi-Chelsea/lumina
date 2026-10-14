"""Consent-aware, inference-only profile embedding ingestion."""

import hashlib
import logging
import math
import unicodedata
from collections import Counter

from psycopg.rows import dict_row

MODEL_NAME = "BAAI/bge-base-en-v1.5"
MODEL_REVISION = "a5beb1e3e68b9ab74eb54cfd186867f64f240e1a"
DIMENSIONS = 768
SOURCE_VERSION = "lumina-profile-v1"
logger = logging.getLogger(__name__)


def clean(value):
    return " ".join(unicodedata.normalize("NFC", str(value or "")).split())


def source_text(profile):
    """Only allowlisted professional content; never serialize the entire row."""
    sections = []
    for key, label in (("headline", "Headline"), ("biography", "Biography")):
        if value := clean(profile.get(key)):
            sections.append(f"{label}: {value}")
    skills = sorted({clean(s) for s in profile.get("skills", []) if clean(s)})
    if skills:
        sections.append("Skills: " + "; ".join(skills))
    experiences = []
    for experience in profile.get("experience", []):
        fields = []
        for key in ("job_title", "organization", "start_date", "end_date", "description"):
            if value := clean(experience.get(key)):
                fields.append(f"{key}: {value}")
        if experience.get("is_current"):
            fields.append("current role")
        if fields:
            experiences.append("; ".join(fields))
    if experiences:
        sections.append("Work experience:\n" + "\n".join(sorted(experiences)))
    topics = sorted({clean(t) for t in (profile.get("mentorship_topics") or "").split("|") if clean(t)})
    if topics:
        sections.append("Mentorship topics: " + "; ".join(topics))
    return "\n".join(sections)


def source_hash(text):
    return hashlib.sha256(f"{SOURCE_VERSION}\n{MODEL_NAME}\n{MODEL_REVISION}\n{text}".encode("utf-8")).hexdigest()


def read_profile(conn, profile_id):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""
            SELECT p.headline, p.biography, m.mentorship_topics,
                COALESCE((SELECT array_agg(s.name ORDER BY s.name)
                    FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
                    WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'job_title', w.job_title, 'organization', w.organization,
                    'start_date', w.start_date, 'end_date', w.end_date,
                    'is_current', w.is_current, 'description', w.description))
                    FROM work_experience w WHERE w.profile_id = p.id), '[]'::jsonb) AS experience,
                e.model_name, e.source_hash
            FROM profiles p JOIN mentorship_preferences m ON m.profile_id = p.id
            LEFT JOIN profile_embeddings e ON e.profile_id = p.id
            WHERE p.id = %s AND m.consent_to_matching
        """, (profile_id,))
        return cur.fetchone()


class BGEEncoder:
    def __init__(self):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(
            MODEL_NAME, revision=MODEL_REVISION, device="cpu", trust_remote_code=False)
        self.model.eval()
        if self.model.get_embedding_dimension() != DIMENSIONS:
            raise ValueError("Model embedding dimension must be 768")

    def encode(self, text):
        # Fail explicitly rather than silently discard source content through truncation.
        tokens = self.model.tokenizer(text, truncation=False)["input_ids"]
        if len(tokens) > self.model.max_seq_length:
            raise ValueError("Profile text exceeds the model token limit")
        return self.model.encode(text, normalize_embeddings=True, show_progress_bar=False).tolist()


def index_profiles(conn, encoder_factory=BGEEncoder):
    counts = Counter(indexed=0, skipped=0, removed=0, failed=0)
    # Removal commits before model loading, including when downloads/inference fail.
    with conn.transaction():
        removed = conn.execute("""
            DELETE FROM profile_embeddings e WHERE NOT EXISTS (
                SELECT 1 FROM mentorship_preferences m
                WHERE m.profile_id = e.profile_id AND m.consent_to_matching)
        """)
        counts["removed"] += removed.rowcount
    ids = [row[0] for row in conn.execute(
        "SELECT profile_id FROM mentorship_preferences WHERE consent_to_matching ORDER BY profile_id"
    ).fetchall()]
    encoder = None
    model_error = False
    for profile_id in ids:
        try:
            with conn.transaction():
                profile = read_profile(conn, profile_id)
            if profile is None:
                continue
            text = source_text(profile)
            digest = source_hash(text)
            if profile["model_name"] == MODEL_NAME and profile["source_hash"] == digest:
                counts["skipped"] += 1
                continue
            if not text:
                raise ValueError("Profile has no professional source content")
            if model_error:
                raise RuntimeError("Model initialization failed earlier in this run")
            if encoder is None:
                try:
                    encoder = encoder_factory()
                except Exception:
                    model_error = True
                    raise
            vector = [float(v) for v in encoder.encode(text)]
            if len(vector) != DIMENSIONS or not all(math.isfinite(v) for v in vector):
                raise ValueError("Expected 768 finite embedding values")
            norm = math.sqrt(sum(v * v for v in vector))
            if not math.isclose(norm, 1.0, abs_tol=1e-4):
                raise ValueError("Embedding must be normalized and nonzero")
            with conn.transaction():
                # Lock consent during writing and recheck source after inference.
                consent = conn.execute("""
                    SELECT consent_to_matching FROM mentorship_preferences
                    WHERE profile_id = %s FOR UPDATE
                """, (profile_id,)).fetchone()
                if not consent or not consent[0]:
                    result = conn.execute("DELETE FROM profile_embeddings WHERE profile_id = %s", (profile_id,))
                    counts["removed"] += result.rowcount
                    continue
                current = read_profile(conn, profile_id)
                if current is None or source_hash(source_text(current)) != digest:
                    raise ValueError("Profile changed during inference; rerun the indexer")
                conn.execute("""
                    INSERT INTO profile_embeddings
                        (profile_id, embedding, model_name, source_hash, indexed_at)
                    VALUES (%s, %s::vector, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (profile_id) DO UPDATE SET
                        embedding = EXCLUDED.embedding, model_name = EXCLUDED.model_name,
                        source_hash = EXCLUDED.source_hash, indexed_at = EXCLUDED.indexed_at
                """, (profile_id, "[" + ",".join(map(str, vector)) + "]", MODEL_NAME, digest))
            counts["indexed"] += 1
        except Exception as exc:
            counts["failed"] += 1
            # Avoid logging personal text, credentials, or database exception details.
            logger.error("Profile indexing failed (%s)", type(exc).__name__)
            with conn.transaction():
                # A stale embedding must not survive failed refresh/validation.
                result = conn.execute("DELETE FROM profile_embeddings WHERE profile_id = %s", (profile_id,))
                counts["removed"] += result.rowcount
    with conn.transaction():
        result = conn.execute("""
            DELETE FROM profile_embeddings e WHERE NOT EXISTS (
                SELECT 1 FROM mentorship_preferences m
                WHERE m.profile_id = e.profile_id AND m.consent_to_matching)
        """)
        counts["removed"] += result.rowcount
    return dict(counts)
