"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type JobStatus } from "@/lib/api";
import { useDownloads } from "@/lib/download-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "default" as const;
    case "failed":
      return "destructive" as const;
    case "downloading":
    case "merging":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function elapsed(seconds: number | null) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function QueueDetailPage() {
  const params = useParams();
  const jobId = Number(params.id);
  const { refresh } = useDownloads();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  const loadJob = useCallback(async () => {
    try {
      const data = await api.getJobStatus(jobId);
      if (!data || !data.job_id) {
        setJob(null);
      } else {
        setJob(data);
      }
    } catch {
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadJob();
    const id = setInterval(loadJob, 2000);
    return () => clearInterval(id);
  }, [loadJob]);

  // Auto-scroll logs
  useEffect(() => {
    if (!autoScroll || !job) return;
    const el = document.getElementById("log-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.logs.length, autoScroll, job]);

  const handleRetry = async () => {
    if (!job) return;
    await api.retryJob(job.job_id);
    refresh();
    await loadJob();
  };

  const handleClear = async () => {
    if (!job) return;
    await api.clearJob(job.job_id);
    refresh();
    window.location.href = "/queue";
  };

  const isActive = job
    ? !["completed", "failed"].includes(job.status)
    : false;

  if (loading) {
    return (
      <div className="space-y-4 animate-in">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4 animate-in">
        <Link
          href="/queue"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to queue
        </Link>
        <Card className="border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            Job not found
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressPercent = job.total_episodes > 0
    ? Math.round((job.completed_episodes / job.total_episodes) * 100)
    : job.progress;

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/queue"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to queue
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            {job.anime_title || job.anime_url}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {job.season && (
              <span className="text-sm text-muted-foreground">
                Season {job.season}
              </span>
            )}
            <Badge variant={statusColor(job.status)}>{job.status}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.status === "failed" && (
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          )}
          {["completed", "failed"].includes(job.status) && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Progress card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Progress value={progressPercent} className="flex-1" />
            <span className="text-lg font-semibold tabular-nums w-14 text-right">
              {progressPercent}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Episodes
              </p>
              <p className="text-sm font-medium tabular-nums">
                {job.completed_episodes} / {job.total_episodes}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Current
              </p>
              <p className="text-sm font-medium">
                {job.current_episode || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Elapsed
              </p>
              <p className="text-sm font-medium">
                {elapsed(job.elapsed_seconds)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Retries
              </p>
              <p className="text-sm font-medium tabular-nums">
                {job.retry_count} / {job.max_retries}
              </p>
            </div>
          </div>

          {job.error && (
            <>
              <Separator />
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive font-medium">Error</p>
                <p className="text-sm text-destructive/80 mt-1">{job.error}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Time info */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">{formatTime(job.start_time)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Finished</span>
              <p className="font-medium">{formatTime(job.end_time)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">URL</span>
              <p className="font-medium truncate">{job.anime_url}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Job ID</span>
              <p className="font-medium tabular-nums">{job.job_id}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Logs ({job.logs.length})
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              {autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
            </Button>
          </div>
          {isActive && (
            <CardDescription>Live — updates every 2s</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <ScrollArea
            id="log-scroll"
            className="h-64 rounded-md border border-border bg-muted/30 p-3 text-xs font-mono"
          >
            {job.logs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet</p>
            ) : (
              job.logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.level === "ERROR"
                      ? "text-destructive"
                      : log.level === "WARN"
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  }
                >
                  <span className="opacity-50">[{log.timestamp}]</span>{" "}
                  <span className="opacity-60">[{log.level}]</span> {log.message}
                </div>
              ))
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Downloaded files */}
      {job.downloaded_files.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Downloaded Files ({job.downloaded_files.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              {job.downloaded_files.map((f, i) => (
                <p key={i} className="truncate">
                  {f}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
