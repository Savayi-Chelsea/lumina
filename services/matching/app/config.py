"""Local configuration shared by search dependencies."""

from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv
from psycopg.conninfo import make_conninfo
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[3]


class SearchSettings(BaseModel):
    top_k: int = Field(default=5, ge=1, le=50)
    similarity_threshold: float = Field(default=0.5, ge=-1, le=1, allow_inf_nan=False)


@lru_cache(maxsize=1)
def get_settings():
    load_dotenv(ROOT / ".env", override=False)
    return SearchSettings(
        top_k=os.getenv("MATCHING_TOP_K", "5"),
        similarity_threshold=os.getenv("MATCHING_SIMILARITY_THRESHOLD", "0.5"),
    )


def database_dsn():
    load_dotenv(ROOT / ".env", override=False)
    if url := os.getenv("DATABASE_URL"):
        return make_conninfo(url, connect_timeout=10)
    required = ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")
    if any(not os.getenv(key) for key in required):
        raise ValueError("Missing database configuration")
    return make_conninfo(
        host=os.getenv("POSTGRES_HOST", "localhost"), port=os.getenv("POSTGRES_PORT", "5432"),
        user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"], connect_timeout=10,
    )
