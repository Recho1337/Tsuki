"""
Library API router
"""
import json
import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from jose import JWTError, jwt

from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/library", tags=["library"])


def _verify_token(token: Optional[str] = None):
    """Verify a JWT passed as a query param (for video/file endpoints)."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if not payload.get("sub"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# Only show actual video/media files
MEDIA_EXTENSIONS = {".mp4", ".mkv", ".avi", ".webm", ".m4v", ".mov", ".ts", ".flv"}


def _is_media_file(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in MEDIA_EXTENSIONS


def _read_metadata(anime_path: str) -> dict:
    """Read .metadata.json from an anime folder, or return empty dict."""
    meta_path = os.path.join(anime_path, ".metadata.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _is_temp_file(filename: str) -> bool:
    """Detect yt-dlp temp/partial files: _temp.mp4, .temp.mp4, .part, .temp etc."""
    lower = filename.lower()
    if lower.endswith(".temp") or lower.endswith(".part"):
        return True
    # yt-dlp patterns: file_temp.mp4, file.temp.mp4
    name_no_ext = os.path.splitext(lower)[0]
    if name_no_ext.endswith("_temp") or name_no_ext.endswith(".temp"):
        return True
    return False


def collect_media_files(base_path: str) -> list[dict]:
    media_files = []
    for root, _, files in os.walk(base_path):
        for file in files:
            if not _is_media_file(file):
                continue
            if _is_temp_file(file):
                continue
            file_path = os.path.join(root, file)
            if not os.path.isfile(file_path):
                continue
            relative_path = os.path.relpath(file_path, base_path).replace(os.sep, "/")
            media_files.append({"absolute_path": file_path, "relative_path": relative_path})
    media_files.sort(key=lambda item: item["relative_path"])
    return media_files


def _scan_category(dl: str, category: str) -> list[dict]:
    """Scan a category folder (tvshows or films) and return library items."""
    cat_path = os.path.join(dl, category)
    items = []
    if not os.path.exists(cat_path):
        return items
    for anime_dir in os.listdir(cat_path):
        anime_path = os.path.join(cat_path, anime_dir)
        if not os.path.isdir(anime_path):
            continue
        media_files = collect_media_files(anime_path)
        file_count = len(media_files)
        total_size = sum(os.path.getsize(f["absolute_path"]) for f in media_files)
        seasons = sorted({
            f["relative_path"].split("/", 1)[0]
            for f in media_files
            if "/" in f["relative_path"]
        })
        metadata = _read_metadata(anime_path)
        media_type = "film" if category == "films" else "tv"
        items.append({
            "name": anime_dir,
            "path": f"{category}/{anime_dir}",
            "total_files": file_count,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "seasons": seasons,
            "media_type": metadata.get("media_type", media_type),
            "image_url": metadata.get("image_url", ""),
            "url": metadata.get("url", ""),
        })
    return items


@router.get("/list")
def list_library(_user: str = Depends(get_current_user)):
    try:
        dl = settings.download_folder
        library = []
        # Scan structured dirs
        library.extend(_scan_category(dl, "tvshows"))
        library.extend(_scan_category(dl, "films"))
        # Also scan root for legacy/unorganized downloads
        if os.path.exists(dl):
            for anime_dir in os.listdir(dl):
                if anime_dir in ("tvshows", "films"):
                    continue
                anime_path = os.path.join(dl, anime_dir)
                if not os.path.isdir(anime_path):
                    continue
                media_files = collect_media_files(anime_path)
                file_count = len(media_files)
                if file_count == 0:
                    continue
                total_size = sum(os.path.getsize(f["absolute_path"]) for f in media_files)
                seasons = sorted({
                    f["relative_path"].split("/", 1)[0]
                    for f in media_files
                    if "/" in f["relative_path"]
                })
                metadata = _read_metadata(anime_path)
                detected_type = metadata.get("media_type", "")
                if not detected_type:
                    detected_type = "film" if file_count <= 1 and len(seasons) == 0 else "tv"
                library.append({
                    "name": anime_dir,
                    "path": anime_dir,
                    "total_files": file_count,
                    "total_size_mb": round(total_size / (1024 * 1024), 2),
                    "seasons": seasons,
                    "media_type": detected_type,
                    "image_url": metadata.get("image_url", ""),
                    "url": metadata.get("url", ""),
                })
        library.sort(key=lambda x: x["name"])
        return library
    except Exception as e:
        return {"error": str(e)}


@router.get("/anime/{anime_path:path}")
def get_anime_files(anime_path: str, _user: str = Depends(get_current_user)):
    try:
        full_path = os.path.join(settings.download_folder, anime_path)
        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            return {"error": "Anime not found"}

        files = []
        for mf in collect_media_files(full_path):
            fp = mf["absolute_path"]
            size = os.path.getsize(fp)
            rel = mf["relative_path"]
            season_folder = rel.split("/", 1)[0] if "/" in rel else None
            files.append({
                "name": os.path.basename(fp),
                "relative_path": rel,
                "season_folder": season_folder,
                "size": size,
                "size_mb": round(size / (1024 * 1024), 2),
                "size_gb": round(size / (1024 * 1024 * 1024), 2),
                "modified": datetime.fromtimestamp(os.path.getmtime(fp)).isoformat(),
            })

        return {
            "anime_name": anime_path.split("/")[-1],
            "anime_path": anime_path,
            "files": files,
            "total_files": len(files),
            "total_size_mb": round(sum(f["size"] for f in files) / (1024 * 1024), 2),
            "metadata": _read_metadata(full_path),
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/stream/{relative_path:path}")
def stream_file(relative_path: str, request: Request, token: Optional[str] = Query(None)):
    _verify_token(token)
    """Stream a video file with range request support for in-browser playback."""
    filepath = os.path.abspath(os.path.join(settings.download_folder, relative_path))
    download_root = os.path.abspath(settings.download_folder)

    if not filepath.startswith(download_root + os.sep):
        return {"error": "Invalid file path"}
    if not os.path.isfile(filepath):
        return {"error": f"File not found: {relative_path}"}

    file_size = os.path.getsize(filepath)
    range_header = request.headers.get("range")

    if range_header:
        # Parse "bytes=start-end"
        range_spec = range_header.replace("bytes=", "").strip()
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        def iter_range():
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            },
        )

    # No range header — full file
    return FileResponse(filepath, media_type="video/mp4")


@router.get("/file/{relative_path:path}")
def download_file(relative_path: str, token: Optional[str] = Query(None)):
    _verify_token(token)
    filepath = os.path.abspath(os.path.join(settings.download_folder, relative_path))
    download_root = os.path.abspath(settings.download_folder)

    if not filepath.startswith(download_root + os.sep):
        return {"error": "Invalid file path"}

    if os.path.isfile(filepath):
        return FileResponse(filepath, filename=os.path.basename(filepath), media_type="video/mp4")

    return {"error": f"File not found: {relative_path}"}


@router.delete("/file/{relative_path:path}")
def delete_file(relative_path: str, _user: str = Depends(get_current_user)):
    """Delete a single media file."""
    filepath = os.path.abspath(os.path.join(settings.download_folder, relative_path))
    download_root = os.path.abspath(settings.download_folder)

    if not filepath.startswith(download_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    os.remove(filepath)

    # Clean up empty parent directories up to the download root
    parent = os.path.dirname(filepath)
    while parent != download_root and os.path.isdir(parent):
        if not os.listdir(parent):
            os.rmdir(parent)
            parent = os.path.dirname(parent)
        else:
            break

    return {"message": f"Deleted {relative_path}"}


@router.delete("/anime/{anime_path:path}")
def delete_anime(anime_path: str, _user: str = Depends(get_current_user)):
    """Delete an entire anime directory and all its contents."""
    full_path = os.path.abspath(os.path.join(settings.download_folder, anime_path))
    download_root = os.path.abspath(settings.download_folder)

    if not full_path.startswith(download_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.isdir(full_path):
        raise HTTPException(status_code=404, detail="Directory not found")

    shutil.rmtree(full_path)
    return {"message": f"Deleted {anime_path}"}
