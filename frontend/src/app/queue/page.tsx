"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function mediaTypeLabel(job: JobStatus) {
  const config = job as unknown as { config?: { media_type?: string } };
  // media_type may be on job directly from DB or inside config
  const mt =
    (job as unknown as Record<string, unknown>).media_type ??
    config?.config?.media_type ??
    "tv";
  return mt === "film" ? "Film" : "TV";
}

export default function QueuePage() {
  const { jobs, activeJobs, finishedJobs, refresh } = useDownloads();
  const [queueOrder, setQueueOrder] = useState<JobStatus[]>([]);
  const [filter, setFilter] = useState<"all" | "tv" | "film">("all");

  const loadQueue = useCallback(async () => {
    try {
      const order = await api.getQueueOrder();
      setQueueOrder(order);
    } catch {
      setQueueOrder([]);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 5000);
    return () => clearInterval(id);
  }, [loadQueue]);

  const moveJob = async (jobId: number, direction: "up" | "down") => {
    const idx = queueOrder.findIndex((j) => j.job_id === jobId);
    if (idx === -1) return;
    const newPos = direction === "up" ? idx - 1 : idx + 1;
    if (newPos < 0 || newPos >= queueOrder.length) return;
    await api.moveJobInQueue(jobId, newPos);
    await loadQueue();
  };

  const moveToTop = async (jobId: number) => {
    await api.moveJobInQueue(jobId, 0);
    await loadQueue();
  };

  const handleRetry = async (jobId: number) => {
    await api.retryJob(jobId);
    refresh();
    await loadQueue();
  };

  const handleClear = async (jobId: number) => {
    await api.clearJob(jobId);
    refresh();
  };

  // The currently downloading job
  const leadJob = activeJobs[0] ?? null;

  // All jobs for the list views
  const allJobs = [...(leadJob ? [leadJob] : []), ...queueOrder, ...finishedJobs];

  const filterJob = (job: JobStatus) => {
    if (filter === "all") return true;
    const mt = mediaTypeLabel(job);
    return filter === "film" ? mt === "Film" : mt === "TV";
  };

  const filteredQueue = queueOrder.filter(filterJob);
  const filteredFinished = finishedJobs.filter(filterJob);

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage download order and priority
        </p>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="tv">TV Shows</TabsTrigger>
          <TabsTrigger value="film">Films</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Currently downloading */}
      {leadJob && filterJob(leadJob) && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Now Downloading
          </h2>
          <Link href={`/queue/${leadJob.job_id}`}>
            <Card className="border-border border-l-2 border-l-primary hover:bg-muted/30 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {leadJob.anime_title || leadJob.anime_url}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {mediaTypeLabel(leadJob)}
                    </Badge>
                    <Badge variant={statusColor(leadJob.status)}>{leadJob.status}</Badge>
                  </div>
                </div>
                {leadJob.season ? (
                  <CardDescription>Season {leadJob.season}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
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
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Pending queue — reorderable */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Up Next ({filteredQueue.length})
        </h2>
        {filteredQueue.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No jobs waiting in queue
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border divide-y divide-border">
            {filteredQueue.map((job, idx) => (
              <div
                key={job.job_id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                {/* Position number */}
                <span className="text-sm font-medium text-muted-foreground w-6 text-center tabular-nums">
                  {idx + 1}
                </span>

                {/* Job info — clickable */}
                <Link
                  href={`/queue/${job.job_id}`}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium truncate hover:text-primary transition-colors">
                    {job.anime_title || job.anime_url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.season ? `S${job.season} · ` : ""}
                    {job.total_episodes > 0
                      ? `${job.completed_episodes}/${job.total_episodes} eps`
                      : job.status}
                  </p>
                </Link>

                {/* Media type + status badges */}
                <Badge variant="outline" className="text-xs shrink-0">
                  {mediaTypeLabel(job)}
                </Badge>
                <Badge variant={statusColor(job.status)} className="text-xs shrink-0">
                  {job.status}
                </Badge>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    disabled={idx === 0}
                    onClick={() => moveJob(job.job_id, "up")}
                    title="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    disabled={idx === filteredQueue.length - 1}
                    onClick={() => moveJob(job.job_id, "down")}
                    title="Move down"
                  >
                    ↓
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                  disabled={idx === 0}
                  onClick={() => moveToTop(job.job_id)}
                  title="Move to top"
                >
                  ⇈
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Completed / Failed history */}
      {filteredFinished.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            History ({filteredFinished.length})
          </h2>
          <Card className="border-border divide-y divide-border">
            {filteredFinished.map((job) => (
              <div
                key={job.job_id}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors ${
                  job.status === "failed" ? "border-l-2 border-l-destructive" : ""
                }`}
              >
                <Link
                  href={`/queue/${job.job_id}`}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium truncate hover:text-primary transition-colors">
                    {job.anime_title || job.anime_url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.completed_episodes}/{job.total_episodes} episodes ·{" "}
                    {elapsed(job.elapsed_seconds)}
                  </p>
                </Link>
                <Badge variant="outline" className="text-xs shrink-0">
                  {mediaTypeLabel(job)}
                </Badge>
                <Badge variant={statusColor(job.status)} className="text-xs shrink-0">
                  {job.status}
                </Badge>
                <div className="flex items-center gap-1 shrink-0">
                  {job.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleRetry(job.job_id)}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleClear(job.job_id)}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ))}
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
