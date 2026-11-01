from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime settings, read from backend/.env by default."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    groq_api_key: str | None = Field(default=None, validation_alias="GROQ_API_KEY")
    nvidia_nim_api_key: str | None = Field(default=None, validation_alias="NVIDIA_NIM_API_KEY")
    database_path: Path = Field(default=Path("./notebook.db"), validation_alias="DATABASE_PATH")
    upload_dir: Path = Field(default=Path("./uploads"), validation_alias="UPLOAD_DIR")
    cors_origins: str = Field(default="http://localhost:3000", validation_alias="CORS_ORIGINS")

    @field_validator("database_path", "upload_dir")
    @classmethod
    def resolve_backend_relative_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else BACKEND_DIR / value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
