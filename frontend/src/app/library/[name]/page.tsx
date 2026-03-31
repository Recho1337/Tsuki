"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type AnimeFile } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnimeDetailPage() {
  const params = useParams<{ name: string }>();
  const animePath = decodeURIComponent(params.name);
  const animeName = animePath.split("/").pop() || animePath;

  const [files, setFiles] = useState<AnimeFile[]>([]);
  const [totalSizeMb, setTotalSizeMb] = useState(0);
  const [metadata, setMetadata] = useState<{
    title?: string;
    url?: string;
    image_url?: string;
    media_type?: string;
    season?: number;
    total_episodes?: number;
  }>({});
  const [loading, setLoading] = useState(true);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api
      .getAnimeFiles(animePath)
      .then((data) => {
        setFiles(data.files || []);
        setTotalSizeMb(data.total_size_mb || 0);
        setMetadata(data.metadata || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [animePath]);

  // Group files by season
  const seasons = files.reduce<Record<string, AnimeFile[]>>((acc, file) => {
    const key = file.season_folder || "Files";
    (acc[key] ??= []).push(file);
    return acc;
  }, {});

  const formatSize = (mb: number) =>
    mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;

  const getStreamUrl = (file: AnimeFile) =>
    api.getFileStreamUrl(`${animePath}/${file.relative_path}`);

  const getDownloadUrl = (file: AnimeFile) =>
    api.getFileDownloadUrl(`${animePath}/${file.relative_path}`);

  const handleDeleteFile = async (file: AnimeFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    setDeleting(file.relative_path);
    try {
      await api.deleteFile(`${animePath}/${file.relative_path}`);
      setFiles((prev) => prev.filter((f) => f.relative_path !== file.relative_path));
    } catch {
      alert("Failed to delete file");
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete "${animeName}" and all its files? This cannot be undone.`)) return;
    try {
      await api.deleteAnime(animePath);
      router.push("/library");
    } catch {
      alert("Failed to delete");
    }
  };

  return (
    <div className="space-y-8 animate-in">
      {/* Back to library */}
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Library
      </Link>

      {/* Header with optional cover image */}
      <div className="flex gap-6 items-start">
        {metadata.image_url && (
          <div className="hidden sm:block shrink-0 w-32 h-44 rounded-lg overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={metadata.image_url}
              alt={animeName}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{animeName}</h1>
            {metadata.media_type && (
              <Badge variant={metadata.media_type === "film" ? "default" : "secondary"}>
                {metadata.media_type === "film" ? "Film" : "TV"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {files.length} file{files.length !== 1 && "s"} · {formatSize(totalSizeMb)}
            {metadata.season ? ` · Season ${metadata.season}` : ""}
          </p>
          <div className="flex items-center gap-3 mt-3">
            {metadata.url && (
              <a
                href={metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View source page →
              </a>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              className="text-xs"
            >
              <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete All
            </Button>
          </div>
        </div>
      </div>

      {/* Inline video player */}
      {playingFile && (
        <Card id="video-player" className="border-primary/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium truncate mr-4">
              Now Playing
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlayingFile(null)}
              className="shrink-0"
            >
              ✕ Close Player
            </Button>
          </div>
          <CardContent className="p-0">
            <video
              key={playingFile}
              controls
              autoPlay
              className="w-full max-h-[70vh] bg-black"
              src={playingFile}
            >
              Your browser does not support video playback.
            </video>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card className="border-border">
          <CardContent className="space-y-3 py-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {!loading &&
        Object.entries(seasons).map(([season, seasonFiles]) => (
          <Card key={season} className="border-border overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {season}
                </CardTitle>
                <Badge variant="outline" className="border-primary/30 text-primary/80">
                  {seasonFiles.length} file{seasonFiles.length !== 1 && "s"}
                </Badge>
              </div>
              <CardDescription>
                {formatSize(seasonFiles.reduce((s, f) => s + f.size_mb, 0))}
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>File</TableHead>
                    <TableHead className="w-24 text-right">Size</TableHead>
                    <TableHead className="w-32 text-right">Modified</TableHead>
                    <TableHead className="w-36 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasonFiles.map((file) => (
                    <TableRow key={file.relative_path} className="border-border hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs truncate max-w-xs">
                        {file.name}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {file.size_gb >= 1
                          ? `${file.size_gb} GB`
                          : `${file.size_mb} MB`}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(file.modified).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <button
                          onClick={() => {
                            setPlayingFile(getStreamUrl(file));
                            setTimeout(() => {
                              document.getElementById("video-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 100);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-primary/10 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Watch
                        </button>
                        <a
                          href={getDownloadUrl(file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          disabled={deleting === file.relative_path}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {deleting === file.relative_path ? "..." : "Delete"}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

      {!loading && files.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">No media files found for this title.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
