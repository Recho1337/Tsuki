"""
Redis-backed job queue.

The backend pushes job IDs here; the worker pops them.
"""
import redis
from app.config import settings

QUEUE_KEY = "animekai:download_jobs"

def get_redis() -> redis.Redis:
    """Return a sync Redis client."""
    return redis.from_url(settings.redis_url, decode_responses=True)


def enqueue_job(job_id: int):
    """Push a job ID onto the queue (called by the backend API)."""
    r = get_redis()
    r.rpush(QUEUE_KEY, str(job_id))


def dequeue_job(timeout: int = 5) -> int | None:
    """Block-pop the next job ID (called by the worker). Returns None on timeout."""
    r = get_redis()
    result = r.blpop(QUEUE_KEY, timeout=timeout)
    if result:
        _, job_id_str = result
        return int(job_id_str)
    return None
