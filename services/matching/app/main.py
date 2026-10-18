import logging
from threading import Lock

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import psycopg
from pydantic import BaseModel
from typing import Literal

from .config import database_dsn, get_settings
from .indexing import BGEEncoder, EmbeddingInputTooLong
from .search import EmbeddingUnavailable, SearchRequest, SearchResponse, check_search_database, search_mentors

logger = logging.getLogger(__name__)
_encoder = None
_model_lock = Lock()
_inference_lock = Lock()
_model_healthy = True


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    service: Literal["matching"] = "matching"


def search_settings():
    try:
        return get_settings()
    except ValueError as exc:
        logger.error("Search configuration unavailable (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Search configuration is invalid") from None


def query_encoder():
    global _encoder
    with _model_lock:
        if _encoder is None:
            try:
                _encoder = BGEEncoder()
            except Exception as exc:
                logger.error("Embedding model unavailable (%s)", type(exc).__name__)
                raise HTTPException(status_code=503, detail="Embedding model unavailable") from None
    return _encoder


app = FastAPI(
    title="Lumina Matching Service",
    version="0.1.0",
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    # Do not echo a user's raw mentorship query back through validation errors.
    # Unknown field names are also user input, so never echo them in locations.
    fields = set(SearchRequest.model_fields)
    errors = [{"loc": [part if part in fields or part == "body" or isinstance(part, int)
                        else "field" for part in e["loc"]],
               "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc):
    logger.error("Unhandled matching service failure (%s)", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "Mentor search temporarily unavailable"})


@app.post("/mentors/search", response_model=SearchResponse)
def mentor_search(
    request: SearchRequest,
    settings=Depends(search_settings),
):
    global _model_healthy
    try:
        encoder = query_encoder()
        with psycopg.connect(database_dsn(), autocommit=True) as conn:
            with _inference_lock:
                try:
                    result = search_mentors(conn, encoder, request, settings)
                except EmbeddingUnavailable:
                    _model_healthy = False
                    raise
                _model_healthy = True
                return result
    except EmbeddingInputTooLong:
        raise HTTPException(status_code=422, detail="Query exceeds the model token limit") from None
    except HTTPException:
        raise
    except EmbeddingUnavailable as exc:
        logger.error("Embedding inference unavailable (%s)", type(exc.__cause__ or exc).__name__)
        raise HTTPException(status_code=503, detail="Embedding model unavailable") from None
    except Exception as exc:
        logger.error("Mentor search unavailable (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Mentor search temporarily unavailable") from None


@app.get("/ready", response_model=ReadinessResponse,
         responses={503: {"model": ReadinessResponse}})
def readiness_check():
    try:
        search_settings()
        with psycopg.connect(database_dsn(), autocommit=True) as conn:
            conn.execute("SET statement_timeout = '3s'")
            check_search_database(conn)
        query_encoder()
        if not _model_healthy:
            raise EmbeddingUnavailable()
    except Exception as exc:
        logger.error("Matching service not ready (%s)", type(exc).__name__)
        return JSONResponse(status_code=503, content=ReadinessResponse(status="not_ready").model_dump())
    return ReadinessResponse(status="ready")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "matching"
    }
