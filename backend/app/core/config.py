
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
        "http://localhost:8081",
    ]

    # Hosts the API answers to (Host header). ["*"] allows any; set your
    # domain(s) in production, e.g. ["api.cyc.org"].
    allowed_hosts: list[str] = ["*"]
    # Show /docs and /openapi.json. Off by default in production.
    enable_docs: bool | None = None
    # Largest JSON request body. Files go straight to storage, not the API.
    max_request_bytes: int = 1024 * 1024

    # Sign-in protection
    rate_limit_enabled: bool = True

    # Shared rate-limit storage (Render Valkey / Redis-compatible).
    # Empty uses in-memory storage for local development and tests.
    redis_url: str = ""

    # Wrong passwords in a row before the account is locked for a while.
    login_max_failures: int = 5

    login_lock_minutes: int = 15
    # New email sign-ups confirm a 6-digit code before they can sign in.
    require_email_verification: bool = True
    # Admins must use two-step sign-in (an authenticator app code).
    require_admin_mfa: bool = True
    # Name shown in authenticator apps.
    mfa_issuer: str = "CYC"
    # Google sign-in: the OAuth client IDs whose ID tokens are accepted
    # (web, iOS and Android clients). Empty turns Google sign-in off.
    google_client_ids: list[str] = []
    # Links in emails (certificate check, app). Your website or app link.
    public_app_url: str = "https://cyc.org"

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
    # Largest course lesson video, and lesson notes PDF.
    course_video_max_upload_bytes: int = 2 * 1024 * 1024 * 1024
    course_notes_max_upload_bytes: int = 50 * 1024 * 1024
    # CloudFront in front of the private bucket. "none" serves files with
    # S3 presigned links; "cloudfront" with CloudFront signed URLs.
    cdn_provider: str = "none"
    # e.g. d1234abcd.cloudfront.net or media.cyc.org
    cloudfront_domain: str = ""
    # The public key ID from the CloudFront key group.
    cloudfront_key_id: str = ""
    # The matching private key (PEM). Either the text (\n for line breaks)
    # or a path to the .pem file.
    cloudfront_private_key: str = ""
    cloudfront_private_key_path: str = ""
    # How long a signed media link works. Long enough to watch a full video.
    cloudfront_url_ttl_seconds: int = 4 * 60 * 60

    # Push notifications: "fake" (development and tests), "none" or "expo"
    # (Expo Push Service, for the Expo mobile app). Other providers plug in
    # through app/services/push_provider.py.
    push_provider: str = "fake"
    # Optional: only needed if "enhanced push security" is on in Expo.
    expo_access_token: str | None = None
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    # Notification emails: "fake" (development and tests), "none" or "smtp".
    email_backend: str = "fake"
    email_from: str = "The Light App <no-reply@thelightapp.invalid>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    # "starttls" (port 587), "ssl" (port 465) or "none".
    smtp_security: str = "starttls"
    smtp_timeout_seconds: int = 10
    # The notification worker (python -m app.workers.notifications).
    notification_worker_interval_seconds: int = 15
    # Push and email jobs are retried with growing waits, then marked failed.
    notification_max_attempts: int = 5
    # Notifications older than this are deleted by the worker.
    notification_retention_days: int = 90
    # How long before an event starts people with a spot are reminded.
    event_reminder_minutes_before: int = 60

    # Languages the API writes notifications and emails in (each needs a
    # catalog in app/i18n). Everyone else gets DEFAULT_LANGUAGE.
    supported_languages: list[str] = ["en", "fr", "es", "pt"]
    default_language: str = "en"

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

        for name in (
            "notification_worker_interval_seconds",
            "notification_max_attempts",
            "notification_retention_days",
            "event_reminder_minutes_before",
            "smtp_timeout_seconds",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name.upper()} must be positive")

        if self.smtp_security not in {"starttls", "ssl", "none"}:
            raise ValueError("SMTP_SECURITY must be starttls, ssl or none")

        if self.email_backend not in {"fake", "none", "smtp"}:
            raise ValueError("EMAIL_BACKEND must be fake, none or smtp")

        if self.email_backend == "smtp":
            if not self.smtp_host.strip():
                raise ValueError(
                    "SMTP_HOST is required when EMAIL_BACKEND=smtp"
                )

            if not self.smtp_username.strip():
                raise ValueError(
                    "SMTP_USERNAME is required when EMAIL_BACKEND=smtp"
                )

            if not self.smtp_password.strip():
                raise ValueError(
                    "SMTP_PASSWORD is required when EMAIL_BACKEND=smtp"
                )

            if not 1 <= self.smtp_port <= 65535:
                raise ValueError(
                    "SMTP_PORT must be between 1 and 65535"
                )

            if self.email_from.endswith(".invalid>"):
                raise ValueError(
                    "EMAIL_FROM must be a real sender address "
                    "when EMAIL_BACKEND=smtp"
                )

        if self.default_language not in self.supported_languages:
            raise ValueError("DEFAULT_LANGUAGE must be one of SUPPORTED_LANGUAGES")

        if self.cdn_provider not in {"none", "cloudfront"}:
            raise ValueError("CDN_PROVIDER must be none or cloudfront")

        if self.cdn_provider == "cloudfront" and not (
            self.cloudfront_domain
            and self.cloudfront_key_id
            and (self.cloudfront_private_key or self.cloudfront_private_key_path)
        ):
            raise ValueError(
                "CDN_PROVIDER=cloudfront needs CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_ID "
                "and CLOUDFRONT_PRIVATE_KEY (or CLOUDFRONT_PRIVATE_KEY_PATH)"
            )

        for name in ("login_max_failures", "login_lock_minutes", "max_request_bytes", "cloudfront_url_ttl_seconds"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name.upper()} must be positive")

        if self.storage_backend == "s3" and not self.storage_bucket:
            raise ValueError("STORAGE_BUCKET is required when STORAGE_BACKEND=s3")

        if self.environment.lower() in {"production", "prod"}:
            if self.video_provider == "fake":
                raise ValueError(
                    "VIDEO_PROVIDER=fake is for development only; "
                    "choose a real provider or none in production"
                )

            if self.push_provider == "fake":
                raise ValueError(
                    "PUSH_PROVIDER=fake is for development only; "
                    "choose a real provider or none in production"
                )

            if self.email_backend == "fake":
                raise ValueError(
                    "EMAIL_BACKEND=fake is for development only; "
                    "use smtp or none in production"
                )

            if "*" in self.cors_origins:
                raise ValueError("CORS_ORIGINS can't be * in production")

            if not self.rate_limit_enabled:
                raise ValueError("RATE_LIMIT_ENABLED must stay on in production")
            if not self.redis_url:
                raise ValueError("REDIS_URL is required for shared rate limiting in production")

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

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def docs_enabled(self) -> bool:
        return (not self.is_production) if self.enable_docs is None else self.enable_docs

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
