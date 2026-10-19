
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "The Light App API"
    app_version: str = "0.1.0"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    avatar_max_upload_bytes: int = 5 * 1024 * 1024

    database_url: str = "sqlite:///./the_light_app.db"

    # Authentication configuration
    secret_key: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Request security
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # Video provider for meetings and livestreams. "fake" is a built-in
    # stand-in for development and tests (it signs its own join tokens and
    # webhooks); "none" turns video off. Real providers plug in through
    # app/services/video_provider.py.
    video_provider: str = "fake"
    video_server_url: str = "wss://video.local.invalid"
    # Join tokens are short-lived: a client asks for a new one to rejoin.
    video_token_ttl_seconds: int = 600
    # Shared secret the provider signs webhooks with.
    video_webhook_secret: str = ""

    # Object storage (S3, Cloudflare R2, MinIO, DigitalOcean Spaces, ...).
    # "none" turns uploads and replays off; "s3" uses the settings below.
    storage_backend: str = "none"
    storage_bucket: str = ""
    storage_region: str = "us-east-1"
    # Leave empty for AWS; set for R2, MinIO, Spaces and other S3 services.
    storage_endpoint_url: str = ""
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    # CDN (or public bucket) base URL for public files such as avatars,
    # e.g. https://cdn.example.com. Empty means the bucket's own URL.
    storage_public_base_url: str = ""
    # How long presigned upload and download links stay valid.
    storage_presign_ttl_seconds: int = 900
    # Largest audio, video or document file for the resource library.
    resource_max_upload_bytes: int = 500 * 1024 * 1024

    @model_validator(mode="after")
    def validate_security_settings(self):
        if self.access_token_expire_minutes <= 0:
            raise ValueError(
                "ACCESS_TOKEN_EXPIRE_MINUTES must be positive"
            )

        if self.refresh_token_expire_days <= 0:
            raise ValueError(
                "REFRESH_TOKEN_EXPIRE_DAYS must be positive"
            )

        if self.video_token_ttl_seconds <= 0:
            raise ValueError("VIDEO_TOKEN_TTL_SECONDS must be positive")

        if self.storage_presign_ttl_seconds <= 0:
            raise ValueError("STORAGE_PRESIGN_TTL_SECONDS must be positive")

        if self.resource_max_upload_bytes <= 0:
            raise ValueError("RESOURCE_MAX_UPLOAD_BYTES must be positive")

        if self.storage_backend == "s3" and not self.storage_bucket:
            raise ValueError("STORAGE_BUCKET is required when STORAGE_BACKEND=s3")

        if self.environment.lower() in {"production", "prod"}:
            if self.video_provider == "fake":
                raise ValueError(
                    "VIDEO_PROVIDER=fake is for development only; "
                    "choose a real provider or none in production"
                )

            if len(self.secret_key) < 32:
                raise ValueError(
                    "SECRET_KEY must contain at least 32 characters "
                    "in production"
                )

            if self.secret_key.startswith("replace-with-"):
                raise ValueError(
                    "Replace the placeholder SECRET_KEY before "
                    "running in production"
                )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
