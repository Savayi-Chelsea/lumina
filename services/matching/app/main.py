from fastapi import FastAPI

app = FastAPI(
    title="Lumina Matching Service",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "matching"
    }