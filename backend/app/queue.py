"""
Redis-backed job queue.

The backend pushes job IDs here; the worker pops them.
"""
import redis
from typing import List
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


def get_queue_order() -> List[int]:
    """Return the current ordered list of job IDs in the queue."""
    r = get_redis()
    return [int(x) for x in r.lrange(QUEUE_KEY, 0, -1)]


def set_queue_order(job_ids: List[int]):
    """Replace the queue with the given ordered list of job IDs."""
    r = get_redis()
    pipe = r.pipeline()
    pipe.delete(QUEUE_KEY)
    if job_ids:
        pipe.rpush(QUEUE_KEY, *[str(jid) for jid in job_ids])
    pipe.execute()
