
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

        if self.environment.lower() in {"production", "prod"}:
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
