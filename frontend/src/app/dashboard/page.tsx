"use client";

import { useState } from "react";
import { useDownloads } from "@/lib/download-context";
import { api, type JobStatus } from "@/lib/api";
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

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "downloading":
    case "merging":
      return "secondary";
    default:
      return "outline";
  }
}

function elapsed(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const MAX_VISIBLE_ACTIVE = 3;
const MAX_VISIBLE_HISTORY = 5;

export default function DashboardPage() {
  const { jobs, activeJobs, finishedJobs, refresh } = useDownloads();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<number | null>(null);

  const handleRetry = async (jobId: number) => {
    await api.retryJob(jobId);
    refresh();
  };

  const handleClear = async (jobId: number) => {
    await api.clearJob(jobId);
    refresh();
  };

  // Split active jobs: first one gets full detail, rest get compact rows
  const leadJob = activeJobs[0] ?? null;
  const queuedJobs = activeJobs.slice(1);
  const visibleQueued = showAllActive
    ? queuedJobs
    : queuedJobs.slice(0, MAX_VISIBLE_ACTIVE - 1);
  const hiddenQueuedCount = queuedJobs.length - visibleQueued.length;

  const visibleHistory = showAllHistory
    ? finishedJobs
    : finishedJobs.slice(0, MAX_VISIBLE_HISTORY);
  const hiddenHistoryCount = finishedJobs.length - visibleHistory.length;

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor active and completed downloads
        </p>
      </div>

      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground">Active</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">{activeJobs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground">Completed</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {finishedJobs.filter((j) => j.status === "completed").length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider text-muted-foreground">Failed</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {finishedJobs.filter((j) => j.status === "failed").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Currently downloading — full detail for lead job */}
      {leadJob && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Now Downloading
          </h2>
          <Card className="border-border border-l-2 border-l-primary overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {leadJob.anime_title || leadJob.anime_url}
                </CardTitle>
                <Badge variant={statusColor(leadJob.status)}>{leadJob.status}</Badge>
              </div>
              {leadJob.season ? (
                <CardDescription>Season {leadJob.season}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress value={leadJob.progress} className="flex-1" />
                <span className="text-sm font-medium w-12 text-right tabular-nums">
                  {leadJob.progress}%
                </span>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>
                  Episode {leadJob.current_episode || "—"} ·{" "}
                  {leadJob.completed_episodes}/{leadJob.total_episodes}
                </span>
                <span>{elapsed(leadJob.elapsed_seconds)}</span>
              </div>
              {/* Collapsible logs */}
              <button
                onClick={() => setExpandedLogs(expandedLogs === leadJob.job_id ? null : leadJob.job_id)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expandedLogs === leadJob.job_id ? "Hide logs ▲" : "Show logs ▼"}
              </button>
              {expandedLogs === leadJob.job_id && (
                <ScrollArea className="h-32 rounded-md border border-border bg-muted/30 p-3 text-xs font-mono">
                  {leadJob.logs.map((log, i) => (
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
                      <span className="opacity-50">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Queued — compact rows */}
      {queuedJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Queue ({queuedJobs.length})
          </h2>
          <Card className="border-border divide-y divide-border">
            {visibleQueued.map((job) => (
              <div key={job.job_id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {job.anime_title || job.anime_url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.season ? `S${job.season} · ` : ""}
                    {job.total_episodes > 0
                      ? `${job.completed_episodes}/${job.total_episodes} eps`
                      : job.status}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Progress value={job.progress} className="w-24" />
                  <span className="text-xs tabular-nums w-8 text-right">{job.progress}%</span>
                  <Badge variant={statusColor(job.status)} className="text-xs">{job.status}</Badge>
                </div>
              </div>
            ))}
            {hiddenQueuedCount > 0 && (
              <div className="px-4 py-2">
                <button
                  onClick={() => setShowAllActive(!showAllActive)}
                  className="text-xs text-primary hover:underline"
                >
                  {showAllActive ? "Show less" : `+${hiddenQueuedCount} more in queue`}
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Finished jobs */}
      {finishedJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">History</h2>
          <Card className="border-border divide-y divide-border">
            {visibleHistory.map((job) => (
              <div
                key={job.job_id}
                className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                  job.status === "failed" ? "border-l-2 border-l-destructive" : ""
                }`}
                onClick={() =>
                  setExpanded(expanded === job.job_id ? null : job.job_id)
                }
              >
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {job.anime_title || job.anime_url}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {job.completed_episodes}/{job.total_episodes} episodes ·{" "}
                      {elapsed(job.elapsed_seconds)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusColor(job.status)} className="text-xs">
                      {job.status}
                    </Badge>
                    {job.status === "failed" &&
                      job.retry_count < job.max_retries && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(job.job_id);
                          }}
                        >
                          Retry
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClear(job.job_id);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {expanded === job.job_id && (
                  <div className="px-4 pb-3 space-y-2">
                    {job.error && (
                      <p className="text-sm text-destructive">Error: {job.error}</p>
                    )}
                    {job.downloaded_files.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {job.downloaded_files.slice(0, 5).map((f, i) => (
                          <p key={i} className="truncate">{f}</p>
                        ))}
                        {job.downloaded_files.length > 5 && (
                          <p className="text-primary">+{job.downloaded_files.length - 5} more files</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {hiddenHistoryCount > 0 && (
              <div className="px-4 py-2">
                <button
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="text-xs text-primary hover:underline"
                >
                  {showAllHistory ? "Show less" : `+${hiddenHistoryCount} more`}
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {jobs.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              No download jobs yet.{" "}
              <a href="/download" className="text-primary hover:underline">
                Start a download
              </a>{" "}
              or{" "}
              <a href="/search" className="text-primary hover:underline">
                search for anime
              </a>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
