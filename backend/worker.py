"""
Tsuki Download Worker

Standalone process that pulls job IDs from Redis and executes downloads.
Shares the app/ package with the backend for DB access, downloader, config.

Usage:
    python worker.py
"""
import asyncio
import json
import os
import signal
import sys
import traceback
from datetime import datetime

from app.config import settings
from app.database import get_job, init_db, update_job
from app.downloader import AnimeDownloader
from app.queue import dequeue_job, get_redis

# Graceful shutdown
_shutdown = False


def _handle_signal(sig, frame):
    global _shutdown
    print(f"[worker] Received signal {sig}, shutting down after current job...")
    _shutdown = True


signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)


# ---------- helpers (sync wrappers around async DB) ----------

# Single persistent event loop for the entire worker process.
# asyncpg pools bind to the loop they were created on, so we must
# reuse the same loop for every call.
_loop = asyncio.new_event_loop()


def _sync(coro):
    """Run an async coroutine from sync code using the persistent loop."""
    return _loop.run_until_complete(coro)


def _update(job_id: int, **fields):
    _sync(update_job(job_id, **fields))


def _log(job_id: int, level: str, msg: str, logs: list) -> list:
    timestamp = datetime.now().strftime("%H:%M:%S")
    logs.append({"timestamp": timestamp, "level": level, "message": msg})
    if len(logs) > 100:
        logs = logs[-100:]
    _update(job_id, logs=logs)
    return logs


def _save_metadata(anime_dir: str, data: dict):
    meta_path = os.path.join(anime_dir, ".metadata.json")
    existing = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                existing = json.load(f)
        except Exception:
            pass
    for k, v in data.items():
        if v or k not in existing:
            existing[k] = v
    with open(meta_path, "w") as f:
        json.dump(existing, f, indent=2)


# ---------- main download logic ----------

def run_download(job_id: int):
    """Execute a single download job, updating the DB along the way."""
    job = _sync(get_job(job_id))
    if not job:
        print(f"[worker] Job {job_id} not found in DB, skipping")
        return

    config = job["config"]
    download_folder = settings.download_folder
    logs: list = []

    try:
        downloader = AnimeDownloader(config={
            "download_method": config.get("download_method", "yt-dlp"),
            "max_retries": config.get("max_retries", 7),
            "timeout": config.get("timeout", 300),
            "max_workers": config.get("max_workers", 15),
        })

        _update(job_id, status="fetching_info")
        logs = _log(job_id, "INFO", f"Fetching anime details from {config['anime_url']}", logs)

        anime_id, anime_title = downloader.get_anime_details(config["anime_url"])
        if not anime_id:
            raise Exception("Could not extract anime ID from URL")
        logs = _log(job_id, "INFO", f"Found anime: {anime_title}", logs)

        detected_season = downloader.detect_season_from_title(anime_title)
        season = config.get("season_number", 0)
        if season == 0:
            season = detected_season
        logs = _log(job_id, "INFO", f"Season: {season}", logs)

        _update(job_id, anime_title=anime_title, season=season, status="fetching_episodes")

        episodes = downloader.get_episode_list(anime_id)
        if not episodes:
            raise Exception("No episodes found")
        logs = _log(job_id, "INFO", f"Found {len(episodes)} episodes", logs)

        # Filter episode selection
        download_mode = config.get("download_mode", "All Episodes")
        if download_mode == "Single Episode":
            single_ep = config.get("single_episode", "1")
            selected = [ep for ep in episodes if ep["id"] == single_ep]
        elif download_mode == "Episode Range":
            start_ep = config.get("start_episode", "1")
            end_ep = config.get("end_episode", "1")
            start_key = downloader.safe_episode_key(start_ep)
            end_key = downloader.safe_episode_key(end_ep)
            selected = [
                ep for ep in episodes
                if start_key <= downloader.safe_episode_key(ep["id"]) <= end_key
            ]
        else:
            selected = episodes

        if not selected:
            raise Exception("No episodes match your selection")

        total = len(selected)
        _update(job_id, total_episodes=total, status="downloading")
        logs = _log(job_id, "INFO", f"Will download {total} episode(s)", logs)

        media_type = config.get("media_type", "tv")
        type_folder = "films" if media_type == "film" else "tvshows"
        base_dir = os.path.join(download_folder, type_folder)
        anime_dir = os.path.join(base_dir, downloader.generate_anime_folder_name(anime_title))

        if media_type == "film":
            # Films: anime_dir/Film Name.mp4 (no Season subfolder)
            output_dir = anime_dir
        else:
            # TV: anime_dir/Season XX/
            output_dir = os.path.join(anime_dir, downloader.generate_season_folder_name(season))

        os.makedirs(output_dir, exist_ok=True)

        _save_metadata(anime_dir, {
            "title": anime_title,
            "url": config["anime_url"],
            "image_url": config.get("image_url", ""),
            "media_type": media_type,
            "season": season,
            "total_episodes": total,
        })

        downloaded_files: list[str] = []
        completed = 0
        prefer_type = config.get("prefer_type", "Soft Sub")
        prefer_server = config.get("prefer_server", "Server 1")

        # Real-time progress: blends per-episode completion with intra-episode yt-dlp %
        _last_reported = [0]

        def _on_ytdlp_progress(pct: float):
            """Called by downloader with yt-dlp download % (0-100)."""
            base = (completed / total) * 100
            per_ep = 100.0 / total
            blended = int(base + (pct / 100.0) * per_ep)
            blended = max(0, min(blended, 99))  # never hit 100 until truly done
            if blended - _last_reported[0] >= 2:  # throttle: update every 2%
                _last_reported[0] = blended
                _update(job_id, progress=blended)

        downloader.progress_callback = _on_ytdlp_progress

        for idx, ep in enumerate(selected, 1):
            if _shutdown:
                raise Exception("Worker shutting down — job interrupted")

            ep_id = ep["id"]
            _update(job_id, current_episode=ep_id)
            logs = _log(job_id, "INFO", f"Processing episode {ep_id} ({idx}/{total})", logs)

            servers = downloader.get_video_servers(ep["token"])
            if not servers:
                logs = _log(job_id, "ERROR", f"No servers available for episode {ep_id}", logs)
                continue

            server = downloader.choose_server(servers, prefer_type, prefer_server)
            if not server:
                logs = _log(job_id, "ERROR", f"Could not choose server for episode {ep_id}", logs)
                continue

            logs = _log(job_id, "INFO", f"Using server: {server['server_name']}", logs)

            video_data = downloader.get_video_data(server["server_id"])
            if not video_data:
                logs = _log(job_id, "ERROR", f"Could not resolve video data for episode {ep_id}", logs)
                continue

            if media_type == "film":
                filename = downloader.generate_film_filename(anime_title)
            else:
                filename = downloader.generate_episode_filename(anime_title, season, ep_id, ep.get("title", ""))
            filepath = os.path.join(output_dir, filename)

            if downloader.download_episode(video_data, filepath, ep_id):
                rel = os.path.relpath(filepath, download_folder)
                downloaded_files.append(rel)
                completed += 1
                progress = int((completed / total) * 100)
                _update(
                    job_id,
                    completed_episodes=completed,
                    progress=progress,
                    downloaded_files=downloaded_files,
                )
                logs = _log(job_id, "INFO", f"Successfully downloaded episode {ep_id}", logs)
            else:
                logs = _log(job_id, "ERROR", f"Failed to download episode {ep_id}", logs)

        if completed < total and completed > 0:
            _update(
                job_id,
                status="failed",
                error=f"{total - completed} of {total} episodes failed to download",
                progress=int((completed / total) * 100),
                end_time=datetime.now().isoformat(),
                downloaded_files=downloaded_files,
            )
            logs = _log(job_id, "WARN", f"Partially completed: {completed}/{total} episodes", logs)
        elif completed == 0:
            raise Exception("All episodes failed to download")
        else:
            # Merge if requested
            merge_episodes = config.get("merge_episodes", False)
            abs_files = [os.path.join(download_folder, f) for f in downloaded_files]
            if merge_episodes and len(abs_files) > 1:
                _update(job_id, status="merging")
                logs = _log(job_id, "INFO", f"Merging {len(abs_files)} episodes...", logs)

                merged_file = downloader.merge_videos(
                    abs_files, anime_title, season, selected[0]["id"], selected[-1]["id"]
                )
                if merged_file:
                    merged_rel = os.path.relpath(merged_file, download_folder)
                    _update(job_id, merged_file=merged_rel)
                    logs = _log(job_id, "INFO", f"Merged into {merged_rel}", logs)

                    if not config.get("keep_individual_files", False):
                        for f in abs_files:
                            try:
                                os.remove(f)
                            except Exception as e:
                                logs = _log(job_id, "WARN", f"Could not remove {f}: {e}", logs)
                        downloaded_files = [merged_rel]
                        _update(job_id, downloaded_files=downloaded_files)
                else:
                    logs = _log(job_id, "ERROR", "Merge failed", logs)

            _update(
                job_id,
                status="completed",
                progress=100,
                end_time=datetime.now().isoformat(),
                downloaded_files=downloaded_files,
            )
            logs = _log(job_id, "INFO", f"Download completed! {completed}/{total} episodes", logs)

    except Exception as e:
        _update(
            job_id,
            status="failed",
            error=str(e),
            end_time=datetime.now().isoformat(),
        )
        _log(job_id, "ERROR", f"Job failed: {e}", logs)
        _log(job_id, "ERROR", traceback.format_exc(), logs)


# ---------- main loop ----------

_worker_status = "idle"

def _heartbeat_loop(r):
    """Background thread that sends heartbeats every 5 seconds."""
    while not _shutdown:
        r.set("animekai:worker:heartbeat", json.dumps({
            "ts": datetime.now().isoformat(),
            "status": _worker_status,
            "pid": os.getpid(),
        }), ex=15)
        for _ in range(50):  # sleep 5s in 0.1s increments so shutdown is responsive
            if _shutdown:
                break
            import time; time.sleep(0.1)


def main():
    global _worker_status
    print("[worker] Starting Tsuki download worker...")
    os.makedirs(settings.download_folder, exist_ok=True)
    _sync(init_db())
    r = get_redis()
    print(f"[worker] Download folder: {settings.download_folder}")
    print(f"[worker] Redis: {settings.redis_url}")

    # Re-queue any jobs that were interrupted by a previous shutdown
    from app.routes.download import resume_interrupted_jobs
    _sync(resume_interrupted_jobs())
    print("[worker] Recovered any interrupted jobs")

    import threading
    hb_thread = threading.Thread(target=_heartbeat_loop, args=(r,), daemon=True)
    hb_thread.start()

    print("[worker] Waiting for jobs...")

    while not _shutdown:
        _worker_status = "idle"
        job_id = dequeue_job(timeout=5)
        if job_id is None:
            continue
        print(f"[worker] Picked up job {job_id}")
        _worker_status = f"processing:{job_id}"
        run_download(job_id)
        print(f"[worker] Finished job {job_id}")

    print("[worker] Shutdown complete.")


if __name__ == "__main__":
    main()
