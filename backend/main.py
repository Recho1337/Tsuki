"""
Tsuki - Anime Download Manager (FastAPI Backend)
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routes import auth, download, library, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.download_folder, exist_ok=True)
    await init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Tsuki", version="2.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(search.router)
    app.include_router(download.router)
    app.include_router(library.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/health/services")
    async def health_services():
        import json as _json
        from datetime import datetime as _dt
        from app.queue import get_redis

        services = {
            "backend": {"name": "Backend API", "status": "online", "detail": "Responding"},
            "redis": {"name": "Redis", "status": "offline", "detail": "Not reachable"},
            "worker": {"name": "Download Worker", "status": "offline", "detail": "No heartbeat"},
            "database": {"name": "Database (SQLite)", "status": "offline", "detail": "Not reachable"},
        }

        # Check Redis
        try:
            r = get_redis()
            r.ping()
            services["redis"]["status"] = "online"
            services["redis"]["detail"] = settings.redis_url
        except Exception as e:
            services["redis"]["detail"] = str(e)

        # Check worker heartbeat via Redis
        try:
            r = get_redis()
            raw = r.get("animekai:worker:heartbeat")
            if raw:
                hb = _json.loads(raw)
                ts = _dt.fromisoformat(hb["ts"])
                age = (_dt.now() - ts).total_seconds()
                if age < 20:
                    services["worker"]["status"] = "online"
                    services["worker"]["detail"] = hb.get("status", "idle")
                else:
                    services["worker"]["detail"] = f"Last seen {int(age)}s ago"
            else:
                services["worker"]["detail"] = "Never started"
        except Exception:
            pass

        # Check SQLite/Postgres DB
        try:
            from app.database import check_db
            detail = await check_db()
            services["database"]["status"] = "online"
            services["database"]["detail"] = detail
            services["database"]["name"] = "Database (PostgreSQL)" if settings.db_is_postgres else "Database (SQLite)"
        except Exception as e:
            services["database"]["detail"] = str(e)

        return services

    return app


app = create_app()
