"""
Download API router — queue-based.

The backend only writes to the DB and pushes job IDs to Redis.
The actual downloading happens in the separate worker process.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import (
    create_job,
    delete_job,
    get_interrupted_jobs,
    get_job,
    get_retryable_jobs,
    list_jobs,
    update_job,
)
from app.downloader import AnimeDownloader
from app.models import AnimeInfoRequest, DownloadStartRequest
from app.queue import enqueue_job

router = APIRouter(
    prefix="/api/download",
    tags=["download"],
    dependencies=[Depends(get_current_user)],
)



# ===================== resume on startup =====================


async def resume_interrupted_jobs():
    """Called during lifespan startup — re-queue any in-progress jobs."""
    interrupted = await get_interrupted_jobs()
    for job in interrupted:
        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", 3)
        if retry_count < max_retries:
            new_count = retry_count + 1
            await update_job(
                job["job_id"],
                status="initializing",
                progress=0,
                completed_episodes=0,
                current_episode=None,
                error=None,
                end_time=None,
                retry_count=new_count,
                start_time=datetime.now().isoformat(),
                logs=[],
                downloaded_files=[],
            )
            enqueue_job(job["job_id"])
        else:
            await update_job(
                job["job_id"],
                status="failed",
                error="Interrupted by server restart — max retries exhausted",
                end_time=datetime.now().isoformat(),
            )


# ===================== routes =====================


@router.post("/anime/info")
def get_anime_info(body: AnimeInfoRequest):
    try:
        downloader = AnimeDownloader()
        anime_id, anime_title = downloader.get_anime_details(body.anime_url)
        if not anime_id:
            return {"error": "Could not fetch anime information"}

        episodes = downloader.get_episode_list(anime_id)
        season = downloader.detect_season_from_title(anime_title)

        # Heuristic: single episode with no season indicator = film
        is_film = len(episodes) == 1 and season <= 1

        return {
            "anime_id": anime_id,
            "title": anime_title,
            "season": season,
            "total_episodes": len(episodes),
            "media_type": "film" if is_film else "tv",
            "episodes": [{"id": ep["id"], "title": ep["title"]} for ep in episodes],
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/start")
async def start_download(body: DownloadStartRequest):
    try:
        config = body.model_dump()
        job_id = await create_job(
            anime_url=body.anime_url,
            config=config,
            max_retries=3,
            media_type=body.media_type,
        )
        enqueue_job(job_id)
        return {"job_id": job_id, "message": "Download job queued"}
    except Exception as e:
        return {"error": str(e)}


@router.post("/retry/{job_id}")
async def retry_download(job_id: int):
    """Manually retry a failed job."""
    job = await get_job(job_id)
    if not job:
        return {"error": "Job not found"}
    if job["status"] != "failed":
        return {"error": "Only failed jobs can be retried"}
    if job.get("retry_count", 0) >= job.get("max_retries", 3):
        return {"error": "Maximum retries exhausted"}

    new_count = job.get("retry_count", 0) + 1
    await update_job(
        job_id,
        status="initializing",
        progress=0,
        completed_episodes=0,
        current_episode=None,
        error=None,
        end_time=None,
        retry_count=new_count,
        start_time=datetime.now().isoformat(),
        logs=[],
        downloaded_files=[],
    )
    enqueue_job(job_id)
    return {"job_id": job_id, "message": "Retry queued"}


@router.post("/recover")
async def recover_stuck_jobs():
    """Manually re-queue any jobs stuck in non-terminal states."""
    interrupted = await get_interrupted_jobs()
    recovered = 0
    for job in interrupted:
        retry_count = job.get("retry_count", 0)
        new_count = retry_count + 1
        await update_job(
            job["job_id"],
            status="initializing",
            progress=0,
            completed_episodes=0,
            current_episode=None,
            error=None,
            end_time=None,
            retry_count=new_count,
            start_time=datetime.now().isoformat(),
            logs=[],
            downloaded_files=[],
        )
        enqueue_job(job["job_id"])
        recovered += 1
    return {"recovered": recovered, "message": f"Re-queued {recovered} stuck job(s)"}


@router.get("/status/{job_id}")
async def get_download_status(job_id: int):
    job = await get_job(job_id)
    if not job:
        return {"error": "Job not found"}
    return job


@router.get("/list")
async def list_downloads():
    return await list_jobs()


@router.delete("/clear/{job_id}")
async def clear_download_job(job_id: int):
    deleted = await delete_job(job_id)
    if deleted:
        return {"message": "Job cleared"}
    return {"error": "Job not found or still active"}
