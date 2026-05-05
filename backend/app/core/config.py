from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BACKEND_")

    state_file: Path = Field(default=Path("data/app_state.json"))
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000"
    )

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


def get_settings() -> Settings:
    return Settings()
