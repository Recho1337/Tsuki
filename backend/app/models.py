"""
Data Models - Pydantic schemas and in-memory job state
"""
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


# --- Request Schemas ---

class LoginRequest(BaseModel):
    username: str
    password: str


class AnimeInfoRequest(BaseModel):
    anime_url: str


class DownloadStartRequest(BaseModel):
    anime_url: str
    media_type: str = "tv"  # "tv" or "film"
    download_mode: str = "All Episodes"
    single_episode: str = "1"
    start_episode: str = "1"
    end_episode: str = "1"
    prefer_type: str = "Soft Sub"
    prefer_server: str = "Server 1"
    download_method: str = "yt-dlp"
    max_retries: int = 7
    timeout: int = 300
    max_workers: int = 15
    merge_episodes: bool = False
    season_number: int = 0
    keep_individual_files: bool = False
    image_url: str = ""


# --- Internal State ---

class DownloadJob:
    """Represents a download job with progress tracking."""

    def __init__(self, job_id: int, anime_url: str, config: dict):
        self.job_id = job_id
        self.anime_url = anime_url
        self.config = config
        self.status = "initializing"
        self.progress = 0
        self.current_episode: Optional[str] = None
        self.total_episodes = 0
        self.completed_episodes = 0
        self.logs: list[dict] = []
        self.error: Optional[str] = None
        self.downloaded_files: list[str] = []
        self.merged_file: Optional[str] = None
        self.start_time = datetime.now()
        self.end_time: Optional[datetime] = None
        self.anime_title: Optional[str] = None
        self.season: Optional[int] = None

    def add_log(self, level: str, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append({"timestamp": timestamp, "level": level, "message": message})
        if len(self.logs) > 100:
            self.logs = self.logs[-100:]

    def to_dict(self) -> dict:
        elapsed = None
        if self.end_time:
            elapsed = (self.end_time - self.start_time).total_seconds()
        elif self.start_time:
            elapsed = (datetime.now() - self.start_time).total_seconds()

        return {
            "job_id": self.job_id,
            "anime_url": self.anime_url,
            "anime_title": self.anime_title,
            "season": self.season,
            "status": self.status,
            "progress": self.progress,
            "current_episode": self.current_episode,
            "total_episodes": self.total_episodes,
            "completed_episodes": self.completed_episodes,
            "logs": self.logs[-20:],
            "error": self.error,
            "downloaded_files": self.downloaded_files,
            "merged_file": self.merged_file,
            "elapsed_seconds": int(elapsed) if elapsed else None,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
        }
