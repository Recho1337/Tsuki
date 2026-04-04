# 月 Tsuki — Anime Download Manager

A modern, self-hosted anime download manager with a decoupled architecture. Search, download, and organise anime series and films through a clean web interface, with optional VPN integration for private downloads.

> **Inspired by** [Cinichi/Ani-Downloader](https://github.com/Cinichi/Ani-Downloader) — a Google Colab notebook for downloading and merging anime episodes from AnimeKai. Tsuki takes that concept and turns it into a full self-hosted web application with a decoupled service architecture.

## What changed from v1 (Ani-Downloader)?

The original [Ani-Downloader](https://github.com/Recho1337/Ani-Downloader) was a self-contained Flask web app built by [Recho1337](https://github.com/Recho1337) — a single process handling the UI, downloads, and file management. Tsuki is a ground-up rewrite that keeps the core scraping approach while splitting everything into dedicated services.

| | **v1 (Ani-Downloader)** | **Tsuki** |
|---|---|---|
| Backend | Flask 3.0 (monolith) | FastAPI + async, separate API & worker |
| Frontend | Jinja2 templates + vanilla JS | Next.js 16 / React 19 (standalone SPA) |
| Database | None — filesystem only | PostgreSQL (or SQLite for dev) |
| Job queue | Synchronous, in-process threads | Redis queue + standalone worker process |
| Auth | Flask session cookies | JWT tokens (24 h expiry) |
| Config | `os.environ.get()` | Pydantic Settings with `.env` support |
| Downloads | Flat folder | Organised into `tvshows/` and `films/` |
| Media type | Everything treated as TV | Auto-detects films vs series |
| Library | Basic file listing | Searchable, filterable, in-browser video playback |
| Monitoring | None | Connections page — live health of every service |
| Theme | Light only | Dark / light toggle, glassmorphism UI |
| VPN support | None | Worker can route through Gluetun |

## Architecture

```
┌───────────┐     ┌───────────┐     ┌───────┐     ┌────────┐
│  Frontend  │────▶│  Backend   │────▶│ Redis │◀────│ Worker │
│  (Next.js) │     │  (FastAPI) │     │       │     │        │
└───────────┘     └─────┬──────┘     └───────┘     └───┬────┘
                        │                               │
                   ┌────▼────┐                     ┌────▼────┐
                   │ Postgres │                     │  Files  │
                   │  (or     │                     │ tvshows/│
                   │  SQLite) │                     │ films/  │
                   └─────────┘                     └─────────┘
```

- **Frontend** — Next.js standalone app. Talks to the backend API only.
- **Backend** — FastAPI server. Handles auth, search, job creation, library browsing, and video streaming. Never downloads directly.
- **Worker** — Pulls job IDs from the Redis queue and runs the actual downloads (yt-dlp + ffmpeg). Can be placed behind a VPN container.
- **Redis** — Message broker between backend and worker; stores worker heartbeats.
- **PostgreSQL** — Persists download jobs, status, retry state. SQLite is supported for lightweight / dev usage.

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/Recho1337/Tsuki.git
cd Tsuki

# (optional) create a .env — see Environment Variables below
docker compose up -d
```

| Service | Default URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8001 |

Default credentials: `admin` / `admin`

### Local Development

#### Prerequisites

- Python 3.11+
- Node.js 20+
- Redis server running locally
- ffmpeg and yt-dlp installed
- (optional) PostgreSQL — defaults to SQLite if not configured

#### Backend + Worker

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start the API server
DOWNLOAD_FOLDER=./downloads uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# In a second terminal — start the worker
DOWNLOAD_FOLDER=./downloads python worker.py
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend auto-detects the backend at `window.location.hostname:8001`.

## Environment Variables

All configurable via `.env` file or `environment:` in docker-compose.

| Variable | Default | Description |
|---|---|---|
| `ANIME_USER` | `admin` | Login username |
| `ANIME_PASS` | `admin` | Login password |
| `SECRET_KEY` | `dev-secret-key-...` | JWT signing key — **change in production** |
| `DOWNLOAD_FOLDER` | `/app/downloads` | Container path for downloads |
| `DOWNLOAD_PATH` | `./downloads` | Host path mapped into the container |
| `DATABASE_URL` | `sqlite` | `sqlite` or `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `POSTGRES_USER` | `tsuki` | Postgres username |
| `POSTGRES_PASSWORD` | `tsuki` | Postgres password |
| `POSTGRES_DB` | `tsuki` | Postgres database name |
| `BACKEND_PORT` | `8001` | Host port for the backend API |
| `FRONTEND_PORT` | `3000` | Host port for the frontend |
| `NEXT_PUBLIC_API_URL` | `[none]` | Frontend API URL — set this to your domain (e.g. https://yourdomain.com) when running behind a reverse proxy

## Routing the Worker Through a VPN (Gluetun)

If you run [Gluetun](https://github.com/qdm12/gluetun) (or a similar VPN container), you can route **only the worker** through it so downloads are tunnelled while the rest of the stack stays on your normal network.

### Why only the worker?

The backend needs Docker DNS to reach Redis and Postgres by container name. Containers using `network_mode: "service:gluetun"` lose Docker DNS resolution. Since the worker is the only service that makes outbound requests to anime sites, it's the only one that benefits from VPN routing.

### Setup

The worker connects to Redis and Postgres via your **host's LAN IP** instead of container names, since it shares Gluetun's isolated network namespace.

```yaml
# In your main docker-compose.yml alongside Gluetun:

  tsuki-redis:
    image: redis:7-alpine
    container_name: tsuki-redis
    restart: unless-stopped
    ports:
      - "6380:6379"          # expose on host so worker can reach it
    volumes:
      - ./tsuki/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  tsuki-postgres:
    image: postgres:16-alpine
    container_name: tsuki-postgres
    restart: unless-stopped
    ports:
      - "5433:5432"          # expose on host so worker can reach it
    environment:
      POSTGRES_USER: tsuki
      POSTGRES_PASSWORD: tsuki
      POSTGRES_DB: tsuki
    volumes:
      - ./tsuki/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tsuki"]
      interval: 10s
      timeout: 3s
      retries: 3

  tsuki-backend:
    image: tsuki-backend:latest
    container_name: tsuki-backend
    restart: unless-stopped
    ports:
      - "8001:8001"
    environment:
      - DOWNLOAD_FOLDER=/app/downloads
      - REDIS_URL=redis://tsuki-redis:6379/0        # normal Docker DNS
      - DATABASE_URL=postgresql://tsuki:tsuki@tsuki-postgres:5432/tsuki
      - SECRET_KEY=change-me
      - ANIME_USER=admin
      - ANIME_PASS=admin
    volumes:
      - ./tsuki/downloads:/app/downloads
    depends_on:
      tsuki-redis:  { condition: service_healthy }
      tsuki-postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8001/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  tsuki-worker:
    image: tsuki-backend:latest
    container_name: tsuki-worker
    restart: unless-stopped
    command: ["python", "worker.py"]
    network_mode: "service:gluetun"                  # <-- VPN tunnel
    environment:
      - DOWNLOAD_FOLDER=/app/downloads
      - REDIS_URL=redis://192.168.0.87:6380/0        # host IP + exposed port
      - DATABASE_URL=postgresql://tsuki:tsuki@192.168.0.87:5433/tsuki
    volumes:
      - ./tsuki/downloads:/app/downloads
    depends_on:
      gluetun:        { condition: service_healthy }
      tsuki-redis:    { condition: service_healthy }
      tsuki-postgres: { condition: service_healthy }

  tsuki-frontend:
    image: tsuki-frontend:latest
    container_name: tsuki-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      - tsuki-backend
```

> **Important:** Replace `192.168.0.87` with your server's actual LAN IP. The Redis/Postgres ports (`6380`, `5433`) must not collide with other services on the host.

### Building the images

```bash
docker build -t tsuki-backend:latest ./backend
docker build --build-arg NEXT_PUBLIC_API_URL="" -t tsuki-frontend:latest ./frontend
```

## Project Structure

```
backend/
  main.py              FastAPI app + health endpoints
  worker.py            Standalone download worker
  app/
    config.py          Pydantic settings
    database.py        Async DB layer (SQLite / PostgreSQL)
    downloader.py      Core download engine (yt-dlp + cloudscraper)
    search.py          Anime search / scraping
    queue.py           Redis job queue
    auth.py            JWT authentication
    models.py          Request/response models
    routes/
      auth.py          Login endpoint
      download.py      Download management API
      library.py       Library browsing + video streaming
      search.py        Search API

frontend/
  src/
    app/               Next.js pages (dashboard, search, download, library, connections, login)
    components/        Shared UI (navbar, theme toggle, shadcn primitives)
    lib/               API client, auth context, download polling context
```

## Credits

- **Inspiration:** [Cinichi/Ani-Downloader](https://github.com/Cinichi/Ani-Downloader) — the original Colab notebook for downloading anime from AnimeKai.
- **v1 (Ani-Downloader):** [Recho1337/Ani-Downloader](https://github.com/Recho1337/Ani-Downloader) — the Flask web app that preceded this project.
- **Tsuki (v2):** [Recho1337](https://github.com/Recho1337) — full rewrite with Next.js, FastAPI, and worker architecture.

## License

MIT
