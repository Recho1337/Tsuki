"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, type JobStatus } from "@/lib/api";
import { useDownloads } from "@/lib/download-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function DownloadPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh } = useDownloads();
  const [animeUrl, setAnimeUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill URL and image from search page
  useEffect(() => {
    const url = searchParams.get("url");
    const image = searchParams.get("image");
    if (url) setAnimeUrl(url);
    if (image) setImageUrl(image);
  }, [searchParams]);

  // Anime info
  const [animeInfo, setAnimeInfo] = useState<{
    anime_id: string;
    title: string;
    season: number;
    total_episodes: number;
    media_type: string;
    episodes: { id: string; title: string }[];
  } | null>(null);

  // Download config
  const [mediaType, setMediaType] = useState("tv");
  const [downloadMode, setDownloadMode] = useState("All Episodes");
  const [singleEpisode, setSingleEpisode] = useState("1");
  const [startEpisode, setStartEpisode] = useState("1");
  const [endEpisode, setEndEpisode] = useState("1");
  const [preferType, setPreferType] = useState("Soft Sub");
  const [preferServer, setPreferServer] = useState("Server 1");
  const [seasonNumber, setSeasonNumber] = useState(0);
  const [mergeEpisodes, setMergeEpisodes] = useState(false);
  const [keepIndividual, setKeepIndividual] = useState(false);

  // Active job tracking
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const pollJob = useCallback(async () => {
    if (jobId === null) return;
    try {
      const data = await api.getJobStatus(jobId);
      setJobStatus(data);
      if (data.status === "completed" || data.status === "failed") {
        setJobId(null);
      }
    } catch {
      /* ignore */
    }
  }, [jobId]);

  useEffect(() => {
    if (jobId === null) return;
    const id = setInterval(pollJob, 2000);
    return () => clearInterval(id);
  }, [jobId, pollJob]);

  const fetchInfo = async () => {
    if (!animeUrl) return;
    setLoading(true);
    setAnimeInfo(null);
    try {
      const data = await api.getAnimeInfo(animeUrl);
      if (data.error) {
        toast.error(data.error);
      } else {
        setAnimeInfo(data);
        setSeasonNumber(data.season);
        const type = data.media_type || "tv";
        setMediaType(type);
        if (type === "film") {
          // Films: auto-select the single episode, lock download mode
          setDownloadMode("All Episodes");
          toast.info("Detected as a film — will download the full file");
        }
        if (data.episodes.length > 0) {
          setEndEpisode(data.episodes[data.episodes.length - 1].id);
        }
      }
    } catch {
      toast.error("Failed to fetch anime info");
    } finally {
      setLoading(false);
    }
  };

  const startDownload = async () => {
    if (!animeUrl) return;
    try {
      const data = await api.startDownload({
        anime_url: animeUrl,
        image_url: imageUrl,
        media_type: mediaType,
        download_mode: downloadMode,
        single_episode: singleEpisode,
        start_episode: startEpisode,
        end_episode: endEpisode,
        prefer_type: preferType,
        prefer_server: preferServer,
        season_number: seasonNumber,
        merge_episodes: mergeEpisodes,
        keep_individual_files: keepIndividual,
      });
      setJobId(data.job_id);
      setJobStatus(null);
      toast.success(`Download started (Job #${data.job_id})`);
      refresh();
      router.push("/dashboard");
    } catch {
      toast.error("Failed to start download");
    }
  };

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Download</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste an anime URL to start downloading
        </p>
      </div>

      {/* URL Input */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Anime URL</CardTitle>
          <CardDescription>
            Paste a URL from anikai.to (e.g. https://anikai.to/watch/...)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Input
            placeholder="https://anikai.to/watch/..."
            value={animeUrl}
            onChange={(e) => setAnimeUrl(e.target.value)}
            className="flex-1"
          />
          <Button onClick={fetchInfo} disabled={loading || !animeUrl}>
            {loading ? "Loading…" : "Fetch Info"}
          </Button>
        </CardContent>
      </Card>

      {/* Anime Info + Config */}
      {animeInfo && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>{animeInfo.title}</CardTitle>
              <Badge variant={mediaType === "film" ? "default" : "secondary"}>
                {mediaType === "film" ? "Film" : "TV Series"}
              </Badge>
            </div>
            <CardDescription>
              {mediaType === "film"
                ? "Film · Single file download"
                : `${animeInfo.total_episodes} episodes · Season ${animeInfo.season}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Episode list preview */}
            {animeInfo.episodes.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Available Episodes
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {animeInfo.episodes.map((ep) => (
                    <Badge key={ep.id} variant="outline" className="text-xs border-primary/30 text-primary/80">
                      {ep.id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Download mode — hidden for films */}
            {mediaType !== "film" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Download Mode</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={downloadMode}
                  onChange={(e) => setDownloadMode(e.target.value)}
                >
                  <option>All Episodes</option>
                  <option>Single Episode</option>
                  <option>Episode Range</option>
                </select>
              </div>

              {downloadMode === "Single Episode" && (
                <div className="space-y-2">
                  <Label>Episode Number</Label>
                  <Input
                    value={singleEpisode}
                    onChange={(e) => setSingleEpisode(e.target.value)}
                  />
                </div>
              )}

              {downloadMode === "Episode Range" && (
                <>
                  <div className="space-y-2">
                    <Label>Start Episode</Label>
                    <Input
                      value={startEpisode}
                      onChange={(e) => setStartEpisode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Episode</Label>
                    <Input
                      value={endEpisode}
                      onChange={(e) => setEndEpisode(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Season Number</Label>
                <Input
                  type="number"
                  value={seasonNumber}
                  onChange={(e) => setSeasonNumber(Number(e.target.value))}
                />
              </div>
            </div>
            )}

            {/* Server preferences — shown for all */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Subtitle Type</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={preferType}
                  onChange={(e) => setPreferType(e.target.value)}
                >
                  <option>Soft Sub</option>
                  <option>Hard Sub</option>
                  <option>Dub (with subs)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Preferred Server</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={preferServer}
                  onChange={(e) => setPreferServer(e.target.value)}
                >
                  <option>Server 1</option>
                  <option>Server 2</option>
                  <option>Server 3</option>
                </select>
              </div>
            </div>

            {mediaType !== "film" && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergeEpisodes}
                  onChange={(e) => setMergeEpisodes(e.target.checked)}
                  className="rounded border-input bg-background text-primary focus:ring-ring"
                />
                <span>Merge episodes into single file</span>
              </label>
              {mergeEpisodes && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepIndividual}
                    onChange={(e) => setKeepIndividual(e.target.checked)}
                    className="rounded border-input bg-background text-primary focus:ring-ring"
                  />
                  <span>Keep individual files</span>
                </label>
              )}
            </div>
            )}

            <Button onClick={startDownload} size="lg">
              Start Download
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Job progress */}
      {jobStatus && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {jobStatus.anime_title || "Download"} — Job #{jobStatus.job_id}
              </CardTitle>
              <Badge
                variant={
                  jobStatus.status === "completed"
                    ? "default"
                    : jobStatus.status === "failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {jobStatus.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Progress value={jobStatus.progress} className="flex-1" />
              <span className="text-sm font-medium w-12 text-right tabular-nums">
                {jobStatus.progress}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Episode {jobStatus.current_episode || "—"} ·{" "}
              {jobStatus.completed_episodes}/{jobStatus.total_episodes}
            </p>
            {jobStatus.error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {jobStatus.error}
              </div>
            )}
            <ScrollArea className="h-40 rounded-md border border-border bg-muted/30 p-3 text-xs font-mono">
              {jobStatus.logs.map((log, i) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
