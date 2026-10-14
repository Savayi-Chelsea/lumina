import logging
from threading import Lock

from fastapi import Depends, FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import psycopg

from .config import database_dsn, get_settings
from .indexing import BGEEncoder, EmbeddingInputTooLong
from .search import SearchRequest, SearchResponse, search_mentors

logger = logging.getLogger(__name__)
_encoder = None
_model_lock = Lock()
_inference_lock = Lock()


def search_settings():
    try:
        return get_settings()
    except ValueError:
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
    errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.post("/mentors/search", response_model=SearchResponse)
def mentor_search(
    request: SearchRequest,
    settings=Depends(search_settings),
):
    try:
        encoder = query_encoder()
        with psycopg.connect(database_dsn(), autocommit=True) as conn:
            with _inference_lock:
                return search_mentors(conn, encoder, request, settings)
    except EmbeddingInputTooLong:
        raise HTTPException(status_code=422, detail="Query exceeds the model token limit") from None
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Mentor search unavailable (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Mentor search temporarily unavailable") from None


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "matching"
    }
