"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface LibraryItem {
  name: string;
  path: string;
  total_files: number;
  total_size_mb: number;
  seasons: string[];
  media_type: string;
  image_url: string;
  url: string;
}

export default function LibraryPage() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .listLibrary()
      .then(setLibrary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = library.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.media_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? "Loading..."
              : `${filtered.length} title${filtered.length !== 1 ? "s" : ""}${search ? " matching" : ""}`}
          </p>
        </div>
        <Input
          placeholder="Search library..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border">
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <Link key={item.path} href={`/library/${encodeURIComponent(item.path)}`}>
              <Card className="border-border transition-colors duration-200 hover:border-primary/40 cursor-pointer h-full group overflow-hidden">
                {item.image_url ? (
                  <div className="relative h-48 overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                      <p className="text-sm font-medium text-white line-clamp-2 drop-shadow-sm">
                        {item.name}
                      </p>
                      <Badge variant={item.media_type === "film" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                        {item.media_type === "film" ? "Film" : "TV"}
                      </Badge>
                    </div>
                  </div>
                ) : null}
                <CardHeader className={item.image_url ? "pt-3" : ""}>
                  {!item.image_url && (
                    <CardTitle className="text-base line-clamp-2 group-hover:text-primary transition-colors">
                      {item.name}
                    </CardTitle>
                  )}
                  <CardDescription className="flex items-center gap-2 flex-wrap mt-1">
                    <span>{item.total_files} file{item.total_files !== 1 && "s"}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>
                      {item.total_size_mb >= 1024
                        ? `${(item.total_size_mb / 1024).toFixed(1)} GB`
                        : `${item.total_size_mb} MB`}
                    </span>
                    {item.seasons.length > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        {item.seasons.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs border-primary/30 text-primary/80">
                            {s}
                          </Badge>
                        ))}
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              {search
                ? `No results for "${search}"`
                : "Your library is empty. Download some anime to see it here."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
