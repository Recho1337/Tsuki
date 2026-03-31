"""
Tsuki - Configuration
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    anime_user: str = "admin"
    anime_pass: str = "admin"
    download_folder: str = "/app/downloads"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours
    cors_origins: list[str] = ["*"]
    redis_url: str = "redis://localhost:6379/0"
    # "sqlite" (default) or a postgres URL like "postgresql://user:pass@host/db"
    database_url: str = "sqlite"

    @property
    def db_is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    class Config:
        env_prefix = ""
        env_file = ".env"


settings = Settings()
