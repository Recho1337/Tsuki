"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, type JobStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface DownloadContextValue {
  jobs: JobStatus[];
  activeJobs: JobStatus[];
  finishedJobs: JobStatus[];
  refresh: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue>({
  jobs: [],
  activeJobs: [],
  finishedJobs: [],
  refresh: async () => {},
});

export function DownloadProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch {
      /* ignore - not logged in or server down */
    }
  }, [token]);

  const hasActive = jobs.some(
    (j) => !["completed", "failed"].includes(j.status)
  );

  useEffect(() => {
    if (!token) return;
    refresh();
    // Poll faster when downloads are active, slower when idle
    const interval = hasActive ? 2000 : 10000;
    const id = setInterval(refresh, interval);
    return () => clearInterval(id);
  }, [token, refresh, hasActive]);

  const activeJobs = jobs.filter(
    (j) => !["completed", "failed"].includes(j.status)
  );
  const finishedJobs = jobs.filter((j) =>
    ["completed", "failed"].includes(j.status)
  );

  return (
    <DownloadContext.Provider value={{ jobs, activeJobs, finishedJobs, refresh }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  return useContext(DownloadContext);
}
