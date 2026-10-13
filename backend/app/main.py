
from fastapi import FastAPI

app = FastAPI(
    title="The Light App API",
    description="Backend API for the CYC Christian community platform.",
    version="0.1.0",
)


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Welcome to The Light App API",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Return the API health status."""
    return {
        "status": "healthy",
        "service": "the-light-app-api",
        "version": "0.1.0",
    }
