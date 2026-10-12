
from fastapi import FastAPI

app = FastAPI(
    title="The Light App API",
    description="Backend API for the CYC Christian community platform.",
    version="0.1.0",
)


@app.get("/health", tags=["Health"])
def health_check():
    """Return the API health status."""
    return {"status": "ok"}
