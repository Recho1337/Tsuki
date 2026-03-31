const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `http://${window.location.hostname}:8001`
    : "http://localhost:8001");

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const data = await res.json();
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    apiFetch<{ token: string; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  searchAnime: (query: string) =>
    apiFetch<{
      query: string;
      results: { title: string; url: string; image: string; anime_id: string }[];
      count: number;
    }>(`/api/search/anime?q=${encodeURIComponent(query)}`),

  getAnimeInfo: (animeUrl: string) =>
    apiFetch<{
      anime_id: string;
      title: string;
      season: number;
      total_episodes: number;
      media_type: string;
      episodes: { id: string; title: string }[];
      error?: string;
    }>("/api/download/anime/info", {
      method: "POST",
      body: JSON.stringify({ anime_url: animeUrl }),
    }),

  startDownload: (config: Record<string, unknown>) =>
    apiFetch<{ job_id: number; message: string }>("/api/download/start", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getJobStatus: (jobId: number) =>
    apiFetch<JobStatus>(`/api/download/status/${jobId}`),

  listJobs: () => apiFetch<JobStatus[]>("/api/download/list"),

  clearJob: (jobId: number) =>
    apiFetch(`/api/download/clear/${jobId}`, { method: "DELETE" }),

  retryJob: (jobId: number) =>
    apiFetch<{ job_id: number; message: string }>(`/api/download/retry/${jobId}`, {
      method: "POST",
    }),

  listLibrary: () =>
    apiFetch<
      { name: string; path: string; total_files: number; total_size_mb: number; seasons: string[]; media_type: string; image_url: string; url: string }[]
    >("/api/library/list"),

  getAnimeFiles: (animePath: string) =>
    apiFetch<{
      anime_name: string;
      anime_path: string;
      files: AnimeFile[];
      total_files: number;
      total_size_mb: number;
      metadata: { title?: string; url?: string; image_url?: string; media_type?: string; season?: number; total_episodes?: number };
    }>(`/api/library/anime/${animePath}`),

  getFileDownloadUrl: (relativePath: string) => {
    const token = getToken();
    return `${API_BASE}/api/library/file/${relativePath}${token ? `?token=${token}` : ""}`;
  },

  getFileStreamUrl: (relativePath: string) => {
    const token = getToken();
    return `${API_BASE}/api/library/stream/${relativePath}${token ? `?token=${token}` : ""}`;
  },

  deleteFile: (relativePath: string) =>
    apiFetch<{ message: string }>(`/api/library/file/${relativePath}`, {
      method: "DELETE",
    }),

  deleteAnime: (animePath: string) =>
    apiFetch<{ message: string }>(`/api/library/anime/${animePath}`, {
      method: "DELETE",
    }),

  getServicesHealth: () =>
    apiFetch<Record<string, { name: string; status: string; detail: string }>>(
      "/api/health/services"
    ),
};

export interface JobStatus {
  job_id: number;
  anime_url: string;
  anime_title: string | null;
  season: number | null;
  status: string;
  progress: number;
  current_episode: string | null;
  total_episodes: number;
  completed_episodes: number;
  logs: { timestamp: string; level: string; message: string }[];
  error: string | null;
  downloaded_files: string[];
  merged_file: string | null;
  elapsed_seconds: number | null;
  start_time: string;
  end_time: string | null;
  retry_count: number;
  max_retries: number;
}

export interface AnimeFile {
  name: string;
  relative_path: string;
  season_folder: string | null;
  size: number;
  size_mb: number;
  size_gb: number;
  modified: string;
}
