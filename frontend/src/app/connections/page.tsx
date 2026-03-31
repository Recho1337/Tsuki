"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ServiceInfo {
  name: string;
  status: string;
  detail: string;
}

type Services = Record<string, ServiceInfo>;

const SERVICE_ORDER = ["backend", "redis", "worker", "database"];

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  backend: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  ),
  redis: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  worker: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
    </svg>
  ),
  database: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
    </svg>
  ),
};

export default function ConnectionsPage() {
  const [services, setServices] = useState<Services | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchServices = async () => {
    try {
      const data = await api.getServicesHealth();
      setServices(data);
      setLastChecked(new Date());
    } catch {
      // If backend is unreachable, show everything as offline
      setServices({
        backend: { name: "Backend API", status: "offline", detail: "Not reachable" },
        redis: { name: "Redis", status: "unknown", detail: "Cannot check" },
        worker: { name: "Download Worker", status: "unknown", detail: "Cannot check" },
        database: { name: "Database", status: "unknown", detail: "Cannot check" },
      });
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 5000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = services
    ? Object.values(services).filter((s) => s.status === "online").length
    : 0;
  const totalCount = services ? Object.keys(services).length : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Checking services..."
              : `${onlineCount} of ${totalCount} online`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await api.recoverStuckJobs();
                if (res.recovered > 0) {
                  toast.success(res.message);
                } else {
                  toast.info("No stuck jobs found");
                }
              } catch {
                toast.error("Failed to recover jobs");
              }
            }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Recover Stuck Jobs
          </button>
          {lastChecked && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Updated {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Summary pill */}
      {services && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
            onlineCount === totalCount
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500"
              : onlineCount > 0
              ? "border-amber-500/30 bg-amber-500/5 text-amber-500"
              : "border-red-500/30 bg-red-500/5 text-red-500"
          }`}
        >
          <span className="relative flex h-2.5 w-2.5">
            {onlineCount === totalCount && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                onlineCount === totalCount
                  ? "bg-emerald-500"
                  : onlineCount > 0
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
            />
          </span>
          {onlineCount === totalCount
            ? "All systems operational"
            : onlineCount > 0
            ? "Some services degraded"
            : "All services offline"}
        </div>
      )}

      {/* Service cards */}
      <div className="space-y-3">
        {loading && !services
          ? SERVICE_ORDER.map((key) => (
              <div
                key={key}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))
          : SERVICE_ORDER.map((key) => {
              const svc = services?.[key];
              if (!svc) return null;
              const isOnline = svc.status === "online";
              const isUnknown = svc.status === "unknown";
              return (
                <div
                  key={key}
                  className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                    isOnline
                      ? "border-border bg-card"
                      : isUnknown
                      ? "border-border bg-card"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isOnline
                        ? "bg-emerald-500/10 text-emerald-500"
                        : isUnknown
                        ? "bg-muted text-muted-foreground"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {SERVICE_ICONS[key]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{svc.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {svc.detail}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${
                        isOnline
                          ? "bg-emerald-500"
                          : isUnknown
                          ? "bg-muted-foreground"
                          : "bg-red-500"
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        isOnline
                          ? "text-emerald-500"
                          : isUnknown
                          ? "text-muted-foreground"
                          : "text-red-500"
                      }`}
                    >
                      {isOnline ? "Online" : isUnknown ? "Unknown" : "Offline"}
                    </span>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
